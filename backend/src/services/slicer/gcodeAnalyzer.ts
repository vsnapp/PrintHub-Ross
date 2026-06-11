import fs from 'fs';

export interface GcodeMetadata {
  printTimeSeconds: number | null;
  filamentGrams: number | null;
  filamentMm: number | null;
  layerCount: number | null;
}

function parseDurationString(value: string): number | null {
  // Matches formats like "1d 2h 3m 4s", "2h 3m", "45m 12s", "90s"
  const pattern = /(?:(\d+)\s*d)?\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?/;
  const match = value.trim().match(pattern);
  if (!match || match[0].trim() === '') {
    return null;
  }
  const [, d, h, m, s] = match;
  const seconds =
    (Number.parseInt(d || '0', 10) * 86400) +
    (Number.parseInt(h || '0', 10) * 3600) +
    (Number.parseInt(m || '0', 10) * 60) +
    Number.parseInt(s || '0', 10);
  return seconds > 0 ? seconds : null;
}

/**
 * Extract print metadata from gcode comments produced by Cura, PrusaSlicer,
 * OrcaSlicer and Bambu Studio.
 */
export function analyzeGcode(gcodePath: string): GcodeMetadata {
  const content = fs.readFileSync(gcodePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  let printTimeSeconds: number | null = null;
  let filamentGrams: number | null = null;
  let filamentMm: number | null = null;
  let filamentCm3: number | null = null;
  let layerCount: number | null = null;
  let layerChangeCount = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith(';')) {
      continue;
    }

    if (/^;LAYER_CHANGE/i.test(line)) {
      layerChangeCount += 1;
      continue;
    }

    // Cura: ;TIME:12345
    if (printTimeSeconds === null) {
      const curaTime = line.match(/^;TIME:(\d+)/);
      if (curaTime) {
        printTimeSeconds = Number.parseInt(curaTime[1], 10);
        continue;
      }
    }

    // PrusaSlicer: ; estimated printing time (normal mode) = 1h 32m 16s
    if (printTimeSeconds === null && /estimated printing time/i.test(line)) {
      const idx = line.indexOf('=');
      if (idx >= 0) {
        printTimeSeconds = parseDurationString(line.slice(idx + 1));
        continue;
      }
    }

    // Orca/Bambu: ; total estimated time: 1h 32m 16s  (or "; model printing time: ...")
    if (printTimeSeconds === null && /total estimated time:/i.test(line)) {
      const idx = line.indexOf(':');
      printTimeSeconds = parseDurationString(line.slice(idx + 1));
      continue;
    }
    if (printTimeSeconds === null && /model printing time:/i.test(line)) {
      const idx = line.indexOf(':');
      printTimeSeconds = parseDurationString(line.slice(idx + 1));
      continue;
    }

    // Filament weight: "; filament used [g] = 12.34" (Prusa) / "; total filament weight [g] : 12.3" (Orca).
    // PrusaSlicer reports 0.00 when no filament density is configured; treat that as unknown.
    if (filamentGrams === null) {
      const weight = line.match(/filament(?:\s+used)?(?:\s+weight)?\s*\[?g\]?\s*[:=]\s*([\d.]+)/i)
        || line.match(/^;Filament weight:\s*([\d.]+)/i);
      if (weight) {
        const grams = Number.parseFloat(weight[1]);
        if (grams > 0) {
          filamentGrams = grams;
        }
        continue;
      }
    }

    // Filament volume: "; filament used [cm3] = 3.29" (Prusa)
    if (filamentCm3 === null) {
      const volume = line.match(/filament used \[cm3\]\s*=\s*([\d.]+)/i);
      if (volume) {
        filamentCm3 = Number.parseFloat(volume[1]);
        continue;
      }
    }

    // Filament length: "; filament used [mm] = 1234.5" (Prusa) / ";Filament used: 1.23456m" (Cura)
    if (filamentMm === null) {
      const prusaLen = line.match(/filament used \[mm\]\s*=\s*([\d.]+)/i);
      if (prusaLen) {
        filamentMm = Number.parseFloat(prusaLen[1]);
        continue;
      }
      const curaLen = line.match(/^;Filament used:\s*([\d.]+)\s*m/i);
      if (curaLen) {
        filamentMm = Number.parseFloat(curaLen[1]) * 1000;
        continue;
      }
    }

    // Layer count: ";LAYER_COUNT:123" (Cura) / "; total layer number: 123" (Orca)
    if (layerCount === null) {
      const cura = line.match(/^;LAYER_COUNT:(\d+)/i);
      if (cura) {
        layerCount = Number.parseInt(cura[1], 10);
        continue;
      }
      const orca = line.match(/total layer num(?:ber)?\s*:\s*(\d+)/i);
      if (orca) {
        layerCount = Number.parseInt(orca[1], 10);
        continue;
      }
    }
  }

  // Derive weight from volume or length when grams aren't reported (PLA, 1.75mm).
  const plaDensity = 1.24;
  if (filamentGrams === null && filamentCm3 !== null) {
    filamentGrams = Math.round(filamentCm3 * plaDensity * 10) / 10;
  }
  if (filamentGrams === null && filamentMm !== null) {
    const radiusMm = 1.75 / 2;
    const volumeCm3 = (Math.PI * radiusMm * radiusMm * filamentMm) / 1000;
    filamentGrams = Math.round(volumeCm3 * plaDensity * 10) / 10;
  }

  // PrusaSlicer marks layers with ;LAYER_CHANGE rather than a total count.
  if (layerCount === null && layerChangeCount > 0) {
    layerCount = layerChangeCount;
  }

  return { printTimeSeconds, filamentGrams, filamentMm, layerCount };
}

/**
 * Sanity-check that a gcode file contains actual extrusion moves.
 */
export function validateGcode(gcodePath: string): { valid: boolean; reason?: string } {
  try {
    const stat = fs.statSync(gcodePath);
    if (stat.size < 200) {
      return { valid: false, reason: 'Output gcode file is too small to be a valid slice.' };
    }

    const content = fs.readFileSync(gcodePath, 'utf-8');
    const lines = content.split(/\r?\n/);

    let extrusionMoves = 0;
    let currentE = 0;
    let absoluteExtrusion = true;

    for (const raw of lines) {
      const line = raw.trim().toUpperCase();
      if (!line || line.startsWith(';')) {
        continue;
      }
      if (line === 'M82') {
        absoluteExtrusion = true;
        continue;
      }
      if (line === 'M83') {
        absoluteExtrusion = false;
        continue;
      }
      if (line.startsWith('G92')) {
        const reset = line.match(/E(-?\d*\.?\d+)/);
        if (reset) {
          currentE = Number.parseFloat(reset[1]);
        }
        continue;
      }
      if (!/^G[0123]\b/.test(line)) {
        continue;
      }
      const extrusion = line.match(/E(-?\d*\.?\d+)/);
      if (!extrusion) {
        continue;
      }
      const value = Number.parseFloat(extrusion[1]);
      const isExtruding = absoluteExtrusion ? value > currentE + 1e-5 : value > 1e-5;
      if (isExtruding) {
        extrusionMoves += 1;
        if (extrusionMoves > 10) {
          return { valid: true };
        }
      }
      currentE = absoluteExtrusion ? value : currentE + value;
    }

    if (extrusionMoves === 0) {
      return { valid: false, reason: 'No extrusion moves found in generated gcode.' };
    }
    return { valid: true };
  } catch (error: any) {
    return { valid: false, reason: error?.message || 'Failed to inspect generated gcode.' };
  }
}

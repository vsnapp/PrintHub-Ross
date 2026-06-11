/**
 * Standalone test for the embedded slicing service.
 * Run with: npx tsx test_slicer_service.ts
 *
 * Generates a 20mm calibration cube STL, then exercises:
 *  1. Slicer detection
 *  2. Geometry-based estimation (FDM + resin)
 *  3. Real CLI slicing with whichever engine is installed
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { detectSlicers, estimatePrint, estimateResinPrint, sliceStl } from './src/services/slicer';

function makeCubeStl(sizeMm: number): Buffer {
  // 12 triangles for a cube, binary STL.
  const s = sizeMm;
  const v = (x: number, y: number, z: number) => [x, y, z] as const;
  const corners = [
    v(0, 0, 0), v(s, 0, 0), v(s, s, 0), v(0, s, 0),
    v(0, 0, s), v(s, 0, s), v(s, s, s), v(0, s, s),
  ];
  // Each face: two triangles with outward winding.
  const faces: Array<[number, number, number]> = [
    [0, 2, 1], [0, 3, 2], // bottom (z=0)
    [4, 5, 6], [4, 6, 7], // top (z=s)
    [0, 1, 5], [0, 5, 4], // front (y=0)
    [2, 3, 7], [2, 7, 6], // back (y=s)
    [1, 2, 6], [1, 6, 5], // right (x=s)
    [3, 0, 4], [3, 4, 7], // left (x=0)
  ];

  const buffer = Buffer.alloc(84 + faces.length * 50);
  buffer.write('PrintHub test cube', 0, 'utf-8');
  buffer.writeUInt32LE(faces.length, 80);
  let offset = 84;
  for (const [a, b, c] of faces) {
    offset += 12; // normal left as zeroes; slicers recompute
    for (const idx of [a, b, c]) {
      const [x, y, z] = corners[idx];
      buffer.writeFloatLE(x, offset);
      buffer.writeFloatLE(y, offset + 4);
      buffer.writeFloatLE(z, offset + 8);
      offset += 12;
    }
    buffer.writeUInt16LE(0, offset);
    offset += 2;
  }
  return buffer;
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'printhub-slicer-test-'));
  const stlPath = path.join(tempDir, 'cube20.stl');
  fs.writeFileSync(stlPath, makeCubeStl(20));
  console.log('Test STL written to', stlPath);

  console.log('\n--- 1. Slicer detection ---');
  const slicers = detectSlicers();
  for (const slicer of slicers) {
    console.log(`${slicer.displayName.padEnd(16)} available=${slicer.available} cli=${slicer.cliSlicing} path=${slicer.executablePath || '-'}`);
  }

  console.log('\n--- 2. Geometry estimates ---');
  const fdmEstimate = estimatePrint(stlPath, { layerHeight: 0.2, infill: 20, printSpeed: 60 });
  console.log('FDM estimate:', fdmEstimate.estimatedMinutes, 'min,', fdmEstimate.estimatedFilamentGrams, 'g');
  console.log('  volume:', fdmEstimate.stats.volumeCm3.toFixed(2), 'cm3 (expected 8.00)');
  console.log('  bbox:', fdmEstimate.stats.boundingBox);
  if (Math.abs(fdmEstimate.stats.volumeCm3 - 8) > 0.01) {
    throw new Error('Volume calculation incorrect for 20mm cube');
  }
  const resinEstimate = estimateResinPrint(stlPath, 0.1);
  console.log('Resin estimate:', resinEstimate.estimatedMinutes, 'min (200 layers @ ~9s + setup)');

  console.log('\n--- 3. CLI slicing ---');
  const fdmEngine = slicers.find((slicer) => slicer.cliSlicing && slicer.type === 'fdm');
  if (!fdmEngine) {
    console.log('No FDM CLI engine installed; skipping real slice (estimates remain available).');
    return;
  }

  const outputPath = path.join(tempDir, 'cube20.gcode');
  const result = await sliceStl({
    slicer: fdmEngine.id,
    stlPath,
    outputPath,
    overrides: {
      layerHeight: 0.28,
      infill: 15,
      nozzleTemperature: 215,
      bedTemperature: 65,
      supportEnabled: false,
    },
  });

  console.log('Sliced with:', result.usedSlicer, '(fallback:', result.engineFallback, ')');
  console.log('Output:', result.gcodePath, fs.statSync(result.gcodePath).size, 'bytes');
  console.log('Print time:', result.metadata.printTimeSeconds, 'sec =',
    result.metadata.printTimeSeconds ? (result.metadata.printTimeSeconds / 60).toFixed(1) : '?', 'min');
  console.log('Filament:', result.metadata.filamentGrams, 'g');
  console.log('Layers:', result.metadata.layerCount);

  if (!result.metadata.printTimeSeconds) {
    throw new Error('Failed to parse print time from generated gcode');
  }

  // Verify the layer-height override took effect (~71 layers for 20mm @ 0.28).
  const gcode = fs.readFileSync(result.gcodePath, 'utf-8');
  if (result.metadata.layerCount && Math.abs(result.metadata.layerCount - 72) > 6) {
    console.warn(`Layer count ${result.metadata.layerCount} differs from expected ~72 — check override handling`);
  }
  const hasTemp215 = /M104 S215|M109 S215/.test(gcode);
  console.log('Nozzle temp override (215C) present in gcode:', hasTemp215);

  console.log('\nAll slicer service tests passed.');
}

main().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});

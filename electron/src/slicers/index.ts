import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Canonical slicer ids, matching the backend database enum:
 * 'cura' | 'prusa' | 'orca' | 'bambu' | 'preform'
 */
export type SlicerId = 'cura' | 'prusa' | 'orca' | 'bambu' | 'preform';

export interface SlicerConfig {
  name: SlicerId;
  displayName: string;
  type: 'fdm' | 'resin';
  executablePath?: string;
  cliSlicing: boolean;
}

export interface SliceOverrides {
  layerHeight?: number;
  infill?: number;
  printSpeed?: number;
  nozzleTemperature?: number;
  bedTemperature?: number;
  supportEnabled?: boolean;
}

const DISPLAY_NAMES: Record<SlicerId, string> = {
  cura: 'Ultimaker Cura',
  prusa: 'PrusaSlicer',
  orca: 'OrcaSlicer',
  bambu: 'Bambu Studio',
  preform: 'PreForm',
};

const SLICER_ALIASES: Record<string, SlicerId> = {
  cura: 'cura',
  curaengine: 'cura',
  prusa: 'prusa',
  prusaslicer: 'prusa',
  'prusa-slicer': 'prusa',
  orca: 'orca',
  orcaslicer: 'orca',
  'orca-slicer': 'orca',
  bambu: 'bambu',
  bambustudio: 'bambu',
  'bambu-studio': 'bambu',
  preform: 'preform',
};

export function resolveSlicerId(name: string): SlicerId | null {
  return SLICER_ALIASES[name.trim().toLowerCase()] || null;
}

function findOnPath(executables: string[]): string | null {
  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const exe of executables) {
    for (const dir of pathDirs) {
      for (const ext of extensions) {
        const candidate = path.join(dir, exe + ext);
        try {
          fs.accessSync(candidate, fs.constants.X_OK);
          return candidate;
        } catch {
          // keep searching
        }
      }
    }
  }
  return null;
}

export class SlicerManager {
  private slicers: Map<SlicerId, SlicerConfig> = new Map();

  constructor() {
    this.detectSlicers();
  }

  private detectSlicers() {
    const slicerPaths: Record<SlicerId, string | null> = {
      cura: process.env.CURA_ENGINE_PATH || process.env.CURA_PATH || this.findCuraPath(),
      prusa: process.env.PRUSASLICER_PATH || this.findPrusaSlicerPath(),
      orca: process.env.ORCASLICER_PATH || this.findOrcaSlicerPath(),
      bambu: process.env.BAMBU_STUDIO_PATH || process.env.BAMBU_PATH || this.findBambuPath(),
      preform: process.env.PREFORM_PATH || this.findPreformPath(),
    };

    for (const [id, executablePath] of Object.entries(slicerPaths) as Array<[SlicerId, string | null]>) {
      if (executablePath && fs.existsSync(executablePath)) {
        const type: 'fdm' | 'resin' = id === 'preform' ? 'resin' : 'fdm';
        this.slicers.set(id, {
          name: id,
          displayName: DISPLAY_NAMES[id],
          type,
          executablePath,
          cliSlicing: id !== 'preform',
        });
      }
    }
  }

  private findCuraPath(): string | null {
    const possiblePaths = [
      '/Applications/Ultimaker Cura.app/Contents/MacOS/CuraEngine',
      '/Applications/Ultimaker Cura.app/Contents/MacOS/Ultimaker Cura',
      'C:\\Program Files\\UltiMaker Cura 5.8.1\\CuraEngine.exe',
      'C:\\Program Files\\UltiMaker Cura 5.7.2\\CuraEngine.exe',
      'C:\\Program Files\\UltiMaker Cura 5.6.0\\CuraEngine.exe',
      'C:\\Program Files\\UltiMaker Cura 5.5.0\\CuraEngine.exe',
      'C:\\Program Files\\UltiMaker Cura 5.4.0\\CuraEngine.exe',
      'C:\\Program Files\\Ultimaker Cura\\Cura.exe',
      'C:\\Program Files\\Ultimaker Cura\\CuraEngine.exe',
      '/usr/bin/CuraEngine',
      '/usr/bin/cura-engine',
      '/usr/bin/cura',
    ];
    return possiblePaths.find(p => fs.existsSync(p)) || findOnPath(['CuraEngine', 'cura-engine']);
  }

  private findPrusaSlicerPath(): string | null {
    const possiblePaths = [
      '/Applications/PrusaSlicer.app/Contents/MacOS/PrusaSlicer',
      'C:\\Program Files\\Prusa3D\\PrusaSlicer\\prusa-slicer-console.exe',
      'C:\\Program Files\\Prusa3D\\PrusaSlicer\\prusa-slicer.exe',
      '/usr/bin/prusa-slicer',
    ];
    return possiblePaths.find(p => fs.existsSync(p)) || findOnPath(['prusa-slicer', 'PrusaSlicer']);
  }

  private findOrcaSlicerPath(): string | null {
    const possiblePaths = [
      '/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer',
      'C:\\Program Files\\OrcaSlicer\\orca-slicer.exe',
      'C:\\Program Files\\OrcaSlicer\\OrcaSlicer.exe',
      '/usr/bin/orca-slicer',
      '/usr/bin/orcaslicer',
    ];
    return possiblePaths.find(p => fs.existsSync(p)) || findOnPath(['orca-slicer', 'orcaslicer', 'OrcaSlicer']);
  }

  private findBambuPath(): string | null {
    const possiblePaths = [
      '/Applications/BambuStudio.app/Contents/MacOS/BambuStudio',
      '/Applications/Bambu Studio.app/Contents/MacOS/Bambu Studio',
      'C:\\Program Files\\Bambu Studio\\bambu-studio.exe',
      '/usr/bin/bambu-studio',
    ];
    return possiblePaths.find(p => fs.existsSync(p)) || findOnPath(['bambu-studio', 'BambuStudio']);
  }

  private findPreformPath(): string | null {
    const possiblePaths = [
      '/Applications/PreForm.app/Contents/MacOS/PreForm',
      'C:\\Program Files\\Formlabs\\PreForm\\PreForm.exe',
    ];
    return possiblePaths.find(p => fs.existsSync(p)) || findOnPath(['PreForm']);
  }

  private getSlicer(slicerName: string): SlicerConfig | undefined {
    const id = resolveSlicerId(slicerName);
    return id ? this.slicers.get(id) : undefined;
  }

  private resolveCuraDefinitionPath(curaExecutablePath: string, fileName: string): string | null {
    const curaDir = path.dirname(curaExecutablePath);
    const candidates = [
      path.join(curaDir, 'resources', 'definitions', fileName),
      path.join(curaDir, 'share', 'cura', 'resources', 'definitions', fileName),
      path.join(curaDir, '..', 'share', 'cura', 'resources', 'definitions', fileName),
      path.join(curaDir, '..', 'Resources', 'resources', 'definitions', fileName),
      `/usr/share/cura/resources/definitions/${fileName}`,
    ];

    return candidates.find((candidate) => fs.existsSync(candidate)) || null;
  }

  /**
   * PrusaSlicer accepts configuration values as direct CLI options
   * (e.g. --layer-height 0.2), not via --set.
   */
  private buildPrusaOverrides(overrides?: SliceOverrides): string[] {
    if (!overrides) {
      return [];
    }

    const args: string[] = [];
    if (overrides.layerHeight !== undefined) {
      args.push('--layer-height', String(overrides.layerHeight));
      args.push('--first-layer-height', String(Math.max(overrides.layerHeight, 0.2)));
    }
    if (overrides.infill !== undefined) {
      args.push('--fill-density', `${overrides.infill}%`);
    }
    if (overrides.nozzleTemperature !== undefined) {
      args.push('--temperature', String(overrides.nozzleTemperature));
      args.push('--first-layer-temperature', String(overrides.nozzleTemperature));
    }
    if (overrides.bedTemperature !== undefined) {
      args.push('--bed-temperature', String(overrides.bedTemperature));
      args.push('--first-layer-bed-temperature', String(overrides.bedTemperature));
    }
    if (overrides.supportEnabled) {
      args.push('--support-material');
    }

    return args;
  }

  private buildCuraOverrides(overrides?: SliceOverrides): string[] {
    const layerHeight = overrides?.layerHeight ?? 0.2;
    const infill = overrides?.infill ?? 20;
    const printSpeed = overrides?.printSpeed ?? 60;
    const nozzleTemp = overrides?.nozzleTemperature ?? 210;
    const bedTemp = overrides?.bedTemperature ?? 60;
    const support = overrides?.supportEnabled ?? false;

    return [
      '-s', 'machine_extruder_count=1',
      '-s', 'machine_nozzle_size=0.4',
      '-s', 'material_diameter=1.75',
      '-s', `layer_height=${layerHeight}`,
      '-s', `infill_sparse_density=${infill}`,
      '-s', `speed_print=${printSpeed}`,
      '-s', `material_print_temperature=${nozzleTemp}`,
      '-s', `material_bed_temperature=${bedTemp}`,
      '-s', `support_enable=${support ? 'true' : 'false'}`,
    ];
  }

  private runSlicerCommand(executablePath: string, command: string[]): Promise<{ code: number | null; output: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(executablePath, command);
      let output = '';

      child.stdout?.on('data', (data) => {
        output += data.toString();
      });
      child.stderr?.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        resolve({ code, output });
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  private findNewestGcodeFile(directory: string, createdAfterMs: number): string | null {
    try {
      if (!fs.existsSync(directory)) {
        return null;
      }

      const entries = fs.readdirSync(directory)
        .filter((entry) => entry.toLowerCase().endsWith('.gcode'))
        .map((entry) => {
          const fullPath = path.join(directory, entry);
          const stat = fs.statSync(fullPath);
          return {
            fullPath,
            mtimeMs: stat.mtimeMs,
          };
        })
        .filter((entry) => entry.mtimeMs >= createdAfterMs)
        .sort((a, b) => b.mtimeMs - a.mtimeMs);

      return entries[0]?.fullPath || null;
    } catch {
      return null;
    }
  }

  private inspectGeneratedGcode(gcodeFile: string): { valid: boolean; reason?: string } {
    try {
      if (!fs.existsSync(gcodeFile)) {
        return { valid: false, reason: 'Output file was not created.' };
      }

      const stat = fs.statSync(gcodeFile);
      if (stat.size < 200) {
        return { valid: false, reason: 'Output gcode file is too small to be a valid slice.' };
      }

      const content = fs.readFileSync(gcodeFile, 'utf-8');
      const lines = content.split(/\r?\n/);

      let extrusionMoveCount = 0;
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
        const isExtruding = absoluteExtrusion ? value > currentE + 0.00001 : value > 0.00001;
        if (isExtruding) {
          extrusionMoveCount += 1;
          if (extrusionMoveCount > 10) {
            return { valid: true };
          }
        }

        currentE = absoluteExtrusion ? value : currentE + value;
      }

      if (extrusionMoveCount === 0) {
        return { valid: false, reason: 'No extrusion moves found in generated gcode.' };
      }

      return { valid: true };
    } catch (error: any) {
      return { valid: false, reason: error?.message || 'Failed to inspect generated gcode.' };
    }
  }

  getSlicerPath(slicerName: string): string | null {
    return this.getSlicer(slicerName)?.executablePath || null;
  }

  async launchSlicer(slicerName: string, stlPath: string, printerType: 'fdm' | 'resin'): Promise<{ pid: number }> {
    const slicer = this.getSlicer(slicerName);

    if (!slicer) {
      throw new Error(`Slicer ${slicerName} not found or not installed`);
    }

    if (slicer.type !== printerType) {
      throw new Error(`Slicer ${slicer.displayName} is for ${slicer.type} printers, not ${printerType}`);
    }

    if (!slicer.executablePath) {
      throw new Error(`No executable path for ${slicerName}`);
    }

    const child = spawn(slicer.executablePath, [stlPath], {
      detached: true,
      stdio: 'ignore',
    });

    child.unref();

    return { pid: child.pid! };
  }

  async sliceFile(
    slicerName: string,
    stlPath: string,
    printerProfile: string | undefined,
    outputPath: string,
    overrides?: SliceOverrides
  ): Promise<{ gcodeFile: string; printTime: number; usedSlicer: SlicerId }> {
    const slicerId = resolveSlicerId(slicerName);
    if (!slicerId) {
      throw new Error(`Unknown slicer: ${slicerName}`);
    }

    const slicer = this.slicers.get(slicerId);
    if (!slicer || !slicer.executablePath) {
      throw new Error(`Slicer ${DISPLAY_NAMES[slicerId]} is not installed on this computer`);
    }

    if (slicerId === 'preform') {
      throw new Error(
        'PreForm has no headless slicing CLI. Use "Open in PreForm" to slice resin models interactively.'
      );
    }

    // Orca/Bambu GUI builds frequently lack a usable headless CLI without
    // profiles; fall back to another installed CLI engine if needed.
    if ((slicerId === 'orca' || slicerId === 'bambu') && !printerProfile) {
      const fallback = (['prusa', 'cura'] as SlicerId[])
        .map((id) => this.slicers.get(id))
        .find((candidate) => candidate?.executablePath
          && (candidate.name !== 'cura'
            || path.basename(candidate.executablePath).toLowerCase().includes('curaengine')
            || path.basename(candidate.executablePath).toLowerCase().includes('cura-engine')));

      try {
        return await this.runCliSlice(slicerId, slicer, stlPath, printerProfile, outputPath, overrides);
      } catch (error) {
        if (fallback) {
          const result = await this.runCliSlice(fallback.name, fallback, stlPath, undefined, outputPath, overrides);
          return { ...result, usedSlicer: fallback.name };
        }
        throw error;
      }
    }

    return this.runCliSlice(slicerId, slicer, stlPath, printerProfile, outputPath, overrides);
  }

  private async runCliSlice(
    slicerId: SlicerId,
    slicer: SlicerConfig,
    stlPath: string,
    printerProfile: string | undefined,
    outputPath: string,
    overrides?: SliceOverrides
  ): Promise<{ gcodeFile: string; printTime: number; usedSlicer: SlicerId }> {
    let baseCommand: string[];
    let overrideCommand: string[] = [];
    let fallbackCommands: string[][] = [];
    const outputDir = path.dirname(outputPath);

    switch (slicerId) {
      case 'prusa':
        baseCommand = ['--export-gcode', '--output', outputPath];
        if (printerProfile) {
          baseCommand.push('--load', printerProfile);
        }
        overrideCommand = this.buildPrusaOverrides(overrides);
        baseCommand.push(stlPath);
        break;
      case 'orca':
      case 'bambu': {
        baseCommand = ['--slice', '0', '--outputdir', outputDir];
        if (printerProfile) {
          baseCommand.push('--load-settings', printerProfile);
        }
        baseCommand.push(stlPath);

        const sliceOne = ['--slice', '1', '--outputdir', outputDir];
        const exportGcode = ['--export-gcode', '--output', outputPath];
        if (printerProfile) {
          sliceOne.push('--load-settings', printerProfile);
          exportGcode.push('--load', printerProfile);
        }
        sliceOne.push(stlPath);
        exportGcode.push(stlPath);

        fallbackCommands = [sliceOne, exportGcode];
        break;
      }
      case 'cura': {
        const executableName = path.basename(slicer.executablePath!).toLowerCase();
        if (!executableName.includes('curaengine') && !executableName.includes('cura-engine')) {
          throw new Error('CuraEngine was not found. Set CURA_ENGINE_PATH to the CuraEngine executable for CLI slicing.');
        }

        const definitionPath = this.resolveCuraDefinitionPath(slicer.executablePath!, 'fdmprinter.def.json');
        if (!definitionPath) {
          throw new Error('CuraEngine definition file not found. Please install Cura resources or set CURA_ENGINE_PATH to a complete CuraEngine installation.');
        }

        const extruderDefinitionPath = this.resolveCuraDefinitionPath(slicer.executablePath!, 'fdmextruder.def.json');

        baseCommand = ['slice', '-j', definitionPath];

        if (extruderDefinitionPath) {
          baseCommand.push('-j', extruderDefinitionPath);
        }

        overrideCommand = this.buildCuraOverrides(overrides);
        baseCommand.push('-l', stlPath, '-o', outputPath);
        break;
      }
      default:
        throw new Error(`CLI slicing not implemented for ${slicerId}`);
    }

    const startedAt = Date.now();
    if (fs.existsSync(outputPath)) {
      try {
        fs.unlinkSync(outputPath);
      } catch {
        // Ignore inability to delete stale output file.
      }
    }

    const resolveSuccessfulOutput = (): string | null => {
      if (fs.existsSync(outputPath)) {
        return outputPath;
      }
      return this.findNewestGcodeFile(outputDir, startedAt);
    };

    const attempts: string[][] = [
      [...baseCommand.slice(0, -1), ...overrideCommand, baseCommand[baseCommand.length - 1]],
      ...(overrideCommand.length > 0 ? [baseCommand] : []),
      ...fallbackCommands,
    ];

    let lastCode: number | null = null;
    let lastOutput = '';
    let lastInspectionReason = '';

    for (const command of attempts) {
      const run = await this.runSlicerCommand(slicer.executablePath!, command);
      lastCode = run.code;
      lastOutput = run.output;

      const outFile = run.code === 0 ? resolveSuccessfulOutput() : null;
      if (outFile) {
        const inspection = this.inspectGeneratedGcode(outFile);
        if (inspection.valid) {
          return { gcodeFile: outFile, printTime: this.parsePrintTime(outFile), usedSlicer: slicerId };
        }
        lastInspectionReason = inspection.reason || '';
      }
    }

    const inspectionContext = lastInspectionReason ? `\nValidation: ${lastInspectionReason}` : '';
    throw new Error(`Slicing failed with code ${lastCode}\n${lastOutput.slice(-2000)}${inspectionContext}`);
  }

  private parseDurationString(value: string): number {
    const match = value.trim().match(/(?:(\d+)\s*d)?\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?/);
    if (!match || match[0].trim() === '') {
      return 0;
    }
    const [, d, h, m, s] = match;
    return (Number.parseInt(d || '0', 10) * 86400)
      + (Number.parseInt(h || '0', 10) * 3600)
      + (Number.parseInt(m || '0', 10) * 60)
      + Number.parseInt(s || '0', 10);
  }

  private parsePrintTime(gcodeFile: string): number {
    try {
      const content = fs.readFileSync(gcodeFile, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        if (!line.startsWith(';')) {
          continue;
        }
        // Cura: ;TIME:12345
        const curaTime = line.match(/^;TIME:(\d+)/);
        if (curaTime) {
          return Number.parseInt(curaTime[1], 10);
        }
        // PrusaSlicer: ; estimated printing time (normal mode) = 1h 32m 16s
        if (/estimated printing time/i.test(line)) {
          const idx = line.indexOf('=');
          if (idx >= 0) {
            const seconds = this.parseDurationString(line.slice(idx + 1));
            if (seconds > 0) {
              return seconds;
            }
          }
        }
        // Orca/Bambu: ; total estimated time: 1h 32m 16s
        if (/total estimated time:/i.test(line) || /model printing time:/i.test(line)) {
          const idx = line.indexOf(':');
          const seconds = this.parseDurationString(line.slice(idx + 1));
          if (seconds > 0) {
            return seconds;
          }
        }
      }
    } catch (error) {
      console.error('Failed to parse print time:', error);
    }

    return 0;
  }

  getAvailableSlicers(): SlicerConfig[] {
    return Array.from(this.slicers.values());
  }
}

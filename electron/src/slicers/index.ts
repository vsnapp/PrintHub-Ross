import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface SlicerConfig {
  name: string;
  type: 'fdm' | 'resin';
  executablePath?: string;
  cliCommand?: string;
}

export interface SliceOverrides {
  layerHeight?: number;
  infill?: number;
  printSpeed?: number;
  nozzleTemperature?: number;
  bedTemperature?: number;
  supportEnabled?: boolean;
}

export class SlicerManager {
  private slicers: Map<string, SlicerConfig> = new Map();

  constructor() {
    this.detectSlicers();
  }

  private detectSlicers() {
    // Auto-detect installed slicers or use env variables
    const slicerPaths = {
      cura: process.env.CURA_ENGINE_PATH || process.env.CURA_PATH || this.findCuraPath(),
      prusaslicer: process.env.PRUSASLICER_PATH || this.findPrusaSlicerPath(),
      orcaslicer: process.env.ORCASLICER_PATH || this.findOrcaSlicerPath(),
      bambu: process.env.BAMBU_PATH || this.findBambuPath(),
      preform: process.env.PREFORM_PATH || this.findPreformPath(),
    };

    for (const [name, path] of Object.entries(slicerPaths)) {
      if (path && fs.existsSync(path)) {
        const type: 'fdm' | 'resin' = name === 'preform' ? 'resin' : 'fdm';
        this.slicers.set(name, {
          name,
          type,
          executablePath: path,
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
      '/usr/bin/cura',
    ];
    return possiblePaths.find(p => fs.existsSync(p)) || null;
  }

  private resolveCuraDefinitionPath(curaExecutablePath: string): string | null {
    const curaDir = path.dirname(curaExecutablePath);
    const candidates = [
      path.join(curaDir, 'resources', 'definitions', 'fdmprinter.def.json'),
      path.join(curaDir, 'share', 'cura', 'resources', 'definitions', 'fdmprinter.def.json'),
      path.join(curaDir, '..', 'share', 'cura', 'resources', 'definitions', 'fdmprinter.def.json'),
      path.join(curaDir, '..', 'Resources', 'resources', 'definitions', 'fdmprinter.def.json'),
    ];

    return candidates.find((candidate) => fs.existsSync(candidate)) || null;
  }

  private resolveCuraExtruderDefinitionPath(curaExecutablePath: string): string | null {
    const curaDir = path.dirname(curaExecutablePath);
    const candidates = [
      path.join(curaDir, 'resources', 'definitions', 'fdmextruder.def.json'),
      path.join(curaDir, 'share', 'cura', 'resources', 'definitions', 'fdmextruder.def.json'),
      path.join(curaDir, '..', 'share', 'cura', 'resources', 'definitions', 'fdmextruder.def.json'),
      path.join(curaDir, '..', 'Resources', 'resources', 'definitions', 'fdmextruder.def.json'),
    ];

    return candidates.find((candidate) => fs.existsSync(candidate)) || null;
  }

  private buildPrusaFamilyOverrides(overrides?: SliceOverrides): string[] {
    if (!overrides) {
      return [];
    }

    const args: string[] = [];
    if (overrides.layerHeight !== undefined) {
      args.push('--set', `layer_height=${overrides.layerHeight}`);
    }
    if (overrides.infill !== undefined) {
      args.push('--set', `fill_density=${overrides.infill}%`);
    }
    if (overrides.nozzleTemperature !== undefined) {
      args.push('--set', `temperature=${overrides.nozzleTemperature}`);
      args.push('--set', `first_layer_temperature=${overrides.nozzleTemperature}`);
    }
    if (overrides.bedTemperature !== undefined) {
      args.push('--set', `bed_temperature=${overrides.bedTemperature}`);
      args.push('--set', `first_layer_bed_temperature=${overrides.bedTemperature}`);
    }
    if (overrides.supportEnabled !== undefined) {
      args.push('--set', `support_material=${overrides.supportEnabled ? 1 : 0}`);
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

      let hasLayerComment = false;
      let extrusionMoveCount = 0;
      let currentE = 0;
      let absoluteExtrusion = true;

      for (const raw of lines) {
        const line = raw.trim();
        const upper = line.toUpperCase();

        if (!line) {
          continue;
        }

        if (upper.startsWith(';LAYER:') || upper.includes('LAYER CHANGE')) {
          hasLayerComment = true;
        }

        if (upper === 'M82') {
          absoluteExtrusion = true;
          continue;
        }
        if (upper === 'M83') {
          absoluteExtrusion = false;
          continue;
        }

        if (upper.startsWith('G92')) {
          const reset = upper.match(/[EABC](-?\d*\.?\d+)/);
          if (reset) {
            currentE = Number.parseFloat(reset[1]);
          }
          continue;
        }

        if (!upper.startsWith('G0') && !upper.startsWith('G1') && !upper.startsWith('G2') && !upper.startsWith('G3')) {
          continue;
        }

        const extrusion = upper.match(/[EABC](-?\d*\.?\d+)/);
        if (!extrusion) {
          continue;
        }

        const value = Number.parseFloat(extrusion[1]);
        const isExtruding = absoluteExtrusion ? value > currentE + 0.00001 : value > 0.00001;
        if (isExtruding) {
          extrusionMoveCount += 1;
        }

        currentE = absoluteExtrusion ? value : currentE + value;
      }

      if (extrusionMoveCount === 0) {
        return { valid: false, reason: hasLayerComment ? 'Layers found but no extrusion moves detected.' : 'No extrusion moves or layers found in generated gcode.' };
      }

      return { valid: true };
    } catch (error: any) {
      return { valid: false, reason: error?.message || 'Failed to inspect generated gcode.' };
    }
  }

  private findPrusaSlicerPath(): string | null {
    const possiblePaths = [
      '/Applications/PrusaSlicer.app/Contents/MacOS/PrusaSlicer',
      'C:\\Program Files\\Prusa3D\\PrusaSlicer\\prusa-slicer.exe',
      '/usr/bin/prusa-slicer',
    ];
    return possiblePaths.find(p => fs.existsSync(p)) || null;
  }

  private findOrcaSlicerPath(): string | null {
    const possiblePaths = [
      '/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer',
      'C:\\Program Files\\OrcaSlicer\\OrcaSlicer.exe',
      '/usr/bin/orcaslicer',
    ];
    return possiblePaths.find(p => fs.existsSync(p)) || null;
  }

  private findBambuPath(): string | null {
    const possiblePaths = [
      '/Applications/Bambu Studio.app/Contents/MacOS/Bambu Studio',
      'C:\\Program Files\\Bambu Studio\\bambu-studio.exe',
      '/usr/bin/bambu-studio',
    ];
    return possiblePaths.find(p => fs.existsSync(p)) || null;
  }

  private findPreformPath(): string | null {
    const possiblePaths = [
      '/Applications/Preform.app/Contents/MacOS/Preform',
      'C:\\Program Files\\Formlabs\\Preform\\Preform.exe',
    ];
    return possiblePaths.find(p => fs.existsSync(p)) || null;
  }

  getSlicerPath(slicerName: string): string | null {
    return this.slicers.get(slicerName)?.executablePath || null;
  }

  async launchSlicer(slicerName: string, stlPath: string, printerType: 'fdm' | 'resin'): Promise<{ pid: number }> {
    const slicer = this.slicers.get(slicerName);
    
    if (!slicer) {
      throw new Error(`Slicer ${slicerName} not found or not installed`);
    }

    if (slicer.type !== printerType) {
      throw new Error(`Slicer ${slicerName} is for ${slicer.type} printers, not ${printerType}`);
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
  ): Promise<{ gcodeFile: string; printTime: number }> {
    const slicer = this.slicers.get(slicerName);
    
    if (!slicer || !slicer.executablePath) {
      throw new Error(`Slicer ${slicerName} not available`);
    }

    if ((slicerName === 'orcaslicer' || slicerName === 'bambu') && !printerProfile) {
      const curaSlicer = this.slicers.get('cura');
      if (curaSlicer?.executablePath && path.basename(curaSlicer.executablePath).toLowerCase().includes('curaengine')) {
        return this.sliceFile('cura', stlPath, undefined, outputPath, overrides);
      }

      throw new Error(
        `${slicerName} CLI requires profile/settings input for automated slicing. ` +
        `Install/configure CuraEngine (CURA_ENGINE_PATH) for profile-less local slicing fallback, or provide a slicer profile file.`
      );
    }

    return new Promise(async (resolve, reject) => {
      let baseCommand: string[];
      let overrideCommand: string[] = [];
      let fallbackCommands: string[][] = [];
      const outputDir = path.dirname(outputPath);
      const stlDir = path.dirname(stlPath);
      const stlBaseName = path.basename(stlPath);
      
      switch (slicerName) {
        case 'prusaslicer':
          baseCommand = ['--export-gcode', '--output', outputPath];
          if (printerProfile) {
            baseCommand.push('--load', printerProfile);
          }
          overrideCommand = this.buildPrusaFamilyOverrides(overrides);
          baseCommand.push(stlPath);
          break;
        case 'orcaslicer':
        case 'bambu': {
          baseCommand = ['--export-gcode', '--output', outputPath];
          if (printerProfile) {
            baseCommand.push('--load', printerProfile);
          }
          baseCommand.push(stlPath);

          const sliceWithOutputDir = ['--slice', '1', '--outputdir', outputDir];
          if (printerProfile) {
            sliceWithOutputDir.push('--load-settings', printerProfile);
          }
          sliceWithOutputDir.push(stlPath);

          const sliceWithoutValue = ['--slice', '--outputdir', outputDir];
          if (printerProfile) {
            sliceWithoutValue.push('--load-settings', printerProfile);
          }
          sliceWithoutValue.push(stlPath);

          const sliceLoadStl = ['--load-stl', stlPath, '--slice', '1', '--outputdir', outputDir];
          const sliceLoad = ['--load', stlPath, '--slice', '1', '--outputdir', outputDir];
          const exportWithLoadStl = ['--load-stl', stlPath, '--export-gcode', '--output', outputPath];
          const exportWithLoad = ['--load', stlPath, '--export-gcode', '--output', outputPath];

          fallbackCommands = [
            sliceWithOutputDir,
            sliceWithoutValue,
            sliceLoadStl,
            sliceLoad,
            exportWithLoadStl,
            exportWithLoad,
            ['--slice', '1', '--outputdir', outputDir, stlBaseName],
            ['--slice', '--outputdir', outputDir, stlBaseName],
          ].map((command) => {
            const mapped = command.map((token) => token === stlBaseName ? path.join(stlDir, stlBaseName) : token);
            if (printerProfile && !mapped.includes('--load-settings') && !mapped.includes('--load')) {
              return ['--load-settings', printerProfile, ...mapped];
            }
            return mapped;
          });

          overrideCommand = [];
          break;
        }
        case 'cura': {
          const executableName = path.basename(slicer.executablePath!).toLowerCase();
          if (!executableName.includes('curaengine')) {
            reject(new Error('CuraEngine was not found. Set CURA_ENGINE_PATH to CuraEngine executable for CLI slicing.'));
            return;
          }

          const definitionPath = this.resolveCuraDefinitionPath(slicer.executablePath!);
          if (!definitionPath) {
            reject(new Error('CuraEngine definition file not found. Please install Cura resources or set CURA_ENGINE_PATH to a complete CuraEngine installation.'));
            return;
          }

          const extruderDefinitionPath = this.resolveCuraExtruderDefinitionPath(slicer.executablePath!);

          baseCommand = [
            'slice',
            '-j', definitionPath,
          ];

          if (extruderDefinitionPath) {
            baseCommand.push('-j', extruderDefinitionPath);
          }

          baseCommand.push(
            '-l', stlPath,
            '-o', outputPath,
          );
          overrideCommand = this.buildCuraOverrides(overrides);
          break;
        }
        case 'preform':
          baseCommand = ['--export', outputPath, stlPath];
          break;
        default:
          reject(new Error(`CLI slicing not implemented for ${slicerName}`));
          return;
      }

      try {
        const startedAt = Date.now();
        if (fs.existsSync(outputPath)) {
          try {
            fs.unlinkSync(outputPath);
          } catch {
            // Ignore inability to delete stale output file.
          }
        }
        const withOverrides = [...baseCommand, ...overrideCommand];
        const firstRun = await this.runSlicerCommand(slicer.executablePath!, withOverrides);

        const resolveSuccessfulOutput = (): string | null => {
          if (fs.existsSync(outputPath)) {
            return outputPath;
          }
          return this.findNewestGcodeFile(path.dirname(outputPath), startedAt);
        };

        const firstOutput = firstRun.code === 0 ? resolveSuccessfulOutput() : null;
        if (firstOutput) {
          const inspection = this.inspectGeneratedGcode(firstOutput);
          if (inspection.valid) {
            const printTime = this.parsePrintTime(firstOutput);
            resolve({ gcodeFile: firstOutput, printTime });
            return;
          }
        }

        const shouldRetryWithoutOverrides = overrideCommand.length > 0
          && (firstRun.output.toLowerCase().includes('unknown option')
            || firstRun.output.toLowerCase().includes('invalid')
            || firstRun.output.toLowerCase().includes('not recognized'));

        if (shouldRetryWithoutOverrides) {
          const secondRun = await this.runSlicerCommand(slicer.executablePath!, baseCommand);
          const secondOutput = secondRun.code === 0 ? resolveSuccessfulOutput() : null;
          if (secondOutput) {
            const inspection = this.inspectGeneratedGcode(secondOutput);
            if (inspection.valid) {
              const printTime = this.parsePrintTime(secondOutput);
              resolve({ gcodeFile: secondOutput, printTime });
              return;
            }
          }
        }

        if (fallbackCommands.length > 0) {
          let lastOutput = firstRun.output;
          let lastCode = firstRun.code;
          let lastInspectionReason = '';

          for (const fallbackCommand of fallbackCommands) {
            if (fs.existsSync(outputPath)) {
              try {
                fs.unlinkSync(outputPath);
              } catch {
                // Ignore inability to delete stale output file.
              }
            }

            const run = await this.runSlicerCommand(slicer.executablePath!, fallbackCommand);
            const outFile = run.code === 0 ? resolveSuccessfulOutput() : null;
            if (outFile) {
              const inspection = this.inspectGeneratedGcode(outFile);
              if (inspection.valid) {
                const printTime = this.parsePrintTime(outFile);
                resolve({ gcodeFile: outFile, printTime });
                return;
              }
              lastInspectionReason = inspection.reason || '';
            }

            lastOutput = run.output;
            lastCode = run.code;
          }

          const inspectionContext = lastInspectionReason ? `\nValidation: ${lastInspectionReason}` : '';
          reject(new Error(`Slicing failed with code ${lastCode}\n${lastOutput}${inspectionContext}`));
          return;
        }

        reject(new Error(`Slicing failed with code ${firstRun.code}\n${firstRun.output}`));
      } catch (error) {
        reject(error);
      }
    });
  }

  private parsePrintTime(gcodeFile: string): number {
    try {
      const content = fs.readFileSync(gcodeFile, 'utf-8');
      const lines = content.split('\n').slice(0, 100);

      for (const line of lines) {
        if (line.includes(';TIME:')) {
          const match = line.match(/;TIME:(\d+)/);
          if (match) {
            return parseInt(match[1]);
          }
        }
        if (line.includes('estimated printing time')) {
          const match = line.match(/(\d+)h\s*(\d+)m/);
          if (match) {
            return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60;
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

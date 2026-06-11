import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { analyzeGcode, GcodeMetadata, validateGcode } from './gcodeAnalyzer';
import { estimatePrint, EstimateSettings, PrintEstimate } from './stlEstimator';

export type SlicerId = 'cura' | 'prusa' | 'orca' | 'bambu' | 'preform';

export interface SliceOverrides {
  layerHeight?: number;
  infill?: number;
  printSpeed?: number;
  nozzleTemperature?: number;
  bedTemperature?: number;
  supportEnabled?: boolean;
  nozzleSize?: number;
  customSettings?: string;
}

export interface SlicerInfo {
  id: SlicerId;
  displayName: string;
  type: 'fdm' | 'resin';
  available: boolean;
  executablePath: string | null;
  cliSlicing: boolean;
}

export interface SliceResult {
  gcodePath: string;
  requestedSlicer: SlicerId;
  usedSlicer: SlicerId;
  engineFallback: boolean;
  metadata: GcodeMetadata;
  durationMs: number;
}

const SLICER_DISPLAY_NAMES: Record<SlicerId, string> = {
  cura: 'Ultimaker Cura',
  prusa: 'PrusaSlicer',
  orca: 'OrcaSlicer',
  bambu: 'Bambu Studio',
  preform: 'PreForm',
};

const SLICER_ALIASES: Record<string, SlicerId> = {
  cura: 'cura',
  curaengine: 'cura',
  'ultimaker cura': 'cura',
  prusa: 'prusa',
  prusaslicer: 'prusa',
  'prusa-slicer': 'prusa',
  orca: 'orca',
  orcaslicer: 'orca',
  'orca-slicer': 'orca',
  bambu: 'bambu',
  bambustudio: 'bambu',
  'bambu-studio': 'bambu',
  'bambu studio': 'bambu',
  preform: 'preform',
};

export function resolveSlicerId(name?: string | null): SlicerId | null {
  if (!name) {
    return null;
  }
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
          // Not here; keep looking.
        }
      }
    }
  }
  return null;
}

function firstExisting(paths: string[]): string | null {
  return paths.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  }) || null;
}

function detectCura(): string | null {
  return (
    process.env.CURA_ENGINE_PATH ||
    process.env.CURA_PATH ||
    firstExisting([
      '/Applications/Ultimaker Cura.app/Contents/MacOS/CuraEngine',
      'C:\\Program Files\\UltiMaker Cura 5.8.1\\CuraEngine.exe',
      'C:\\Program Files\\UltiMaker Cura 5.7.2\\CuraEngine.exe',
      'C:\\Program Files\\UltiMaker Cura 5.6.0\\CuraEngine.exe',
      'C:\\Program Files\\Ultimaker Cura\\CuraEngine.exe',
      '/usr/bin/CuraEngine',
      '/usr/bin/cura-engine',
    ]) ||
    findOnPath(['CuraEngine', 'cura-engine', 'curaengine'])
  );
}

function detectPrusa(): string | null {
  return (
    process.env.PRUSASLICER_PATH ||
    firstExisting([
      '/Applications/PrusaSlicer.app/Contents/MacOS/PrusaSlicer',
      'C:\\Program Files\\Prusa3D\\PrusaSlicer\\prusa-slicer-console.exe',
      'C:\\Program Files\\Prusa3D\\PrusaSlicer\\prusa-slicer.exe',
      '/usr/bin/prusa-slicer',
    ]) ||
    findOnPath(['prusa-slicer', 'prusaslicer', 'PrusaSlicer'])
  );
}

function detectOrca(): string | null {
  return (
    process.env.ORCASLICER_PATH ||
    firstExisting([
      '/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer',
      'C:\\Program Files\\OrcaSlicer\\orca-slicer.exe',
      'C:\\Program Files\\OrcaSlicer\\OrcaSlicer.exe',
      '/usr/bin/orca-slicer',
      '/usr/bin/orcaslicer',
    ]) ||
    findOnPath(['orca-slicer', 'orcaslicer', 'OrcaSlicer'])
  );
}

function detectBambu(): string | null {
  return (
    process.env.BAMBU_STUDIO_PATH ||
    process.env.BAMBU_PATH ||
    firstExisting([
      '/Applications/BambuStudio.app/Contents/MacOS/BambuStudio',
      '/Applications/Bambu Studio.app/Contents/MacOS/Bambu Studio',
      'C:\\Program Files\\Bambu Studio\\bambu-studio.exe',
      '/usr/bin/bambu-studio',
    ]) ||
    findOnPath(['bambu-studio', 'BambuStudio'])
  );
}

function detectPreform(): string | null {
  return (
    process.env.PREFORM_PATH ||
    firstExisting([
      '/Applications/PreForm.app/Contents/MacOS/PreForm',
      'C:\\Program Files\\Formlabs\\PreForm\\PreForm.exe',
    ]) ||
    findOnPath(['PreForm', 'preform'])
  );
}

export function detectSlicers(): SlicerInfo[] {
  const detected: Array<{ id: SlicerId; path: string | null; type: 'fdm' | 'resin'; cli: boolean }> = [
    { id: 'cura', path: detectCura(), type: 'fdm', cli: true },
    { id: 'prusa', path: detectPrusa(), type: 'fdm', cli: true },
    { id: 'orca', path: detectOrca(), type: 'fdm', cli: true },
    { id: 'bambu', path: detectBambu(), type: 'fdm', cli: true },
    // PreForm has no headless slicing CLI; jobs for resin printers use the
    // geometry estimator and the desktop "open in PreForm" flow.
    { id: 'preform', path: detectPreform(), type: 'resin', cli: false },
  ];

  return detected.map(({ id, path: exePath, type, cli }) => ({
    id,
    displayName: SLICER_DISPLAY_NAMES[id],
    type,
    available: !!exePath,
    executablePath: exePath,
    cliSlicing: cli && !!exePath,
  }));
}

export function getSlicerInfo(id: SlicerId): SlicerInfo {
  const info = detectSlicers().find((slicer) => slicer.id === id);
  if (!info) {
    throw new Error(`Unknown slicer: ${id}`);
  }
  return info;
}

interface RunResult {
  code: number | null;
  output: string;
}

function runCommand(executable: string, args: string[], timeoutMs = 10 * 60 * 1000): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env: { ...process.env } });
    let output = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGKILL');
        reject(new Error(`Slicer process timed out after ${Math.round(timeoutMs / 1000)}s`));
      }
    }, timeoutMs);

    child.stdout?.on('data', (data) => {
      output += data.toString();
    });
    child.stderr?.on('data', (data) => {
      output += data.toString();
    });
    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ code, output });
      }
    });
    child.on('error', (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
  });
}

function parseCustomSettings(customSettings?: string): Array<[string, string]> {
  if (!customSettings) {
    return [];
  }
  return customSettings
    .split(/\r?\n|;/)
    .map((entry) => entry.trim())
    .filter((entry) => entry && entry.includes('='))
    .map((entry) => {
      const idx = entry.indexOf('=');
      return [entry.slice(0, idx).trim(), entry.slice(idx + 1).trim()] as [string, string];
    });
}

function buildPrusaArgs(stlPath: string, outputPath: string, overrides: SliceOverrides): string[] {
  const args: string[] = ['--export-gcode', '--output', outputPath, '--loglevel', '1'];

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
  if (overrides.nozzleSize !== undefined) {
    args.push('--nozzle-diameter', String(overrides.nozzleSize));
  }
  if (overrides.supportEnabled) {
    args.push('--support-material');
  }
  for (const [key, value] of parseCustomSettings(overrides.customSettings)) {
    args.push(`--${key.replace(/_/g, '-')}`, value);
  }

  args.push(stlPath);
  return args;
}

function resolveCuraDefinition(curaExecutable: string, fileName: string): string | null {
  const curaDir = path.dirname(curaExecutable);
  return firstExisting([
    path.join(curaDir, 'resources', 'definitions', fileName),
    path.join(curaDir, 'share', 'cura', 'resources', 'definitions', fileName),
    path.join(curaDir, '..', 'share', 'cura', 'resources', 'definitions', fileName),
    path.join(curaDir, '..', 'Resources', 'resources', 'definitions', fileName),
    `/usr/share/cura/resources/definitions/${fileName}`,
    `/usr/share/curaengine/resources/definitions/${fileName}`,
  ]);
}

function buildCuraArgs(executablePath: string, stlPath: string, outputPath: string, overrides: SliceOverrides): string[] {
  const definitionPath = resolveCuraDefinition(executablePath, 'fdmprinter.def.json');
  if (!definitionPath) {
    throw new Error(
      'CuraEngine printer definition (fdmprinter.def.json) not found. ' +
      'Install the full Cura resources or point CURA_ENGINE_PATH at a complete installation.'
    );
  }

  const args: string[] = ['slice', '-j', definitionPath];
  const extruderDefinition = resolveCuraDefinition(executablePath, 'fdmextruder.def.json');
  if (extruderDefinition) {
    args.push('-j', extruderDefinition);
  }

  const layerHeight = overrides.layerHeight ?? 0.2;
  const infill = overrides.infill ?? 20;
  const printSpeed = overrides.printSpeed ?? 60;
  const nozzleTemp = overrides.nozzleTemperature ?? 210;
  const bedTemp = overrides.bedTemperature ?? 60;
  const support = overrides.supportEnabled ?? false;
  const nozzleSize = overrides.nozzleSize ?? 0.4;

  const settings: Array<[string, string]> = [
    ['machine_extruder_count', '1'],
    ['machine_nozzle_size', String(nozzleSize)],
    ['material_diameter', '1.75'],
    ['layer_height', String(layerHeight)],
    ['infill_sparse_density', String(infill)],
    ['speed_print', String(printSpeed)],
    ['material_print_temperature', String(nozzleTemp)],
    ['material_bed_temperature', String(bedTemp)],
    ['support_enable', support ? 'true' : 'false'],
    ...parseCustomSettings(overrides.customSettings),
  ];

  for (const [key, value] of settings) {
    args.push('-s', `${key}=${value}`);
  }

  args.push('-l', stlPath, '-o', outputPath);
  return args;
}

/**
 * Write a temporary Orca/Bambu process-settings JSON containing the override
 * values, used with --load-settings.
 */
function writeOrcaOverrideProfile(tempDir: string, overrides: SliceOverrides): string {
  const profile: Record<string, unknown> = {
    type: 'process',
    name: 'PrintHub overrides',
    from: 'User',
  };

  if (overrides.layerHeight !== undefined) {
    profile.layer_height = String(overrides.layerHeight);
  }
  if (overrides.infill !== undefined) {
    profile.sparse_infill_density = `${overrides.infill}%`;
  }
  if (overrides.nozzleTemperature !== undefined) {
    profile.nozzle_temperature = [String(overrides.nozzleTemperature)];
    profile.nozzle_temperature_initial_layer = [String(overrides.nozzleTemperature)];
  }
  if (overrides.bedTemperature !== undefined) {
    profile.hot_plate_temp = [String(overrides.bedTemperature)];
    profile.hot_plate_temp_initial_layer = [String(overrides.bedTemperature)];
  }
  if (overrides.supportEnabled !== undefined) {
    profile.enable_support = overrides.supportEnabled ? '1' : '0';
  }
  for (const [key, value] of parseCustomSettings(overrides.customSettings)) {
    profile[key] = value;
  }

  const profilePath = path.join(tempDir, 'printhub-overrides.json');
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
  return profilePath;
}

function findNewestGcode(directory: string, createdAfterMs: number): string | null {
  try {
    if (!fs.existsSync(directory)) {
      return null;
    }
    const entries = fs.readdirSync(directory)
      .filter((entry) => entry.toLowerCase().endsWith('.gcode'))
      .map((entry) => {
        const fullPath = path.join(directory, entry);
        return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
      })
      .filter((entry) => entry.mtimeMs >= createdAfterMs)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    return entries[0]?.fullPath || null;
  } catch {
    return null;
  }
}

async function sliceWithOrcaFamily(
  executablePath: string,
  stlPath: string,
  outputPath: string,
  overrides: SliceOverrides
): Promise<{ gcodePath: string; log: string }> {
  const outputDir = path.dirname(outputPath);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'printhub-orca-'));
  const overrideProfile = writeOrcaOverrideProfile(tempDir, overrides);

  // Orca/Bambu CLI syntax has shifted across releases; try the known shapes.
  const commandVariants: string[][] = [
    ['--load-settings', overrideProfile, '--slice', '0', '--outputdir', outputDir, '--debug', '1', stlPath],
    ['--load-settings', overrideProfile, '--slice', '1', '--outputdir', outputDir, stlPath],
    ['--slice', '0', '--outputdir', outputDir, stlPath],
    ['--export-gcode', '--output', outputPath, stlPath],
    ['--load-settings', overrideProfile, '--export-gcode', '--output', outputPath, stlPath],
  ];

  let lastLog = '';
  try {
    for (const args of commandVariants) {
      const startedAt = Date.now();
      const run = await runCommand(executablePath, args);
      lastLog = run.output;

      const candidate = fs.existsSync(outputPath)
        ? outputPath
        : findNewestGcode(outputDir, startedAt);
      if (run.code === 0 && candidate) {
        const inspection = validateGcode(candidate);
        if (inspection.valid) {
          return { gcodePath: candidate, log: run.output };
        }
      }
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  throw new Error(`Orca/Bambu CLI slicing failed.\n${lastLog.slice(-2000)}`);
}

export interface SliceStlOptions {
  slicer: SlicerId;
  stlPath: string;
  outputPath: string;
  overrides?: SliceOverrides;
  /**
   * When the requested slicer cannot complete a headless slice, fall back to
   * another installed FDM engine so the farm keeps moving.
   */
  allowEngineFallback?: boolean;
}

async function runEngine(slicer: SlicerId, info: SlicerInfo, options: SliceStlOptions): Promise<string> {
  const overrides = options.overrides || {};
  const { stlPath, outputPath } = options;

  if (!info.executablePath) {
    throw new Error(`${SLICER_DISPLAY_NAMES[slicer]} is not installed on this server`);
  }

  switch (slicer) {
    case 'prusa': {
      const run = await runCommand(info.executablePath, buildPrusaArgs(stlPath, outputPath, overrides));
      if (run.code !== 0 || !fs.existsSync(outputPath)) {
        throw new Error(`PrusaSlicer failed (exit ${run.code}).\n${run.output.slice(-2000)}`);
      }
      return outputPath;
    }
    case 'cura': {
      const executableName = path.basename(info.executablePath).toLowerCase();
      if (!executableName.includes('curaengine') && !executableName.includes('cura-engine')) {
        throw new Error(
          'Headless Cura slicing requires the CuraEngine binary. ' +
          'Set CURA_ENGINE_PATH to the CuraEngine executable inside your Cura installation.'
        );
      }
      const run = await runCommand(info.executablePath, buildCuraArgs(info.executablePath, stlPath, outputPath, overrides));
      if (run.code !== 0 || !fs.existsSync(outputPath)) {
        throw new Error(`CuraEngine failed (exit ${run.code}).\n${run.output.slice(-2000)}`);
      }
      return outputPath;
    }
    case 'orca':
    case 'bambu': {
      const result = await sliceWithOrcaFamily(info.executablePath, stlPath, outputPath, overrides);
      return result.gcodePath;
    }
    case 'preform':
      throw new Error(
        'PreForm does not support headless slicing. Use the desktop app to open the model in PreForm, ' +
        'or rely on the automatic geometry estimate for scheduling.'
      );
    default:
      throw new Error(`CLI slicing not implemented for ${slicer}`);
  }
}

export async function sliceStl(options: SliceStlOptions): Promise<SliceResult> {
  const startedAt = Date.now();
  const requested = options.slicer;
  const slicers = detectSlicers();
  const requestedInfo = slicers.find((slicer) => slicer.id === requested);
  if (!requestedInfo) {
    throw new Error(`Unknown slicer: ${requested}`);
  }

  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });

  const attempts: Array<{ id: SlicerId; info: SlicerInfo }> = [];
  if (requestedInfo.cliSlicing) {
    attempts.push({ id: requested, info: requestedInfo });
  }

  if (options.allowEngineFallback !== false) {
    for (const fallback of slicers) {
      if (fallback.id !== requested && fallback.cliSlicing && fallback.type === 'fdm') {
        attempts.push({ id: fallback.id, info: fallback });
      }
    }
  }

  if (attempts.length === 0) {
    throw new Error(
      `No slicing engine available for ${SLICER_DISPLAY_NAMES[requested]}. ` +
      'Install one of: PrusaSlicer, CuraEngine, OrcaSlicer, Bambu Studio on the server ' +
      '(or set PRUSASLICER_PATH / CURA_ENGINE_PATH / ORCASLICER_PATH / BAMBU_STUDIO_PATH).'
    );
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const gcodePath = await runEngine(attempt.id, attempt.info, options);
      const inspection = validateGcode(gcodePath);
      if (!inspection.valid) {
        throw new Error(inspection.reason || 'Generated gcode failed validation');
      }
      return {
        gcodePath,
        requestedSlicer: requested,
        usedSlicer: attempt.id,
        engineFallback: attempt.id !== requested,
        metadata: analyzeGcode(gcodePath),
        durationMs: Date.now() - startedAt,
      };
    } catch (error: any) {
      errors.push(`[${SLICER_DISPLAY_NAMES[attempt.id]}] ${error?.message || error}`);
    }
  }

  throw new Error(`Slicing failed with all available engines:\n${errors.join('\n')}`);
}

/**
 * Resin print estimation for PreForm-class printers (per-layer exposure model).
 */
export function estimateResinPrint(stlPath: string, layerHeight = 0.1): PrintEstimate {
  const estimate = estimatePrint(stlPath, { layerHeight });
  const layerCount = Math.max(1, Math.ceil(estimate.stats.boundingBox.z / layerHeight));
  const secondsPerLayer = 9; // exposure + peel + retract on a typical SLA/MSLA machine
  const estimatedMinutes = Math.max(10, Math.round((layerCount * secondsPerLayer + 600) / 60));
  return {
    ...estimate,
    estimatedMinutes,
  };
}

export { estimatePrint, analyzeGcode, validateGcode };
export type { EstimateSettings, PrintEstimate, GcodeMetadata };

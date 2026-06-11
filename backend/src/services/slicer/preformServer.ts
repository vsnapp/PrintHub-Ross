import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Client for the Formlabs Local API (PreFormServer) — the headless PreForm
 * job-preparation engine. PrintHub's resin prep UI collects orientation,
 * position, scale, material, layer thickness and support settings, and this
 * service translates that scene setup into Local API calls:
 *
 *   POST /scene/                          machine_type/material_code/layer_thickness_mm
 *   POST /scene/{id}/import-model/       file + orientation (Euler deg) + position + scale
 *   POST /scene/{id}/auto-orient/        optional, lets PreForm refine orientation
 *   POST /scene/{id}/auto-support/       density / touchpoint size / raft type
 *   POST /scene/{id}/auto-layout/        optional re-centering
 *   POST /scene/{id}/estimate-print-time/ exact print time from PreForm
 *   GET  /scene/{id}/                     material usage + layer count + bounds check
 *   POST /scene/{id}/save-form/          persist the prepared .form job file
 *   POST /scene/{id}/print/              upload to a Formlabs printer / Fleet Control
 *
 * Configuration:
 *   PREFORM_SERVER_URL  — URL of an already-running PreFormServer (e.g. http://localhost:44388)
 *   PREFORM_SERVER_PATH — path to the PreFormServer executable; PrintHub will
 *                         spawn and manage it on demand (Windows/macOS only).
 *
 * NOTE: PreFormServer must run on the same machine as this backend (it reads
 * model files from local paths).
 */

const DEFAULT_PORT = 44388;
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000; // model import/support generation can be slow

export interface PreformTransform {
  /** Euler angles in degrees. PreForm applies rotations in z, x, y order. */
  orientation?: { x: number; y: number; z: number };
  /** mm from build-platform center (x right, y away from operator). */
  position?: { x: number; y: number; z?: number };
  /** Uniform scale factor. */
  scale?: number;
}

export interface PreformSupportSettings {
  enabled: boolean;
  /** Unitless density factor, PreForm default 1.0 */
  density?: number;
  /** Touchpoint size in mm, PreForm default depends on material (~0.4mm) */
  touchpointSizeMm?: number;
  raftType?: 'FULL_RAFT' | 'MINI_RAFT' | 'MINI_RAFTS_ON_BP';
  internalSupportsEnabled?: boolean;
}

export interface PreformSceneSettings {
  machineType: string; // e.g. "FORM-4-0", "FORM-3-0"
  materialCode: string; // e.g. "FLGPBK05"
  layerThicknessMm: number | 'ADAPTIVE';
  printSetting?: string; // defaults to "DEFAULT"
}

export interface PreformPrepareOptions {
  stlPath: string;
  outputFormPath: string;
  scene: PreformSceneSettings;
  transform?: PreformTransform;
  autoOrient?: boolean;
  autoLayout?: boolean;
  supports?: PreformSupportSettings;
}

export interface PreformPrepareResult {
  sceneId: string;
  modelId: string;
  totalPrintTimeSeconds: number;
  printingTimeSeconds: number | null;
  volumeMl: number | null;
  layerCount: number | null;
  inBounds: boolean;
  /** Final orientation after optional auto-orient (Euler degrees). */
  finalOrientation: { x: number; y: number; z: number } | null;
  hasSupports: boolean;
  formFilePath: string;
}

export interface PreformDevice {
  id: string;
  product_name: string;
  status: string;
  is_connected: boolean;
  ip_address: string;
  ready_to_print_now?: boolean;
}

let spawnedServer: ChildProcess | null = null;
let spawnedServerUrl: string | null = null;

export function getConfiguredUrl(): string | null {
  if (process.env.PREFORM_SERVER_URL) {
    return process.env.PREFORM_SERVER_URL.replace(/\/$/, '');
  }
  if (spawnedServerUrl) {
    return spawnedServerUrl;
  }
  return null;
}

export function isConfigured(): boolean {
  return !!(process.env.PREFORM_SERVER_URL || process.env.PREFORM_SERVER_PATH);
}

async function request<T = any>(
  baseUrl: string,
  method: string,
  endpoint: string,
  body?: unknown,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let data: any = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      const message = data?.error || data?.message || (typeof data === 'string' ? data : response.statusText);
      throw new Error(`PreForm Server ${method} ${endpoint} failed (${response.status}): ${message}`);
    }
    return data as T;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`PreForm Server ${method} ${endpoint} timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function ping(baseUrl: string): Promise<boolean> {
  try {
    await request(baseUrl, 'GET', '/', undefined, 5000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a PreFormServer is reachable, spawning one when PREFORM_SERVER_PATH
 * is configured. Returns the base URL.
 */
export async function ensureServer(): Promise<string> {
  const explicitUrl = process.env.PREFORM_SERVER_URL?.replace(/\/$/, '');
  if (explicitUrl) {
    if (await ping(explicitUrl)) {
      return explicitUrl;
    }
    throw new Error(
      `PreForm Server is not reachable at ${explicitUrl}. ` +
      'Start the PreFormServer application or correct PREFORM_SERVER_URL.'
    );
  }

  const executable = process.env.PREFORM_SERVER_PATH;
  if (!executable) {
    throw new Error(
      'PreForm Server is not configured. Set PREFORM_SERVER_URL to a running PreFormServer ' +
      '(default http://localhost:44388) or PREFORM_SERVER_PATH to the PreFormServer executable.'
    );
  }

  if (spawnedServer && !spawnedServer.killed && spawnedServerUrl && await ping(spawnedServerUrl)) {
    return spawnedServerUrl;
  }

  if (!fs.existsSync(executable)) {
    throw new Error(`PreFormServer executable not found at ${executable}`);
  }

  const url = `http://127.0.0.1:${DEFAULT_PORT}`;
  spawnedServer = spawn(executable, ['--port', String(DEFAULT_PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  spawnedServer.on('exit', () => {
    spawnedServer = null;
    spawnedServerUrl = null;
  });

  // Wait for the server to report readiness (it prints "READY FOR INPUT").
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await ping(url)) {
      spawnedServerUrl = url;
      return url;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  spawnedServer.kill();
  spawnedServer = null;
  throw new Error('PreFormServer did not become ready within 60s');
}

export async function getStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  url: string | null;
  devices: PreformDevice[];
  materials: any[] | null;
}> {
  if (!isConfigured()) {
    return { configured: false, connected: false, url: null, devices: [], materials: null };
  }

  try {
    const url = await ensureServer();
    let devices: PreformDevice[] = [];
    let materials: any[] | null = null;
    try {
      const deviceData = await request<{ devices: PreformDevice[] }>(url, 'GET', '/devices/', undefined, 15000);
      devices = deviceData?.devices || [];
    } catch {
      // Device discovery is best-effort.
    }
    try {
      const materialData = await request<any>(url, 'GET', '/list-materials/', undefined, 15000);
      materials = materialData?.materials ?? materialData ?? null;
    } catch {
      // Older PreFormServer builds may not support material listing.
    }
    return { configured: true, connected: true, url, devices, materials };
  } catch {
    return { configured: true, connected: false, url: getConfiguredUrl(), devices: [], materials: null };
  }
}

/**
 * Run the full job-preparation pipeline, translating PrintHub's resin prep UI
 * state into a PreForm scene, and return PreForm's exact estimates.
 */
export async function prepareScene(options: PreformPrepareOptions): Promise<PreformPrepareResult> {
  const url = await ensureServer();
  const { scene, transform, supports } = options;

  if (!fs.existsSync(options.stlPath)) {
    throw new Error(`Model file not found: ${options.stlPath}`);
  }

  // 1. Create a scene with the printer/material/layer setup from the UI.
  const sceneModel = await request<{ id: string }>(url, 'POST', '/scene/', {
    machine_type: scene.machineType,
    material_code: scene.materialCode,
    print_setting: scene.printSetting || 'DEFAULT',
    layer_thickness_mm: scene.layerThicknessMm,
  });
  const sceneId = sceneModel.id || 'default';

  try {
    // 2. Import the model with the orientation/position/scale set in PrintHub.
    //    Orientation uses Euler angles in degrees (PreForm applies z, x, y).
    const importBody: Record<string, unknown> = {
      file: path.resolve(options.stlPath),
      repair_behavior: 'REPAIR',
      units: 'MILLIMETERS',
    };
    if (transform?.orientation) {
      importBody.orientation = {
        x: transform.orientation.x,
        y: transform.orientation.y,
        z: transform.orientation.z,
      };
    }
    if (transform?.position) {
      importBody.position = {
        x: transform.position.x,
        y: transform.position.y,
        z: transform.position.z ?? 0,
      };
    }
    if (transform?.scale !== undefined && transform.scale > 0 && transform.scale !== 1) {
      importBody.scale = transform.scale;
    }

    const model = await request<{ id: string }>(url, 'POST', `/scene/${sceneId}/import-model/`, importBody);
    const modelId = model.id;

    // 3. Optionally let PreForm refine the orientation.
    if (options.autoOrient) {
      await request(url, 'POST', `/scene/${sceneId}/auto-orient/`, { models: [modelId] });
    }

    // 4. Generate supports with the UI's support settings.
    if (supports?.enabled) {
      const supportBody: Record<string, unknown> = { models: [modelId] };
      if (supports.density !== undefined) {
        supportBody.density = supports.density;
      }
      if (supports.touchpointSizeMm !== undefined) {
        supportBody.touchpoint_size_mm = supports.touchpointSizeMm;
      }
      if (supports.raftType) {
        supportBody.raft_type = supports.raftType;
      }
      if (supports.internalSupportsEnabled !== undefined) {
        supportBody.internal_supports_enabled = supports.internalSupportsEnabled;
      }
      await request(url, 'POST', `/scene/${sceneId}/auto-support/`, supportBody);
    }

    // 5. Optionally re-center/layout (useful after auto-orient).
    if (options.autoLayout) {
      await request(url, 'POST', `/scene/${sceneId}/auto-layout/`, { models: [modelId] });
    }

    // 6. Exact print-time estimate from PreForm.
    const estimate = await request<{
      total_print_time_s?: number;
      printing_time_s?: number;
    }>(url, 'POST', `/scene/${sceneId}/estimate-print-time/`);

    // 7. Scene info: resin usage, layer count, bounds and final orientation.
    const sceneInfo = await request<{
      models?: Array<{
        id: string;
        in_bounds?: boolean;
        has_supports?: boolean;
        orientation?: { x: number; y: number; z: number };
      }>;
      material_usage?: { volume_ml?: number };
      layer_count?: number;
    }>(url, 'GET', `/scene/${sceneId}/`);

    const sceneModelInfo = sceneInfo.models?.find((entry) => entry.id === modelId) || sceneInfo.models?.[0];

    // 8. Save the prepared .form job file.
    fs.mkdirSync(path.dirname(options.outputFormPath), { recursive: true });
    await request(url, 'POST', `/scene/${sceneId}/save-form/`, {
      file: path.resolve(options.outputFormPath),
    });

    if (!fs.existsSync(options.outputFormPath)) {
      throw new Error('PreForm Server reported success but the .form file was not created');
    }

    return {
      sceneId,
      modelId,
      totalPrintTimeSeconds: estimate.total_print_time_s ?? 0,
      printingTimeSeconds: estimate.printing_time_s ?? null,
      volumeMl: sceneInfo.material_usage?.volume_ml ?? null,
      layerCount: sceneInfo.layer_count ?? null,
      inBounds: sceneModelInfo?.in_bounds !== false,
      finalOrientation: sceneModelInfo?.orientation ?? null,
      hasSupports: sceneModelInfo?.has_supports ?? supports?.enabled ?? false,
      formFilePath: options.outputFormPath,
    };
  } finally {
    // Scenes accumulate in PreFormServer's cache; clean up best-effort.
    request(url, 'DELETE', `/scene/${sceneId}/`).catch(() => undefined);
  }
}

/**
 * Upload a previously prepared .form file to a Formlabs printer (by serial
 * name or IP) or Fleet Control queue.
 */
export async function printForm(formFilePath: string, printer: string, jobName: string): Promise<{ jobId: string | null }> {
  const url = await ensureServer();

  if (!fs.existsSync(formFilePath)) {
    throw new Error(`Prepared .form file not found: ${formFilePath}`);
  }

  const scene = await request<{ id: string }>(url, 'POST', '/load-form/', {
    file: path.resolve(formFilePath),
  });
  const sceneId = scene.id || 'default';

  try {
    const result = await request<{ job_id?: string }>(url, 'POST', `/scene/${sceneId}/print/`, {
      printer,
      job_name: jobName,
    });
    return { jobId: result.job_id ?? null };
  } finally {
    request(url, 'DELETE', `/scene/${sceneId}/`).catch(() => undefined);
  }
}

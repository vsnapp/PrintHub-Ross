/**
 * Mock PreFormServer implementing the subset of the Formlabs Local API that
 * PrintHub uses (per the official OpenAPI spec). Records every request body so
 * tests can assert PrintHub's resin-prep UI state is translated correctly.
 *
 * Run standalone: npx tsx test_mock_preform_server.ts [port]
 */
import express from 'express';
import fs from 'fs';

export interface RecordedCall {
  method: string;
  path: string;
  body: any;
}

export function createMockPreformServer() {
  const app = express();
  app.use(express.json());

  const records: RecordedCall[] = [];
  const scenes = new Map<string, any>();
  let sceneCounter = 0;

  app.use((req, _res, next) => {
    records.push({ method: req.method, path: req.path, body: req.body });
    next();
  });

  // Root ping (used for readiness checks)
  app.get('/', (_req, res) => {
    res.json({ name: 'MockPreFormServer', version: '0.9.21' });
  });

  app.post('/scene/', (req, res) => {
    const { machine_type, material_code, layer_thickness_mm } = req.body || {};
    if (!machine_type || !material_code || layer_thickness_mm === undefined) {
      return res.status(400).json({ error: 'machine_type, material_code, layer_thickness_mm required' });
    }
    sceneCounter += 1;
    const id = `scene-${sceneCounter}`;
    scenes.set(id, {
      id,
      scene_settings: req.body,
      models: [],
      layer_count: null,
      material_usage: null,
    });
    res.json({ id, models: [], scene_settings: req.body });
  });

  app.post('/scene/:sceneId/import-model/', (req, res) => {
    const scene = scenes.get(req.params.sceneId);
    if (!scene) {
      return res.status(400).json({ error: 'Unknown scene' });
    }
    if (!req.body?.file || !fs.existsSync(req.body.file)) {
      return res.status(400).json({ error: `Model file not found: ${req.body?.file}` });
    }
    const model = {
      id: `model-${scene.models.length + 1}`,
      name: req.body.name || 'model',
      orientation: req.body.orientation || { x: 0, y: 0, z: 0 },
      position: req.body.position || { x: 0, y: 0, z: 0 },
      scale: req.body.scale ?? 1,
      in_bounds: true,
      has_supports: false,
    };
    scene.models.push(model);
    res.json(model);
  });

  app.post('/scene/:sceneId/auto-orient/', (req, res) => {
    const scene = scenes.get(req.params.sceneId);
    if (!scene) {
      return res.status(400).json({ error: 'Unknown scene' });
    }
    // Pretend PreForm tilted the model for optimal peel forces.
    for (const model of scene.models) {
      model.orientation = { x: model.orientation.x + 15, y: model.orientation.y, z: model.orientation.z };
    }
    res.json({});
  });

  app.post('/scene/:sceneId/auto-support/', (req, res) => {
    const scene = scenes.get(req.params.sceneId);
    if (!scene) {
      return res.status(400).json({ error: 'Unknown scene' });
    }
    for (const model of scene.models) {
      model.has_supports = true;
    }
    res.json({});
  });

  app.post('/scene/:sceneId/auto-layout/', (req, res) => {
    if (!scenes.get(req.params.sceneId)) {
      return res.status(400).json({ error: 'Unknown scene' });
    }
    res.json({});
  });

  app.post('/scene/:sceneId/estimate-print-time/', (req, res) => {
    const scene = scenes.get(req.params.sceneId);
    if (!scene) {
      return res.status(400).json({ error: 'Unknown scene' });
    }
    // Deterministic fake estimate: 90 minutes total.
    scene.layer_count = 730;
    scene.material_usage = { volume_ml: 27.4, unsupported_volume_ml: 21.1 };
    res.json({ total_print_time_s: 5400, preprint_time_s: 300, printing_time_s: 5100 });
  });

  app.get('/scene/:sceneId/', (req, res) => {
    const scene = scenes.get(req.params.sceneId);
    if (!scene) {
      return res.status(400).json({ error: 'Unknown scene' });
    }
    res.json(scene);
  });

  app.post('/scene/:sceneId/save-form/', (req, res) => {
    const scene = scenes.get(req.params.sceneId);
    if (!scene) {
      return res.status(400).json({ error: 'Unknown scene' });
    }
    if (!req.body?.file) {
      return res.status(400).json({ error: 'file required' });
    }
    fs.writeFileSync(req.body.file, `MOCK_FORM_FILE\n${JSON.stringify(scene, null, 2)}`);
    res.json({});
  });

  app.delete('/scene/:sceneId/', (req, res) => {
    scenes.delete(req.params.sceneId);
    res.json({});
  });

  app.post('/load-form/', (req, res) => {
    if (!req.body?.file || !fs.existsSync(req.body.file)) {
      return res.status(400).json({ error: `Form file not found: ${req.body?.file}` });
    }
    sceneCounter += 1;
    const id = `scene-${sceneCounter}`;
    scenes.set(id, { id, models: [{ id: 'model-1', has_supports: true }], loaded_from: req.body.file });
    res.json({ id });
  });

  app.post('/scene/:sceneId/print/', (req, res) => {
    const scene = scenes.get(req.params.sceneId);
    if (!scene) {
      return res.status(400).json({ error: 'Unknown scene' });
    }
    if (!req.body?.printer || !req.body?.job_name) {
      return res.status(400).json({ error: 'printer and job_name required' });
    }
    res.json({ job_id: `formlabs-job-${Date.now()}` });
  });

  app.get('/devices/', (_req, res) => {
    res.json({
      count: 1,
      devices: [
        {
          id: 'Form4-MOCK01',
          product_name: 'Form 4',
          status: 'IDLE',
          is_connected: true,
          connection_type: 'ETHERNET',
          ip_address: '192.168.1.77',
          firmware_version: '1.2.3',
          ready_to_print_now: true,
        },
      ],
    });
  });

  app.get('/list-materials/', (_req, res) => {
    res.json({
      materials: [
        { material_code: 'FLGPBK05', display_name: 'Black V5' },
        { material_code: 'FLGPGR04', display_name: 'Grey V4' },
      ],
    });
  });

  // Test-only endpoint to read the recorded requests.
  app.get('/_records', (_req, res) => {
    res.json(records);
  });

  return { app, records };
}

if (require.main === module) {
  const port = Number(process.argv[2]) || 44999;
  const { app } = createMockPreformServer();
  app.listen(port, () => {
    console.log(`Mock PreFormServer listening on http://localhost:${port}`);
    console.log('READY FOR INPUT');
  });
}

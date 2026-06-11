/**
 * Integration test for the resin prep pipeline: PrintHub UI state ->
 * /api/slicers/preform/prepare -> Formlabs Local API calls.
 *
 * Uses the mock PreFormServer (test_mock_preform_server.ts) and asserts the
 * exact translation of orientation/position/scale/material/support settings.
 *
 * Usage (expects a FRESH database):
 *   rm -f /tmp/printhub-preform.db
 *   PORT=3103 DATABASE_URL=/tmp/printhub-preform.db PREFORM_SERVER_URL=http://localhost:44999 npx tsx src/index.ts
 *   API_URL=http://localhost:3103 MOCK_PORT=44999 npx tsx test_preform_flow.ts
 */
import { createMockPreformServer, RecordedCall } from './test_mock_preform_server';

const API_URL = process.env.API_URL || 'http://localhost:3103';
const MOCK_PORT = Number(process.env.MOCK_PORT) || 44999;

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function api(method: string, path: string, token?: string, body?: unknown) {
  const response = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

function makeCubeStl(sizeMm: number): Buffer {
  const s = sizeMm;
  const corners: Array<[number, number, number]> = [
    [0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0],
    [0, 0, s], [s, 0, s], [s, s, s], [0, s, s],
  ];
  const faces: Array<[number, number, number]> = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6],
    [1, 2, 6], [1, 6, 5], [3, 0, 4], [3, 4, 7],
  ];
  const buffer = Buffer.alloc(84 + faces.length * 50);
  buffer.writeUInt32LE(faces.length, 80);
  let offset = 84;
  for (const [a, b, c] of faces) {
    offset += 12;
    for (const idx of [a, b, c]) {
      buffer.writeFloatLE(corners[idx][0], offset);
      buffer.writeFloatLE(corners[idx][1], offset + 4);
      buffer.writeFloatLE(corners[idx][2], offset + 8);
      offset += 12;
    }
    offset += 2;
  }
  return buffer;
}

const findCall = (records: RecordedCall[], method: string, pattern: RegExp) =>
  records.find((record) => record.method === method && pattern.test(record.path));

async function main() {
  // Start mock PreFormServer in-process.
  const { app } = createMockPreformServer();
  const server = app.listen(MOCK_PORT);
  await new Promise((resolve) => server.on('listening', resolve));
  console.log(`Mock PreFormServer on :${MOCK_PORT}`);

  console.log('\n=== 1. Setup (admin, student STL, resin job, resin printer) ===');
  const adminLogin = await api('POST', '/auth/login', undefined, { username: 'admin', password: 'admin123' });
  check('admin login', adminLogin.status === 200);
  const token = adminLogin.data.token;

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(makeCubeStl(20))]), 'resin-cube.stl');
  const upload = await fetch(`${API_URL}/api/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const uploadData: any = await upload.json();
  check('STL uploaded', upload.status === 201);
  const stlFileId = uploadData.id;

  const job = await api('POST', '/jobs', token, {
    name: 'Resin test part',
    file_id: stlFileId,
    deadline: new Date(Date.now() + 86400000).toISOString(),
    printer_type: 'resin',
  });
  check('resin job created', job.status === 201);
  const jobId = job.data.id;

  const printer = await api('POST', '/printers', token, {
    name: 'Form 4 Station',
    type: 'resin',
    model: 'Form 4',
    slicer: 'preform',
    status: 'online',
    integration_type: 'formlabs',
  });
  check('resin printer created', printer.status === 201);
  const printerId = printer.data.printer?.id;

  console.log('\n=== 2. PreForm Server status ===');
  const status = await api('GET', '/slicers/preform/status', token);
  check('status: configured + connected', status.data?.configured === true && status.data?.connected === true,
    JSON.stringify(status.data));
  check('status: devices discovered', status.data?.devices?.[0]?.id === 'Form4-MOCK01');
  check('status: materials listed', Array.isArray(status.data?.materials) && status.data.materials.length === 2);

  console.log('\n=== 3. Prepare: UI scene setup -> PreForm translation ===');
  const prepare = await api('POST', '/slicers/preform/prepare', token, {
    file_id: stlFileId,
    job_id: jobId,
    printer_id: printerId,
    scene: {
      machine_type: 'FORM-4-0',
      material_code: 'FLGPBK05',
      layer_thickness_mm: 0.05,
    },
    transform: {
      orientation: { x: 45, y: 0, z: 90 },
      position: { x: 10, y: -5 },
      scale: 1.5,
    },
    auto_orient: true,
    auto_layout: true,
    supports: {
      enabled: true,
      density: 1.2,
      touchpoint_size_mm: 0.45,
      raft_type: 'FULL_RAFT',
      internal_supports_enabled: true,
    },
  });
  check('prepare succeeded', prepare.status === 200, JSON.stringify(prepare.data).slice(0, 400));
  check('estimate from PreForm (5400s -> 90min)', prepare.data?.estimated_time_minutes === 90);
  check('resin volume returned', prepare.data?.volume_ml === 27.4);
  check('layer count returned', prepare.data?.layer_count === 730);
  check('.form file registered', !!prepare.data?.form_file_id);
  check('supports applied', prepare.data?.has_supports === true);
  check('auto-orient result returned (x 45->60)', prepare.data?.final_orientation?.x === 60,
    JSON.stringify(prepare.data?.final_orientation));

  // Verify the exact payloads the mock PreFormServer received.
  const recordsResponse = await fetch(`http://localhost:${MOCK_PORT}/_records`);
  const records: RecordedCall[] = await recordsResponse.json();

  const sceneCall = findCall(records, 'POST', /^\/scene\/$/);
  check('scene created with machine/material/layer from UI',
    sceneCall?.body?.machine_type === 'FORM-4-0'
      && sceneCall?.body?.material_code === 'FLGPBK05'
      && sceneCall?.body?.layer_thickness_mm === 0.05
      && sceneCall?.body?.print_setting === 'DEFAULT',
    JSON.stringify(sceneCall?.body));

  const importCall = findCall(records, 'POST', /import-model\/$/);
  check('orientation translated (Euler deg x45 y0 z90)',
    importCall?.body?.orientation?.x === 45
      && importCall?.body?.orientation?.y === 0
      && importCall?.body?.orientation?.z === 90,
    JSON.stringify(importCall?.body?.orientation));
  check('position translated (x10 y-5 z0)',
    importCall?.body?.position?.x === 10
      && importCall?.body?.position?.y === -5
      && importCall?.body?.position?.z === 0,
    JSON.stringify(importCall?.body?.position));
  check('scale translated (1.5)', importCall?.body?.scale === 1.5);
  check('model repaired + mm units', importCall?.body?.repair_behavior === 'REPAIR' && importCall?.body?.units === 'MILLIMETERS');

  const orientCall = findCall(records, 'POST', /auto-orient\/$/);
  check('auto-orient requested on imported model', Array.isArray(orientCall?.body?.models) && orientCall?.body?.models.length === 1);

  const supportCall = findCall(records, 'POST', /auto-support\/$/);
  check('support settings translated (density/touchpoint/raft/internal)',
    supportCall?.body?.density === 1.2
      && supportCall?.body?.touchpoint_size_mm === 0.45
      && supportCall?.body?.raft_type === 'FULL_RAFT'
      && supportCall?.body?.internal_supports_enabled === true,
    JSON.stringify(supportCall?.body));

  const layoutCall = findCall(records, 'POST', /auto-layout\/$/);
  check('auto-layout requested', !!layoutCall);

  const saveCall = findCall(records, 'POST', /save-form\/$/);
  check('.form saved to uploads', typeof saveCall?.body?.file === 'string' && saveCall.body.file.includes('uploads'));

  const deleteCall = findCall(records, 'DELETE', /^\/scene\/scene-1\/$/);
  check('scene cleaned up after prepare', !!deleteCall);

  console.log('\n=== 4. Job estimate updated from PreForm ===');
  const jobAfter = await api('GET', `/jobs/${jobId}`, token);
  check('job estimate = PreForm time', jobAfter.data?.estimated_time_minutes === 90);
  check('job slicer = preform', jobAfter.data?.slicer === 'preform');
  check('job linked to .form file', jobAfter.data?.gcode_file_id === prepare.data?.form_file_id);

  console.log('\n=== 5. Print via PreForm Server ===');
  const print = await api('POST', '/slicers/preform/print', token, {
    form_file_id: prepare.data.form_file_id,
    printer: 'Form4-MOCK01',
    job_id: jobId,
    printer_id: printerId,
  });
  check('print dispatched', print.status === 200 && print.data?.success === true, JSON.stringify(print.data));
  check('formlabs job id returned', typeof print.data?.formlabs_job_id === 'string');

  const printRecords: RecordedCall[] = await (await fetch(`http://localhost:${MOCK_PORT}/_records`)).json();
  const loadCall = findCall(printRecords, 'POST', /^\/load-form\/$/);
  check('prepared .form loaded for printing', typeof loadCall?.body?.file === 'string');
  const printCall = findCall(printRecords, 'POST', /\/print\/$/);
  check('print request carries printer + job name',
    printCall?.body?.printer === 'Form4-MOCK01' && printCall?.body?.job_name === 'Resin test part',
    JSON.stringify(printCall?.body));

  const jobPrinting = await api('GET', `/jobs/${jobId}`, token);
  check('job marked printing', jobPrinting.data?.status === 'printing');

  console.log('\n=== 6. Validation ===');
  const badPrepare = await api('POST', '/slicers/preform/prepare', token, {
    file_id: stlFileId,
    scene: { machine_type: 'FORM-4-0' },
  });
  check('missing material rejected', badPrepare.status === 400);

  server.close();
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Preform flow test crashed:', error);
  process.exit(1);
});

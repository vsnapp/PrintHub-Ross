/**
 * End-to-end smoke test for the full print farm flow.
 *
 * Usage (expects a FRESH database; counts assume no pre-existing printers/jobs):
 *   rm -f /tmp/printhub-e2e.db
 *   PORT=3100 DATABASE_URL=/tmp/printhub-e2e.db npx tsx src/index.ts   (in one shell)
 *   API_URL=http://localhost:3100 npx tsx test_e2e_flow.ts             (in another)
 *
 * Covers: student registration -> STL upload -> estimate -> job creation ->
 * admin printer setup w/ slicer assignment -> approval -> embedded slicing ->
 * queue optimization with work hours -> completion -> WebSocket notification.
 */
import WebSocket from 'ws';

const API_URL = process.env.API_URL || 'http://localhost:3100';

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
  const v = (x: number, y: number, z: number) => [x, y, z] as const;
  const corners = [
    v(0, 0, 0), v(s, 0, 0), v(s, s, 0), v(0, s, 0),
    v(0, 0, s), v(s, 0, s), v(s, s, s), v(0, s, s),
  ];
  const faces: Array<[number, number, number]> = [
    [0, 2, 1], [0, 3, 2],
    [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4],
    [2, 3, 7], [2, 7, 6],
    [1, 2, 6], [1, 6, 5],
    [3, 0, 4], [3, 4, 7],
  ];
  const buffer = Buffer.alloc(84 + faces.length * 50);
  buffer.write('e2e test cube', 0, 'utf-8');
  buffer.writeUInt32LE(faces.length, 80);
  let offset = 84;
  for (const [a, b, c] of faces) {
    offset += 12;
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
  // --- WebSocket listener (collects broadcasts during the test) ---
  const wsEvents: any[] = [];
  const ws = new WebSocket(API_URL.replace('http', 'ws'));
  ws.on('message', (raw) => {
    try {
      wsEvents.push(JSON.parse(raw.toString()));
    } catch {
      // ignore
    }
  });
  await new Promise((resolve) => ws.on('open', resolve));

  console.log('\n=== 1. Authentication ===');
  const adminLogin = await api('POST', '/auth/login', undefined, { username: 'admin', password: 'admin123' });
  check('admin login', adminLogin.status === 200 && !!adminLogin.data.token);
  const adminToken = adminLogin.data.token;

  const suffix = Date.now();
  const studentRegister = await api('POST', '/auth/register', undefined, {
    username: `student${suffix}`,
    email: `student${suffix}@school.edu`,
    password: 'password123',
  });
  check('student registration', studentRegister.status === 201 || studentRegister.status === 200,
    JSON.stringify(studentRegister.data));
  const studentToken = studentRegister.data.token;
  const studentId = studentRegister.data.user?.id;
  check('student role is student', studentRegister.data.user?.role === 'student');

  console.log('\n=== 2. Student uploads STL + gets estimate ===');
  const stl = makeCubeStl(20);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(stl)]), 'cube20.stl');
  const uploadResponse = await fetch(`${API_URL}/api/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${studentToken}` },
    body: form,
  });
  const uploadData: any = await uploadResponse.json();
  check('STL upload', uploadResponse.status === 201 && !!uploadData.id, JSON.stringify(uploadData));
  const stlFileId = uploadData.id;

  const estimate = await api('POST', `/files/${stlFileId}/estimate`, studentToken, { printer_type: 'fdm' });
  check('geometry estimate returned', estimate.status === 200 && estimate.data.estimated_time_minutes > 0,
    JSON.stringify(estimate.data));
  console.log(`        estimate: ${estimate.data.estimated_time_minutes} min, ~${estimate.data.estimated_filament_grams}g`);

  console.log('\n=== 3. Student creates job ===');
  const deadline = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const jobCreate = await api('POST', '/jobs', studentToken, {
    name: 'E2E calibration cube',
    file_id: stlFileId,
    deadline,
    priority: 'high',
    printer_type: 'fdm',
  });
  check('job created', jobCreate.status === 201 && !!jobCreate.data.id, JSON.stringify(jobCreate.data));
  check('job auto-estimated from geometry', jobCreate.data.estimated_time_minutes > 0);
  const jobId = jobCreate.data.id;

  console.log('\n=== 4. Admin sets up printer with slicer + default settings ===');
  const printerCreate = await api('POST', '/printers', adminToken, {
    name: 'E2E Prusa MK4',
    type: 'fdm',
    model: 'Prusa MK4',
    slicer: 'prusa',
    status: 'online',
    slicer_settings: {
      layerHeight: 0.25,
      infill: 18,
      nozzleTemperature: 212,
      bedTemperature: 62,
      supportEnabled: false,
    },
    speed_multiplier: 1.0,
  });
  check('printer created with slicer assignment', printerCreate.status === 201,
    JSON.stringify(printerCreate.data));
  const printerId = printerCreate.data.printer?.id;
  check('printer stored slicer=prusa', printerCreate.data.printer?.slicer === 'prusa');
  check('printer stored default slicer settings',
    (printerCreate.data.printer?.slicer_settings || '').includes('0.25'));

  const badSlicer = await api('POST', '/printers', adminToken, {
    name: 'Bad', type: 'fdm', model: 'x', slicer: 'not-a-slicer',
  });
  check('invalid slicer rejected', badSlicer.status === 400);

  console.log('\n=== 5. Slicer engine detection ===');
  const slicers = await api('GET', '/slicers', adminToken);
  check('slicer list returned', slicers.status === 200 && Array.isArray(slicers.data.slicers));
  const prusaInfo = slicers.data.slicers?.find((slicer: any) => slicer.id === 'prusa');
  check('PrusaSlicer detected on server', prusaInfo?.available === true && prusaInfo?.cliSlicing === true);
  const allIds = (slicers.data.slicers || []).map((slicer: any) => slicer.id).sort().join(',');
  check('all five slicers reported', allIds === 'bambu,cura,orca,preform,prusa', allIds);

  const slicersAsStudent = await api('GET', '/slicers', studentToken);
  check('students cannot access slicer admin API', slicersAsStudent.status === 403);

  console.log('\n=== 6. Approve + slice job (embedded slicing) ===');
  const approve = await api('PATCH', `/jobs/${jobId}/approve`, adminToken);
  check('job approved', approve.status === 200 && approve.data.status === 'approved');

  const slice = await api('POST', '/slicers/slice', adminToken, {
    file_id: stlFileId,
    printer_id: printerId,
    job_id: jobId,
    overrides: { layerHeight: 0.3, infill: 10 },
  });
  check('server-side slicing succeeded', slice.status === 200 && slice.data.method === 'cli-slice',
    JSON.stringify(slice.data).slice(0, 400));
  check('gcode file registered', !!slice.data.gcode_file_id);
  check('print time parsed from gcode', slice.data.estimated_time_minutes > 0);
  console.log(`        sliced with ${slice.data.slicer} in ${slice.data.duration_ms}ms -> ${slice.data.estimated_time_minutes} min, ${slice.data.estimated_filament_grams}g, ${slice.data.layer_count} layers`);
  check('layer height override applied (~67 layers @0.3mm for 20mm)',
    slice.data.layer_count > 55 && slice.data.layer_count < 75, String(slice.data.layer_count));

  const jobAfterSlice = await api('GET', `/jobs/${jobId}`, adminToken);
  check('job estimate updated from slice', jobAfterSlice.data.estimated_time_minutes === slice.data.estimated_time_minutes);
  check('job linked to gcode', jobAfterSlice.data.gcode_file_id === slice.data.gcode_file_id);
  check('job slicer recorded', jobAfterSlice.data.slicer === 'prusa');

  const studentGcodeAccess = await api('GET', `/files/${slice.data.gcode_file_id}`, studentToken);
  check('students cannot download operator gcode', studentGcodeAccess.status === 403);

  console.log('\n=== 7. Work hours + queue optimization ===');
  const setHours = await api('PUT', '/workhours', adminToken, { start_hour: 7, end_hour: 17 });
  check('work hours updated', setHours.status === 200 && setHours.data.start_hour === 7);

  const optimize = await api('POST', '/queue/optimize', adminToken);
  check('queue optimized', optimize.status === 200 && optimize.data.success === true,
    JSON.stringify(optimize.data));
  check('job was scheduled', optimize.data.scheduled === 1, JSON.stringify(optimize.data));
  check('optimizer used configured work hours', optimize.data.workHours?.start === 7 && optimize.data.workHours?.end === 17);

  const schedule = await api('GET', '/queue/schedule', adminToken);
  check('schedule has entry', schedule.status === 200 && schedule.data.length === 1);
  const entry = schedule.data[0];
  check('schedule entry has correct printer (TEXT id preserved)', entry?.printer_id === printerId, `${entry?.printer_id} vs ${printerId}`);
  check('schedule entry has expected completion time', !!entry?.end_time);
  console.log(`        scheduled on ${entry?.printer_name}: ${entry?.start_time} -> ${entry?.end_time}`);

  const studentSchedule = await api('GET', '/queue/schedule', studentToken);
  check('student sees own scheduled print', studentSchedule.data.length === 1 && studentSchedule.data[0].user_id === studentId);

  const jobAfterOptimize = await api('GET', `/jobs/${jobId}`, studentToken);
  check('student sees job as scheduled', jobAfterOptimize.data.status === 'scheduled');

  console.log('\n=== 8. Completion + notifications ===');
  const complete = await api('PATCH', `/jobs/${jobId}`, adminToken, { status: 'completed' });
  check('job completed', complete.status === 200 && complete.data.status === 'completed');

  // Give broadcasts a moment to arrive.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const eventTypes = wsEvents.map((event) => event.type);
  check('WS job:created broadcast', eventTypes.includes('job:created'));
  check('WS job:approved broadcast', eventTypes.includes('job:approved'));
  check('WS job:updated broadcast (slice/schedule)', eventTypes.includes('job:updated'));
  check('WS queue:optimized broadcast', eventTypes.includes('queue:optimized'));
  const completedEvent = wsEvents.find((event) => event.type === 'job:completed');
  check('WS job:completed broadcast with owner + name',
    completedEvent?.jobId === jobId && completedEvent?.userId === studentId && completedEvent?.jobName === 'E2E calibration cube',
    JSON.stringify(completedEvent));

  console.log('\n=== 9. Student permission checks ===');
  const studentStatusChange = await api('PATCH', `/jobs/${jobId}`, studentToken, { status: 'printing' });
  check('students cannot change job status', studentStatusChange.status === 403);
  const studentSliceAttempt = await api('POST', '/slicers/slice', studentToken, { file_id: stlFileId });
  check('students cannot trigger slicing', studentSliceAttempt.status === 403);

  ws.close();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('E2E test crashed:', error);
  process.exit(1);
});

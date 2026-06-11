import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDatabase } from '../database';
import { authenticateToken, requireRole } from '../middleware/auth';
import {
  getStatus,
  isConfigured,
  prepareScene,
  printForm,
  PreformSupportSettings,
} from '../services/slicer/preformServer';
import { broadcast } from '../websocket';

const router = express.Router();
const uploadsDir = path.join(__dirname, '../../uploads');

const operatorOnly = [authenticateToken, requireRole(['operator', 'admin', 'org_admin'])] as const;

// PreForm Server availability + discovered Formlabs devices + materials
router.get('/status', ...operatorOnly, async (req, res) => {
  try {
    const status = await getStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to query PreForm Server' });
  }
});

/**
 * Prepare a resin job: translate PrintHub's resin prep UI state (orientation,
 * position, scale, material, layer thickness, support settings) into a PreForm
 * scene, returning PreForm's exact estimates and the saved .form file.
 *
 * Body: {
 *   file_id: number,                  // STL file
 *   job_id?: number,                  // update this job's estimate
 *   printer_id?: string,              // PrintHub printer row (for job_printer_times)
 *   scene: { machine_type, material_code, layer_thickness_mm, print_setting? },
 *   transform?: { orientation?: {x,y,z}, position?: {x,y,z?}, scale? },
 *   auto_orient?: boolean,
 *   auto_layout?: boolean,
 *   supports?: { enabled, density?, touchpoint_size_mm?, raft_type?, internal_supports_enabled? }
 * }
 */
router.post('/prepare', ...operatorOnly, async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({
        error: 'PreForm Server is not configured. Set PREFORM_SERVER_URL (running PreFormServer, default http://localhost:44388) or PREFORM_SERVER_PATH on the backend.',
      });
    }

    const { file_id, job_id, printer_id, scene, transform, auto_orient, auto_layout, supports } = req.body || {};
    const user_id = (req as any).user.id;

    if (!file_id) {
      return res.status(400).json({ error: 'file_id is required' });
    }
    if (!scene?.machine_type || !scene?.material_code || scene?.layer_thickness_mm === undefined) {
      return res.status(400).json({ error: 'scene.machine_type, scene.material_code and scene.layer_thickness_mm are required' });
    }

    const db = getDatabase();
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(file_id) as any;
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    if (path.extname(file.original_name).toLowerCase() !== '.stl') {
      return res.status(400).json({ error: 'Only STL files can be prepared for resin printing' });
    }
    if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    const supportSettings: PreformSupportSettings | undefined = supports
      ? {
          enabled: supports.enabled !== false,
          density: numeric(supports.density),
          touchpointSizeMm: numeric(supports.touchpoint_size_mm),
          raftType: ['FULL_RAFT', 'MINI_RAFT', 'MINI_RAFTS_ON_BP'].includes(supports.raft_type)
            ? supports.raft_type
            : undefined,
          internalSupportsEnabled: typeof supports.internal_supports_enabled === 'boolean'
            ? supports.internal_supports_enabled
            : undefined,
        }
      : undefined;

    const stem = path.basename(file.original_name, path.extname(file.original_name));
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
    const outputName = `${uniqueSuffix}.form`;
    const outputFormPath = path.join(uploadsDir, outputName);

    const result = await prepareScene({
      stlPath: file.file_path,
      outputFormPath,
      scene: {
        machineType: String(scene.machine_type),
        materialCode: String(scene.material_code),
        layerThicknessMm: scene.layer_thickness_mm === 'ADAPTIVE' ? 'ADAPTIVE' : Number(scene.layer_thickness_mm),
        printSetting: scene.print_setting ? String(scene.print_setting) : undefined,
      },
      transform: transform
        ? {
            orientation: euler(transform.orientation),
            position: transform.position
              ? {
                  x: Number(transform.position.x) || 0,
                  y: Number(transform.position.y) || 0,
                  z: numeric(transform.position.z),
                }
              : undefined,
            scale: numeric(transform.scale),
          }
        : undefined,
      autoOrient: auto_orient === true,
      autoLayout: auto_layout === true,
      supports: supportSettings,
    });

    // Register the prepared .form file so it can be downloaded / printed later.
    const checksum = crypto.createHash('md5').update(fs.readFileSync(outputFormPath)).digest('hex');
    const formSize = fs.statSync(outputFormPath).size;
    const insert = db.prepare(`
      INSERT INTO files (
        user_id, original_name, stored_name, file_path, file_size,
        file_type, checksum, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, '.form', ?, datetime('now'))
    `).run(user_id, `${stem}.form`, outputName, outputFormPath, formSize, checksum);
    const formFileId = Number(insert.lastInsertRowid);

    const estimatedMinutes = result.totalPrintTimeSeconds > 0
      ? Math.max(1, Math.round(result.totalPrintTimeSeconds / 60))
      : null;

    if (job_id && estimatedMinutes) {
      db.prepare(`
        UPDATE print_jobs
        SET estimated_time_minutes = ?, slicer = 'preform', gcode_file_id = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(estimatedMinutes, formFileId, job_id);

      if (printer_id) {
        const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(printer_id) as any;
        if (printer) {
          const multiplier = printer.speed_multiplier && printer.speed_multiplier > 0 ? printer.speed_multiplier : 1;
          db.prepare('DELETE FROM job_printer_times WHERE job_id = ? AND printer_id = ?').run(job_id, printer.id);
          db.prepare('INSERT INTO job_printer_times (job_id, printer_id, estimated_minutes) VALUES (?, ?, ?)')
            .run(job_id, printer.id, Math.max(1, Math.round(estimatedMinutes / multiplier)));
        }
      }
      broadcast('job:updated', { jobId: Number(job_id) });
    }

    res.json({
      method: 'preform-prepare',
      form_file_id: formFileId,
      form_file_name: `${stem}.form`,
      form_file_size: formSize,
      estimated_time_minutes: estimatedMinutes,
      total_print_time_s: result.totalPrintTimeSeconds,
      volume_ml: result.volumeMl,
      layer_count: result.layerCount,
      in_bounds: result.inBounds,
      has_supports: result.hasSupports,
      final_orientation: result.finalOrientation,
    });
  } catch (error: any) {
    console.error('Error preparing resin job:', error);
    res.status(500).json({ error: error?.message || 'Failed to prepare resin job' });
  }
});

/**
 * Upload a prepared .form file to a Formlabs printer via PreForm Server.
 * Body: { form_file_id: number, printer: string (serial name or IP), job_id?, printer_id?, job_name? }
 */
router.post('/print', ...operatorOnly, async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ error: 'PreForm Server is not configured.' });
    }

    const { form_file_id, printer, job_id, printer_id, job_name } = req.body || {};
    if (!form_file_id || !printer) {
      return res.status(400).json({ error: 'form_file_id and printer are required' });
    }

    const db = getDatabase();
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(form_file_id) as any;
    if (!file) {
      return res.status(404).json({ error: 'Form file not found' });
    }
    if (path.extname(file.original_name).toLowerCase() !== '.form') {
      return res.status(400).json({ error: 'form_file_id must reference a prepared .form file' });
    }

    const job = job_id
      ? db.prepare('SELECT id, name, user_id FROM print_jobs WHERE id = ?').get(job_id) as any
      : null;
    const name = job_name || job?.name || path.basename(file.original_name, '.form');
    const result = await printForm(file.file_path, String(printer), String(name));

    if (job) {
      db.prepare("UPDATE print_jobs SET status = 'printing', updated_at = datetime('now') WHERE id = ?").run(job.id);
      broadcast('job:updated', { jobId: Number(job.id), userId: job.user_id, status: 'printing' });
    }
    if (printer_id) {
      db.prepare("UPDATE printers SET status = 'printing', current_job_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(job_id || null, printer_id);
      broadcast('printer:status', { printerId: printer_id, status: 'printing' });
    }

    res.json({ success: true, formlabs_job_id: result.jobId });
  } catch (error: any) {
    console.error('Error printing via PreForm Server:', error);
    res.status(500).json({ error: error?.message || 'Failed to print via PreForm Server' });
  }
});

function numeric(value: unknown): number | undefined {
  const num = typeof value === 'string' ? Number.parseFloat(value) : value;
  return typeof num === 'number' && Number.isFinite(num) ? num : undefined;
}

function euler(value: any): { x: number; y: number; z: number } | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const x = numeric(value.x) ?? 0;
  const y = numeric(value.y) ?? 0;
  const z = numeric(value.z) ?? 0;
  if (x === 0 && y === 0 && z === 0) {
    return undefined;
  }
  return { x, y, z };
}

export default router;

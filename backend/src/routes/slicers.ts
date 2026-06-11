import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDatabase } from '../database';
import { authenticateToken, requireRole } from '../middleware/auth';
import {
  detectSlicers,
  estimateResinPrint,
  resolveSlicerId,
  sliceStl,
  SliceOverrides,
  SlicerId,
} from '../services/slicer';
import { broadcast } from '../websocket';

const router = express.Router();

const uploadsDir = path.join(__dirname, '../../uploads');

interface PrinterRow {
  id: string;
  name: string;
  type: 'fdm' | 'resin';
  slicer: string;
  slicer_settings?: string | null;
  speed_multiplier?: number | null;
}

function parseSlicerSettings(raw?: string | null): SliceOverrides {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    const settings: SliceOverrides = {};
    const numeric = (value: unknown): number | undefined =>
      typeof value === 'number' && Number.isFinite(value) ? value : undefined;

    settings.layerHeight = numeric(parsed.layerHeight);
    settings.infill = numeric(parsed.infill);
    settings.printSpeed = numeric(parsed.printSpeed);
    settings.nozzleTemperature = numeric(parsed.nozzleTemperature);
    settings.bedTemperature = numeric(parsed.bedTemperature);
    settings.nozzleSize = numeric(parsed.nozzleSize);
    if (typeof parsed.supportEnabled === 'boolean') {
      settings.supportEnabled = parsed.supportEnabled;
    }
    if (typeof parsed.customSettings === 'string' && parsed.customSettings.trim()) {
      settings.customSettings = parsed.customSettings;
    }
    return settings;
  } catch {
    return {};
  }
}

function mergeOverrides(base: SliceOverrides, request: SliceOverrides): SliceOverrides {
  const merged: SliceOverrides = { ...base };
  for (const [key, value] of Object.entries(request)) {
    if (value !== undefined && value !== null) {
      (merged as any)[key] = value;
    }
  }
  return merged;
}

function normalizeRequestOverrides(raw: any): SliceOverrides {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const numeric = (value: unknown): number | undefined => {
    const num = typeof value === 'string' ? Number.parseFloat(value) : value;
    return typeof num === 'number' && Number.isFinite(num) ? num : undefined;
  };

  return {
    layerHeight: numeric(raw.layerHeight ?? raw.layer_height),
    infill: numeric(raw.infill),
    printSpeed: numeric(raw.printSpeed ?? raw.print_speed),
    nozzleTemperature: numeric(raw.nozzleTemperature ?? raw.nozzle_temperature),
    bedTemperature: numeric(raw.bedTemperature ?? raw.bed_temperature),
    nozzleSize: numeric(raw.nozzleSize ?? raw.nozzle_size),
    supportEnabled: typeof raw.supportEnabled === 'boolean'
      ? raw.supportEnabled
      : (typeof raw.support_enabled === 'boolean' ? raw.support_enabled : undefined),
    customSettings: typeof raw.customSettings === 'string' ? raw.customSettings : undefined,
  };
}

// List slicer engines available on this server
router.get('/', authenticateToken, requireRole(['operator', 'admin', 'org_admin']), (req, res) => {
  try {
    res.json({ slicers: detectSlicers() });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to detect slicers' });
  }
});

/**
 * Slice an uploaded STL file server-side.
 *
 * Body: {
 *   file_id: number,            // STL file to slice
 *   printer_id?: string,        // pick slicer + default settings from this printer
 *   job_id?: number,            // update this job's estimate with the result
 *   slicer?: string,            // explicit slicer override ('cura'|'prusa'|'orca'|'bambu'|'preform')
 *   overrides?: {...}           // per-slice setting overrides
 * }
 */
router.post('/slice', authenticateToken, requireRole(['operator', 'admin', 'org_admin']), async (req, res) => {
  try {
    const { file_id, printer_id, job_id, slicer, overrides } = req.body || {};
    const user_id = (req as any).user.id;

    if (!file_id) {
      return res.status(400).json({ error: 'file_id is required' });
    }

    const db = getDatabase();
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(file_id) as any;
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    if (path.extname(file.original_name).toLowerCase() !== '.stl') {
      return res.status(400).json({ error: 'Only STL files can be sliced' });
    }
    if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    let printer: PrinterRow | undefined;
    if (printer_id) {
      printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(printer_id) as PrinterRow | undefined;
      if (!printer) {
        return res.status(404).json({ error: 'Printer not found' });
      }
    }

    const requestedSlicer: SlicerId | null =
      resolveSlicerId(slicer) || resolveSlicerId(printer?.slicer) || null;

    const printerDefaults = parseSlicerSettings(printer?.slicer_settings);
    const effectiveOverrides = mergeOverrides(printerDefaults, normalizeRequestOverrides(overrides));

    // Resin targets have no headless slicing path; produce a geometry estimate.
    const isResinTarget = printer?.type === 'resin' || requestedSlicer === 'preform';
    if (isResinTarget) {
      const estimate = estimateResinPrint(file.file_path, effectiveOverrides.layerHeight || 0.1);
      const estimatedMinutes = estimate.estimatedMinutes;

      if (job_id) {
        db.prepare(`
          UPDATE print_jobs SET estimated_time_minutes = ?, slicer = 'preform', updated_at = datetime('now') WHERE id = ?
        `).run(estimatedMinutes, job_id);
        if (printer) {
          upsertJobPrinterTime(db, Number(job_id), printer, estimatedMinutes);
        }
        broadcast('job:updated', { jobId: Number(job_id) });
      }

      return res.json({
        method: 'estimate',
        slicer: 'preform',
        engine_fallback: false,
        estimated_time_minutes: estimatedMinutes,
        estimated_filament_grams: null,
        message: 'PreForm has no headless slicing CLI; returned a geometry-based estimate. Open the model in PreForm from the desktop app for final resin slicing.',
        stats: estimate.stats,
      });
    }

    const slicerToUse: SlicerId = requestedSlicer || 'prusa';

    const stem = path.basename(file.original_name, path.extname(file.original_name));
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
    const outputName = `${uniqueSuffix}.gcode`;
    const outputPath = path.join(uploadsDir, outputName);

    const result = await sliceStl({
      slicer: slicerToUse,
      stlPath: file.file_path,
      outputPath,
      overrides: effectiveOverrides,
    });

    // If the engine wrote somewhere else (orca outputdir variants), move it into uploads.
    let finalPath = result.gcodePath;
    if (finalPath !== outputPath) {
      fs.copyFileSync(finalPath, outputPath);
      try {
        fs.unlinkSync(finalPath);
      } catch {
        // Keep going if the temp output cannot be removed.
      }
      finalPath = outputPath;
    }

    const checksum = crypto.createHash('md5').update(fs.readFileSync(finalPath)).digest('hex');
    const gcodeSize = fs.statSync(finalPath).size;
    const gcodeOriginalName = `${stem}.gcode`;

    const insert = db.prepare(`
      INSERT INTO files (
        user_id, original_name, stored_name, file_path, file_size,
        file_type, checksum, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, '.gcode', ?, datetime('now'))
    `).run(user_id, gcodeOriginalName, outputName, finalPath, gcodeSize, checksum);

    const gcodeFileId = Number(insert.lastInsertRowid);

    const printTimeSeconds = result.metadata.printTimeSeconds;
    const baseMinutes = printTimeSeconds ? Math.max(1, Math.round(printTimeSeconds / 60)) : null;

    if (job_id) {
      const updates: string[] = ["slicer = ?", "updated_at = datetime('now')", 'gcode_file_id = ?'];
      const params: any[] = [result.usedSlicer, gcodeFileId];
      if (baseMinutes) {
        updates.unshift('estimated_time_minutes = ?');
        params.unshift(baseMinutes);
      }
      params.push(job_id);
      db.prepare(`UPDATE print_jobs SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      if (printer && baseMinutes) {
        upsertJobPrinterTime(db, Number(job_id), printer, baseMinutes);
      }
      broadcast('job:updated', { jobId: Number(job_id) });
    }

    res.json({
      method: 'cli-slice',
      slicer: result.usedSlicer,
      requested_slicer: result.requestedSlicer,
      engine_fallback: result.engineFallback,
      gcode_file_id: gcodeFileId,
      gcode_file_name: gcodeOriginalName,
      gcode_file_size: gcodeSize,
      estimated_time_minutes: baseMinutes,
      estimated_filament_grams: result.metadata.filamentGrams,
      layer_count: result.metadata.layerCount,
      duration_ms: result.durationMs,
    });
  } catch (error: any) {
    console.error('Error slicing file:', error);
    res.status(500).json({ error: error?.message || 'Failed to slice file' });
  }
});

function upsertJobPrinterTime(db: any, jobId: number, printer: PrinterRow, baseMinutes: number) {
  // Faster printers (speed_multiplier > 1) complete the same gcode sooner.
  const multiplier = printer.speed_multiplier && printer.speed_multiplier > 0 ? printer.speed_multiplier : 1;
  const printerMinutes = Math.max(1, Math.round(baseMinutes / multiplier));

  db.prepare('DELETE FROM job_printer_times WHERE job_id = ? AND printer_id = ?').run(jobId, printer.id);
  db.prepare(`
    INSERT INTO job_printer_times (job_id, printer_id, estimated_minutes)
    VALUES (?, ?, ?)
  `).run(jobId, printer.id, printerMinutes);
}

export default router;

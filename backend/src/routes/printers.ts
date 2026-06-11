import { Router, Response, NextFunction } from 'express';
import { spawn } from 'child_process';
import { db } from '../database';
import { authenticateToken, requireRole, AuthRequest, generateWebcamToken, verifyWebcamToken } from '../middleware/auth';
import { cancelPrint, getPrinterStatus, getPrinterTerminal, pausePrint, resumePrint, sendPrinterCommand, sendRawGcode, startPrint } from '../services/printerControl';
import { ConnectionDetails } from '../services/printerAdapters/types';

const router = Router();

function parseConnectionDetails(details?: string | null): ConnectionDetails {
  if (!details) {
    return {};
  }

  try {
    return JSON.parse(details) as ConnectionDetails;
  } catch (error) {
    return {};
  }
}

function buildBambuWebcamUrl(req: AuthRequest, printerId: string): string {
  const baseUrl = `${req.protocol}://${req.get('host')}/api/printers/${printerId}/webcam`;
  if (!req.user) {
    return baseUrl;
  }
  const token = generateWebcamToken(req.user, printerId);
  return `${baseUrl}?webcam_token=${encodeURIComponent(token)}`;
}

function withDefaultBambuWebcam(printer: any, req: AuthRequest): any {
  if (printer?.integration_type === 'bambu' && !printer.webcam_url) {
    return { ...printer, webcam_url: buildBambuWebcamUrl(req, printer.id) };
  }
  return printer;
}

function resolveBambuRtspUrl(details: ConnectionDetails, webcamUrl?: string | null): string | null {
  if (webcamUrl && /^rtsps?:\/\//i.test(webcamUrl)) {
    return webcamUrl;
  }

  const host = details.host;
  const accessCode = details.accessCode || details.password || details.accessToken;
  if (!host || !accessCode) {
    return null;
  }

  const port = details.rtspPort ?? 554;
  const path = details.rtspPath || '/streaming';
  const username = details.username || 'bblp';
  const encodedPass = encodeURIComponent(accessCode);
  return `rtsp://${username}:${encodedPass}@${host}:${port}${path}`;
}

function authenticateWebcamRequest(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    return authenticateToken(req, res, next);
  }

  const webcamToken = typeof req.query.webcam_token === 'string' ? req.query.webcam_token : undefined;
  if (!webcamToken) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    req.user = verifyWebcamToken(webcamToken, req.params.id);
    return next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Filter printer data based on user role and job ownership
 * Students can only see webcams for printers printing their jobs
 * and cannot see sensitive job information
 */
function filterPrinterData(printer: any, userId: number, userRole: string): any {
  // Operators and admins see everything
  if (userRole === 'operator' || userRole === 'admin' || userRole === 'org_admin') {
    return printer;
  }

  // For students, filter webcam and sensitive data
  if (userRole === 'student') {
    const filteredPrinter = { ...printer };

    // Check if this printer has a current job belonging to the student
    if (printer.current_job_id) {
      try {
        const job = db.prepare('SELECT user_id FROM print_jobs WHERE id = ?').get(printer.current_job_id) as any;
        
        // If the job doesn't belong to this student, hide webcam and sensitive info
        if (!job || job.user_id !== userId) {
          delete filteredPrinter.webcam_url;
          
          // Hide sensitive job information (filenames, job names)
          // This handles various ways job data might be attached to printer object:
          // - currentJob object from WebSocket/frontend aggregation
          // - job_name from SQL JOINs
          // - print_job_name or other variations
          if (filteredPrinter.currentJob) {
            delete filteredPrinter.currentJob.name;
          }
          
          // Remove any job-related fields that might have been added via JOINs
          delete filteredPrinter.job_name;
          delete filteredPrinter.print_job_name;
          delete filteredPrinter.job;
        }
        // If the job belongs to the student, they can see everything including webcam
      } catch (error) {
        // If job lookup fails, err on the side of caution and hide webcam
        console.error('Error checking job ownership:', error);
        delete filteredPrinter.webcam_url;
        
        // Also remove any job-related fields
        if (filteredPrinter.currentJob) {
          delete filteredPrinter.currentJob.name;
        }
        delete filteredPrinter.job_name;
        delete filteredPrinter.print_job_name;
        delete filteredPrinter.job;
      }
    } else {
      // No current job, hide webcam from students
      delete filteredPrinter.webcam_url;
      
      // Also hide any job data if somehow present (defensive programming)
      if (filteredPrinter.currentJob) {
        delete filteredPrinter.currentJob.name;
      }
      delete filteredPrinter.job_name;
      delete filteredPrinter.print_job_name;
      delete filteredPrinter.job;
    }

    return filteredPrinter;
  }

  return printer;
}

// Create new printer (operators/admin only)
router.post('/', authenticateToken, requireRole(['operator', 'admin', 'org_admin']), (req: AuthRequest, res) => {
  try {
    const {
      id,
      name,
      type,
      model,
      slicer,
      status,
      ip_address,
      webcam_url,
      connection_type,
      integration_type,
      connection_details,
      slicer_settings,
      speed_multiplier,
      max_print_speed,
      build_volume_x,
      build_volume_y,
      build_volume_z
    } = req.body || {};

    if (!name || !type) {
      return res.status(400).json({ error: 'name and type are required' });
    }

    const allowedSlicers = ['cura', 'orca', 'prusa', 'bambu', 'preform'];
    if (slicer !== undefined && slicer !== null && !allowedSlicers.includes(slicer)) {
      return res.status(400).json({ error: `Invalid slicer. Allowed: ${allowedSlicers.join(', ')}` });
    }

    const printerId = id || `printer-${Date.now()}`;
    const resolvedSlicer = slicer || (type === 'resin' ? 'preform' : 'cura');
    const resolvedStatus = status || 'offline';

    const details = connection_details
      ? (typeof connection_details === 'string'
          ? connection_details
          : JSON.stringify(connection_details))
      : null;

    const slicerSettings = slicer_settings
      ? (typeof slicer_settings === 'string'
          ? slicer_settings
          : JSON.stringify(slicer_settings))
      : null;

    db.prepare(`
      INSERT INTO printers (
        id,
        name,
        type,
        model,
        slicer,
        speed_multiplier,
        max_print_speed,
        build_volume_x,
        build_volume_y,
        build_volume_z,
        status,
        ip_address,
        webcam_url,
        connection_type,
        integration_type,
        connection_details,
        slicer_settings
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      printerId,
      name,
      type,
      model || null,
      resolvedSlicer,
      speed_multiplier ?? 1.0,
      max_print_speed ?? null,
      build_volume_x ?? null,
      build_volume_y ?? null,
      build_volume_z ?? null,
      resolvedStatus,
      ip_address || null,
      webcam_url || null,
      connection_type || null,
      integration_type || null,
      details,
      slicerSettings
    );

    const createdPrinter = db.prepare('SELECT * FROM printers WHERE id = ?').get(printerId);
    res.status(201).json({ printer: createdPrinter });
  } catch (error: any) {
    console.error('Error creating printer:', error);
    res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

// Get all printers
router.get('/', authenticateToken, (req: AuthRequest, res) => {
  try {
    const printers = db.prepare('SELECT * FROM printers WHERE is_active = 1').all();
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Filter printers based on user role and job ownership
    const filteredPrinters = printers
      .map((printer: any) => withDefaultBambuWebcam(printer, req))
      .map((printer: any) => filterPrinterData(printer, userId, userRole));

    res.json({ printers: filteredPrinters });
  } catch (error) {
    console.error('Error fetching printers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get printer by ID
router.get('/:id', authenticateToken, (req: AuthRequest, res) => {
  try {
    const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id);
    
    if (!printer) {
      return res.status(404).json({ error: 'Printer not found' });
    }

    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Filter printer data based on user role and job ownership
    const filteredPrinter = filterPrinterData(withDefaultBambuWebcam(printer, req), userId, userRole);
    
    res.json({ printer: filteredPrinter });
  } catch (error) {
    console.error('Error fetching printer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Proxy Bambu webcam stream (RTSP -> MJPEG)
router.get('/:id/webcam', authenticateWebcamRequest, async (req: AuthRequest, res) => {
  try {
    const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id) as any;
    if (!printer) {
      return res.status(404).json({ error: 'Printer not found' });
    }

    const userId = req.user?.id;
    const userRole = req.user?.role;
    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const normalizedPrinter = withDefaultBambuWebcam(printer, req);
    const filteredPrinter = filterPrinterData(normalizedPrinter, userId, userRole);
    if (!filteredPrinter.webcam_url) {
      return res.status(403).json({ error: 'Webcam access is not permitted' });
    }

    const details = parseConnectionDetails(printer.connection_details);
    const rtspUrl = resolveBambuRtspUrl(details, printer.webcam_url);
    if (!rtspUrl) {
      return res.status(400).json({ error: 'Bambu webcam is not configured' });
    }

    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=ffmpeg',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });

    const ffmpeg = spawn('ffmpeg', [
      '-loglevel', 'error',
      '-rtsp_transport', 'tcp',
      '-i', rtspUrl,
      '-f', 'mpjpeg',
      '-q:v', '5',
      '-r', '10',
      '-',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    ffmpeg.stdout.pipe(res);
    ffmpeg.stderr.on('data', (chunk) => {
      console.error('Bambu webcam ffmpeg error:', chunk.toString());
    });

    const cleanup = () => {
      ffmpeg.kill('SIGKILL');
    };

    ffmpeg.on('error', (error) => {
      console.error('Failed to start ffmpeg for webcam stream:', error);
      cleanup();
    });

    res.on('close', cleanup);
    res.on('error', cleanup);
  } catch (error) {
    console.error('Error streaming webcam:', error);
    res.status(500).json({ error: 'Failed to stream webcam' });
  }
});

// Update printer status (operators/admin only)
router.patch('/:id/status', authenticateToken, requireRole(['operator', 'admin', 'org_admin']), (req, res) => {
  try {
    const { status } = req.body;
    
    if (!status || !['online', 'printing', 'paused', 'error', 'offline'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    db.prepare('UPDATE printers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status, req.params.id);
    
    const updatedPrinter = db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id);
    
    res.json({ printer: updatedPrinter });
  } catch (error) {
    console.error('Error updating printer status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update printer settings (operators/admin only)
router.patch('/:id', authenticateToken, requireRole(['operator', 'admin', 'org_admin']), (req, res) => {
  try {
    const updates: string[] = [];
    const params: any[] = [];
    const allowedConnectionTypes = ['wifi', 'usb', 'network'];
    const allowedIntegrationTypes = ['octoprint', 'moonraker', 'serial', 'bambu', 'formlabs'];
    const allowedSlicers = ['cura', 'orca', 'prusa', 'bambu', 'preform'];

    if (req.body.name !== undefined) {
      updates.push('name = ?');
      params.push(req.body.name);
    }

    if (req.body.slicer !== undefined) {
      if (!allowedSlicers.includes(req.body.slicer)) {
        return res.status(400).json({ error: 'Invalid slicer' });
      }
      updates.push('slicer = ?');
      params.push(req.body.slicer);
    }

    if (req.body.slicer_settings !== undefined) {
      const settings = req.body.slicer_settings === null
        ? null
        : (typeof req.body.slicer_settings === 'string'
            ? req.body.slicer_settings
            : JSON.stringify(req.body.slicer_settings));
      updates.push('slicer_settings = ?');
      params.push(settings);
    }

    if (req.body.speed_multiplier !== undefined) {
      const multiplier = Number(req.body.speed_multiplier);
      if (!Number.isFinite(multiplier) || multiplier <= 0) {
        return res.status(400).json({ error: 'speed_multiplier must be a positive number' });
      }
      updates.push('speed_multiplier = ?');
      params.push(multiplier);
    }

    if (req.body.ip_address !== undefined) {
      updates.push('ip_address = ?');
      params.push(req.body.ip_address);
    }

    if (req.body.webcam_url !== undefined) {
      updates.push('webcam_url = ?');
      params.push(req.body.webcam_url);
    }

    if (req.body.connection_type !== undefined) {
      if (!allowedConnectionTypes.includes(req.body.connection_type)) {
        return res.status(400).json({ error: 'Invalid connection_type' });
      }
      updates.push('connection_type = ?');
      params.push(req.body.connection_type);
    }

    if (req.body.integration_type !== undefined) {
      if (!allowedIntegrationTypes.includes(req.body.integration_type)) {
        return res.status(400).json({ error: 'Invalid integration_type' });
      }
      updates.push('integration_type = ?');
      params.push(req.body.integration_type);
    }

    if (req.body.connection_details !== undefined) {
      const details = typeof req.body.connection_details === 'string'
        ? req.body.connection_details
        : JSON.stringify(req.body.connection_details);
      updates.push('connection_details = ?');
      params.push(details);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);
    db.prepare(`UPDATE printers SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updatedPrinter = db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id);
    res.json({ printer: updatedPrinter });
  } catch (error) {
    console.error('Error updating printer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fetch live printer status from integration
router.get('/:id/status', authenticateToken, requireRole(['operator', 'admin', 'org_admin']), async (req, res) => {
  try {
    const status = await getPrinterStatus(req.params.id);
    res.json({ status });
  } catch (error: any) {
    console.error('Error fetching printer status:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch printer status' });
  }
});

// Start print on a specific printer
router.post('/:id/print', authenticateToken, requireRole(['operator', 'admin', 'org_admin']), async (req, res) => {
  try {
    const { file_id, job_id } = req.body;
    if (!file_id && !job_id) {
      return res.status(400).json({ error: 'file_id or job_id is required' });
    }

    const result = await startPrint(
      req.params.id,
      file_id ? Number(file_id) : undefined,
      job_id ? Number(job_id) : undefined
    );
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error starting print:', error);
    res.status(500).json({ error: error.message || 'Failed to start print' });
  }
});

// Pause print
router.post('/:id/pause', authenticateToken, requireRole(['operator', 'admin', 'org_admin']), async (req, res) => {
  try {
    await pausePrint(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error pausing print:', error);
    res.status(500).json({ error: error.message || 'Failed to pause print' });
  }
});

// Resume print
router.post('/:id/resume', authenticateToken, requireRole(['operator', 'admin', 'org_admin']), async (req, res) => {
  try {
    await resumePrint(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error resuming print:', error);
    res.status(500).json({ error: error.message || 'Failed to resume print' });
  }
});

// Cancel print
router.post('/:id/cancel', authenticateToken, requireRole(['operator', 'admin', 'org_admin']), async (req, res) => {
  try {
    await cancelPrint(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error canceling print:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel print' });
  }
});

// Send command to printer (home/preheat/cooldown)
router.post('/:id/command', authenticateToken, requireRole(['operator', 'admin', 'org_admin']), async (req, res) => {
  try {
    const { command } = req.body;
    if (!['home', 'preheat', 'cooldown'].includes(command)) {
      return res.status(400).json({ error: 'Invalid command' });
    }

    await sendPrinterCommand(req.params.id, command);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error sending printer command:', error);
    res.status(500).json({ error: error.message || 'Failed to send command' });
  }
});

// Send raw gcode to printer
router.post('/:id/gcode', authenticateToken, requireRole(['operator', 'admin', 'org_admin']), async (req, res) => {
  try {
    const { gcode } = req.body;
    if (!gcode || typeof gcode !== 'string') {
      return res.status(400).json({ error: 'gcode is required' });
    }

    await sendRawGcode(req.params.id, gcode);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error sending gcode:', error);
    res.status(500).json({ error: error.message || 'Failed to send gcode' });
  }
});

// Get printer terminal output
router.get('/:id/terminal', authenticateToken, requireRole(['operator', 'admin', 'org_admin']), async (req, res) => {
  try {
    const terminal = await getPrinterTerminal(req.params.id);
    res.json({ terminal });
  } catch (error: any) {
    console.error('Error fetching terminal output:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch terminal output' });
  }
});

// Get printers by type
router.get('/type/:type', authenticateToken, (req: AuthRequest, res) => {
  try {
    const { type } = req.params;
    
    if (!['fdm', 'resin'].includes(type)) {
      return res.status(400).json({ error: 'Invalid printer type' });
    }
    
    const printers = db.prepare('SELECT * FROM printers WHERE type = ? AND is_active = 1').all(type);

    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Filter printers based on user role and job ownership
    const filteredPrinters = printers
      .map((printer: any) => withDefaultBambuWebcam(printer, req))
      .map((printer: any) => filterPrinterData(printer, userId, userRole));

    res.json({ printers: filteredPrinters });
  } catch (error) {
    console.error('Error fetching printers by type:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

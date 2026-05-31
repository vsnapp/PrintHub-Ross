import express from 'express';
import { getDatabase } from '../database';
import { authenticateToken, requireRole } from '../middleware/auth';
import { optimizeQueue, PrintJob, PrinterSchedule, WorkHours } from '../utils/queueOptimizer';

const router = express.Router();

// Optimize queue
router.post('/optimize', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    
    // Get work hours configuration
    const workHoursRow = db.prepare('SELECT * FROM work_hours WHERE id = 1').get() as any;
    const farmWorkHours: WorkHours = {
      start: workHoursRow?.start_hour || 8,
      end: workHoursRow?.end_hour || 18
    };

    // Get all approved jobs that aren't completed/cancelled
    const jobs = db.prepare(`
      SELECT * FROM print_jobs 
      WHERE status IN ('approved', 'scheduled') 
      AND deadline >= datetime('now')
      ORDER BY deadline ASC
    `).all() as any[];

    // Get all active printers
    const printers = db.prepare(`
      SELECT * FROM printers WHERE status = 'online'
    `).all() as any[];

    // Get existing schedule
    const existingSchedule = db.prepare(`
      SELECT * FROM queue_schedule WHERE end_time >= datetime('now')
    `).all() as any[];

    // Transform to queue optimizer format
    const printJobs: PrintJob[] = jobs.map(job => {
      // Get printer-specific times for this job
      const printerTimes = db.prepare(`
        SELECT printer_id, estimated_time_minutes FROM job_printer_times WHERE job_id = ?
      `).all(job.id) as any[];

      const printerSpecificTimes: { [printerId: string]: number } = {};
      printerTimes.forEach((pt: any) => {
        printerSpecificTimes[pt.printer_id] = pt.estimated_time_minutes;
      });

      return {
        id: job.id.toString(),
        name: job.name,
        printTimeMinutes: job.estimated_time_minutes || 60,
        deadline: new Date(job.deadline),
        priority: job.priority || 'medium',
        printerSpecificTimes: Object.keys(printerSpecificTimes).length > 0 
          ? printerSpecificTimes 
          : undefined
      };
    });

    const printerSchedules: PrinterSchedule[] = printers.map(p => ({
      printerId: p.id.toString(),
      printerName: p.name
    }));

    // Define scheduling window (now to 7 days from now)
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Run optimizer
    const result = optimizeQueue(
      printJobs,
      printerSchedules,
      farmWorkHours,
      { start: now, end: weekFromNow }
    );

    // Clear existing schedule
    db.prepare('DELETE FROM queue_schedule').run();

    // Save new schedule to database
    for (const scheduled of result.scheduledPrints) {
      db.prepare(`
        INSERT INTO queue_schedule (
          job_id, printer_id, start_time, end_time, is_overnight, created_at
        ) VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(
        parseInt(scheduled.jobId),
        parseInt(scheduled.printerId),
        scheduled.startTime.toISOString(),
        scheduled.endTime.toISOString(),
        scheduled.isOvernight ? 1 : 0
      );

      // Update job status to scheduled
      db.prepare('UPDATE print_jobs SET status = ? WHERE id = ?')
        .run('scheduled', parseInt(scheduled.jobId));
    }

    // TODO: Broadcast via WebSocket

    res.json({
      success: true,
      scheduled: result.totalPrintsScheduled,
      unscheduled: result.totalPrintsUnscheduled,
      utilizationByPrinter: result.utilizationByPrinter,
      workHours: result.workHours,
      unscheduledJobs: result.unscheduledJobs.map(j => ({
        id: j.id,
        name: j.name,
        deadline: j.deadline
      }))
    });
  } catch (error) {
    console.error('Error optimizing queue:', error);
    res.status(500).json({ error: 'Failed to optimize queue' });
  }
});

// Get current schedule
router.get('/schedule', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const schedule = db.prepare(`
      SELECT 
        qs.*,
        pj.name as job_name,
        pj.priority,
        pj.user_id,
        p.name as printer_name,
        p.type as printer_type,
        u.username
      FROM queue_schedule qs
      JOIN print_jobs pj ON qs.job_id = pj.id
      JOIN printers p ON qs.printer_id = p.id
      JOIN users u ON pj.user_id = u.id
      WHERE qs.end_time >= datetime('now')
      ORDER BY qs.start_time ASC
    `).all();

    res.json(schedule);
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// Remove from schedule
router.delete('/schedule/:id', authenticateToken, requireRole(['operator', 'admin']), async (req, res) => {
  try {
    const schedule_id = req.params.id;
    const db = getDatabase();

    const scheduleItem = db.prepare('SELECT * FROM queue_schedule WHERE id = ?').get(schedule_id) as any;
    if (!scheduleItem) {
      return res.status(404).json({ error: 'Schedule item not found' });
    }

    // Remove from schedule
    db.prepare('DELETE FROM queue_schedule WHERE id = ?').run(schedule_id);

    // Update job status back to approved
    db.prepare('UPDATE print_jobs SET status = ? WHERE id = ?')
      .run('approved', scheduleItem.job_id);

    res.json({ message: 'Removed from schedule successfully' });
  } catch (error) {
    console.error('Error removing from schedule:', error);
    res.status(500).json({ error: 'Failed to remove from schedule' });
  }
});

// Get timeline data
router.get('/timeline', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    
    // Get work hours
    const workHoursRow = db.prepare('SELECT * FROM work_hours WHERE id = 1').get() as any;
    const workHours = {
      start: workHoursRow?.start_hour || 8,
      end: workHoursRow?.end_hour || 18
    };

    // Get schedule
    const schedule = db.prepare(`
      SELECT 
        qs.*,
        pj.name as job_name,
        pj.priority,
        p.name as printer_name,
        p.type as printer_type
      FROM queue_schedule qs
      JOIN print_jobs pj ON qs.job_id = pj.id
      JOIN printers p ON qs.printer_id = p.id
      WHERE qs.end_time >= datetime('now')
      ORDER BY qs.start_time ASC
    `).all();

    // Get all printers
    const printers = db.prepare('SELECT * FROM printers').all();

    // Calculate utilization
    const utilizationByPrinter: { [key: string]: number } = {};
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const totalMinutes = (weekFromNow.getTime() - now.getTime()) / (1000 * 60);

    for (const printer of printers as any[]) {
      const printerSchedule = (schedule as any[]).filter(s => s.printer_id === printer.id);
      const totalPrintTime = printerSchedule.reduce((sum, s) => {
        const start = new Date(s.start_time);
        const end = new Date(s.end_time);
        return sum + (end.getTime() - start.getTime()) / (1000 * 60);
      }, 0);
      utilizationByPrinter[printer.id] = (totalPrintTime / totalMinutes) * 100;
    }

    res.json({
      workHours,
      schedule,
      printers,
      utilizationByPrinter
    });
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

export default router;

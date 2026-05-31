import express from 'express';
import { getDatabase } from '../database';
import { authenticateToken, requireRole } from '../middleware/auth';
import { emailService } from '../utils/emailService';

const router = express.Router();

// Create new print job
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, file_id, deadline, priority, printer_type, estimated_time_minutes, notes } = req.body;
    const user_id = (req as any).user.id;

    if (!name || !deadline) {
      return res.status(400).json({ error: 'Name and deadline are required' });
    }

    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO print_jobs (
        user_id, name, file_id, deadline, priority, printer_type, 
        estimated_time_minutes, notes, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `).run(
      user_id,
      name,
      file_id || null,
      deadline,
      priority || 'medium',
      printer_type || 'fdm',
      estimated_time_minutes || null,
      notes || null
    );

    const job = db.prepare('SELECT * FROM print_jobs WHERE id = ?').get(result.lastInsertRowid);

    // TODO: Broadcast via WebSocket
    res.status(201).json(job);
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// List all jobs (with filtering)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user_id = (req as any).user.id;
    const user_role = (req as any).user.role;
    const { status, printer_type } = req.query;

    const db = getDatabase();
    let query = 'SELECT pj.*, u.username FROM print_jobs pj JOIN users u ON pj.user_id = u.id';
    const params: any[] = [];
    const conditions: string[] = [];

    // Students can only see their own jobs
    if (user_role === 'student') {
      conditions.push('pj.user_id = ?');
      params.push(user_id);
    }

    if (status) {
      conditions.push('pj.status = ?');
      params.push(status);
    }

    if (printer_type) {
      conditions.push('pj.printer_type = ?');
      params.push(printer_type);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY pj.created_at DESC';

    const jobs = db.prepare(query).all(...params);
    res.json(jobs);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Get specific job
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const job_id = req.params.id;
    const user_id = (req as any).user.id;
    const user_role = (req as any).user.role;

    const db = getDatabase();
    const job = db.prepare(`
      SELECT pj.*, u.username FROM print_jobs pj 
      JOIN users u ON pj.user_id = u.id 
      WHERE pj.id = ?
    `).get(job_id);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Students can only see their own jobs
    if (user_role === 'student' && (job as any).user_id !== user_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(job);
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// Update job
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const job_id = req.params.id;
    const user_id = (req as any).user.id;
    const user_role = (req as any).user.role;
    const { status, priority, deadline, notes } = req.body;

    const db = getDatabase();
    const job = db.prepare('SELECT * FROM print_jobs WHERE id = ?').get(job_id);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const oldStatus = (job as any).status;

    // Students can only update their own jobs and can't change status
    if (user_role === 'student') {
      if ((job as any).user_id !== user_id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (status && status !== (job as any).status) {
        return res.status(403).json({ error: 'Students cannot change job status' });
      }
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      params.push(priority);
    }
    if (deadline !== undefined) {
      updates.push('deadline = ?');
      params.push(deadline);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(job_id);
    db.prepare(`UPDATE print_jobs SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updatedJob = db.prepare('SELECT * FROM print_jobs WHERE id = ?').get(job_id);

    // Send email notification if job is completed and auto-send is enabled
    if (status === 'completed' && oldStatus !== 'completed' && emailService.isAutoSendEnabled()) {
      // Get user email
      const user = db.prepare('SELECT email, username FROM users WHERE id = ?').get((job as any).user_id) as any;
      
      if (user && user.email) {
        // Send email in background (don't wait for it)
        emailService.sendJobCompletionEmail(user.email, {
          jobName: (job as any).name,
          username: user.username,
          createdAt: new Date((job as any).created_at).toLocaleString(),
          completedAt: new Date().toLocaleString(),
          printerType: (job as any).printer_type.toUpperCase(),
        }).catch(error => {
          console.error('Failed to send automatic completion email:', error);
        });
      }
    }

    res.json(updatedJob);
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// Delete job
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const job_id = req.params.id;
    const user_id = (req as any).user.id;
    const user_role = (req as any).user.role;

    const db = getDatabase();
    const job = db.prepare('SELECT * FROM print_jobs WHERE id = ?').get(job_id);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Students can only delete their own jobs, and only if pending
    if (user_role === 'student') {
      if ((job as any).user_id !== user_id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if ((job as any).status !== 'pending') {
        return res.status(403).json({ error: 'Can only delete pending jobs' });
      }
    }

    db.prepare('DELETE FROM print_jobs WHERE id = ?').run(job_id);
    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

// Approve job (operators only)
router.patch('/:id/approve', authenticateToken, requireRole(['operator', 'admin']), async (req, res) => {
  try {
    const job_id = req.params.id;
    const db = getDatabase();

    const job = db.prepare('SELECT * FROM print_jobs WHERE id = ?').get(job_id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    db.prepare('UPDATE print_jobs SET status = ? WHERE id = ?').run('approved', job_id);
    const updatedJob = db.prepare('SELECT * FROM print_jobs WHERE id = ?').get(job_id);

    res.json(updatedJob);
  } catch (error) {
    console.error('Error approving job:', error);
    res.status(500).json({ error: 'Failed to approve job' });
  }
});

// Reject job (operators only)
router.patch('/:id/reject', authenticateToken, requireRole(['operator', 'admin']), async (req, res) => {
  try {
    const job_id = req.params.id;
    const { reason } = req.body;
    const db = getDatabase();

    const job = db.prepare('SELECT * FROM print_jobs WHERE id = ?').get(job_id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    db.prepare('UPDATE print_jobs SET status = ?, notes = ? WHERE id = ?')
      .run('rejected', reason || 'Rejected by operator', job_id);
    
    const updatedJob = db.prepare('SELECT * FROM print_jobs WHERE id = ?').get(job_id);
    res.json(updatedJob);
  } catch (error) {
    console.error('Error rejecting job:', error);
    res.status(500).json({ error: 'Failed to reject job' });
  }
});

export default router;

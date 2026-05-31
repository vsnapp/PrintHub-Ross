import express from 'express';
import { getDatabase } from '../database';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = express.Router();

// Get work hours configuration
router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const workHours = db.prepare('SELECT * FROM work_hours WHERE id = 1').get();

    if (!workHours) {
      // Return default if not set
      return res.json({ start_hour: 8, end_hour: 18 });
    }

    res.json(workHours);
  } catch (error) {
    console.error('Error fetching work hours:', error);
    res.status(500).json({ error: 'Failed to fetch work hours' });
  }
});

// Update work hours configuration (operators only)
router.put('/', authenticateToken, requireRole(['operator', 'admin']), async (req, res) => {
  try {
    const { start_hour, end_hour } = req.body;

    if (start_hour === undefined || end_hour === undefined) {
      return res.status(400).json({ error: 'start_hour and end_hour are required' });
    }

    if (start_hour < 0 || start_hour > 23 || end_hour < 0 || end_hour > 23) {
      return res.status(400).json({ error: 'Hours must be between 0 and 23' });
    }

    const db = getDatabase();
    
    // Insert or update
    db.prepare(`
      INSERT INTO work_hours (id, start_hour, end_hour, updated_at)
      VALUES (1, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        start_hour = excluded.start_hour,
        end_hour = excluded.end_hour,
        updated_at = excluded.updated_at
    `).run(start_hour, end_hour);

    const workHours = db.prepare('SELECT * FROM work_hours WHERE id = 1').get();
    res.json(workHours);
  } catch (error) {
    console.error('Error updating work hours:', error);
    res.status(500).json({ error: 'Failed to update work hours' });
  }
});

export default router;

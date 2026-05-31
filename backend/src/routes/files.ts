import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { getDatabase } from '../database';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.stl', '.gcode', '.gco', '.g'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only STL and gcode files are allowed.'));
    }
  }
});

// Upload file
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const user_id = (req as any).user.id;
    const file = req.file;
    const fileHash = crypto.createHash('md5').update(fs.readFileSync(file.path)).digest('hex');

    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO files (
        user_id, original_name, stored_name, file_path, file_size, 
        file_type, checksum, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      user_id,
      file.originalname,
      file.filename,
      file.path,
      file.size,
      path.extname(file.originalname).toLowerCase(),
      fileHash
    );

    const fileRecord = db.prepare('SELECT * FROM files WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      id: (fileRecord as any).id,
      original_name: (fileRecord as any).original_name,
      file_size: (fileRecord as any).file_size,
      file_type: (fileRecord as any).file_type,
      uploaded_at: (fileRecord as any).uploaded_at,
      checksum: (fileRecord as any).checksum
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    // Clean up uploaded file on error
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Download file
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const file_id = req.params.id;
    const user_id = (req as any).user.id;
    const user_role = (req as any).user.role;

    const db = getDatabase();
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(file_id);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Students can only download their own files
    if (user_role === 'student' && (file as any).user_id !== user_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const filePath = (file as any).file_path;
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.download(filePath, (file as any).original_name);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Get file metadata
router.get('/:id/metadata', authenticateToken, async (req, res) => {
  try {
    const file_id = req.params.id;
    const user_id = (req as any).user.id;
    const user_role = (req as any).user.role;

    const db = getDatabase();
    const file = db.prepare(`
      SELECT f.*, u.username FROM files f 
      JOIN users u ON f.user_id = u.id 
      WHERE f.id = ?
    `).get(file_id);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Students can only see their own files
    if (user_role === 'student' && (file as any).user_id !== user_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Don't expose file_path to clients
    const { file_path, stored_name, ...metadata } = file as any;
    res.json(metadata);
  } catch (error) {
    console.error('Error fetching file metadata:', error);
    res.status(500).json({ error: 'Failed to fetch file metadata' });
  }
});

// Delete file
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const file_id = req.params.id;
    const user_id = (req as any).user.id;
    const user_role = (req as any).user.role;

    const db = getDatabase();
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(file_id);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Students can only delete their own files
    if (user_role === 'student' && (file as any).user_id !== user_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if file is used by any jobs
    const jobsUsingFile = db.prepare('SELECT COUNT(*) as count FROM print_jobs WHERE file_id = ?')
      .get(file_id) as any;
    
    if (jobsUsingFile.count > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete file that is associated with print jobs' 
      });
    }

    // Delete file from disk
    const filePath = (file as any).file_path;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    db.prepare('DELETE FROM files WHERE id = ?').run(file_id);

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

export default router;

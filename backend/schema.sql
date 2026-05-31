# Database Schema and Migrations

This file contains the SQL schema for the print farm orchestrator database.

## Initial Setup

Run this SQL to create the database schema:

```sql
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('student', 'operator', 'admin')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Files table
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_type TEXT NOT NULL,
  checksum TEXT,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Print jobs table
CREATE TABLE IF NOT EXISTS print_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  file_id INTEGER,
  printer_type TEXT NOT NULL CHECK(printer_type IN ('fdm', 'resin')),
  slicer TEXT CHECK(slicer IN ('cura', 'orca', 'prusa', 'bambu', 'preform')),
  deadline DATETIME NOT NULL,
  quantity INTEGER DEFAULT 1,
  parts_per_print INTEGER DEFAULT 1,
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'scheduled', 'printing', 'completed', 'failed', 'cancelled')),
  estimated_time_minutes INTEGER,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE SET NULL
);

-- Printer-specific times
CREATE TABLE IF NOT EXISTS job_printer_times (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  printer_id TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL,
  FOREIGN KEY (job_id) REFERENCES print_jobs(id) ON DELETE CASCADE
);

-- Printers table
CREATE TABLE IF NOT EXISTS printers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('fdm', 'resin')),
  model TEXT,
  slicer TEXT NOT NULL CHECK(slicer IN ('cura', 'orca', 'prusa', 'bambu', 'preform')),
  speed_multiplier REAL DEFAULT 1.0,
  max_print_speed INTEGER,
  build_volume_x INTEGER,
  build_volume_y INTEGER,
  build_volume_z INTEGER,
  status TEXT DEFAULT 'offline' CHECK(status IN ('online', 'printing', 'paused', 'error', 'offline')),
  ip_address TEXT,
  webcam_url TEXT,
  connection_type TEXT CHECK(connection_type IN ('wifi', 'usb', 'network')),
  integration_type TEXT CHECK(integration_type IN ('octoprint', 'moonraker', 'serial', 'bambu', 'formlabs')),
  connection_details TEXT,
  current_job_id INTEGER,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (current_job_id) REFERENCES print_jobs(id) ON DELETE SET NULL
);

-- Queue schedule
CREATE TABLE IF NOT EXISTS queue_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  printer_id TEXT NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  is_overnight BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES print_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (printer_id) REFERENCES printers(id) ON DELETE CASCADE
);

-- Work hours configuration
CREATE TABLE IF NOT EXISTS work_hours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_hour INTEGER NOT NULL CHECK(start_hour >= 0 AND start_hour <= 23),
  end_hour INTEGER NOT NULL CHECK(end_hour >= 0 AND end_hour <= 23),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default work hours (8am - 6pm)
INSERT OR IGNORE INTO work_hours (id, start_hour, end_hour) VALUES (1, 8, 18);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_user_id ON print_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_file_id ON print_jobs(file_id);
CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON print_jobs(status);
CREATE INDEX IF NOT EXISTS idx_print_jobs_deadline ON print_jobs(deadline);
CREATE INDEX IF NOT EXISTS idx_queue_schedule_job_id ON queue_schedule(job_id);
CREATE INDEX IF NOT EXISTS idx_queue_schedule_printer_id ON queue_schedule(printer_id);
CREATE INDEX IF NOT EXISTS idx_queue_schedule_start_time ON queue_schedule(start_time);

-- Insert default admin user (password: admin123 - CHANGE THIS!)
-- Password hash is bcrypt hash of 'admin123'
INSERT OR IGNORE INTO users (id, username, email, password_hash, role)
VALUES (1, 'admin', 'admin@printfarm.local', '$2b$10$rZJ5qhJ5qhJ5qhJ5qhJ5qOxKxKxKxKxKxKxKxKxKxKxKxKxKxKxKx', 'admin');
```

## Sample Data for Testing

```sql
-- Sample students
INSERT OR IGNORE INTO users (username, email, password_hash, role) VALUES
  ('student1', 'student1@school.edu', '$2b$10$rZJ5qhJ5qhJ5qhJ5qhJ5qOxKxKxKxKxKxKxKxKxKxKxKxKxKxKxKx', 'student'),
  ('student2', 'student2@school.edu', '$2b$10$rZJ5qhJ5qhJ5qhJ5qhJ5qOxKxKxKxKxKxKxKxKxKxKxKxKxKxKxKx', 'student');

-- Sample operator
INSERT OR IGNORE INTO users (username, email, password_hash, role) VALUES
  ('operator1', 'operator@school.edu', '$2b$10$rZJ5qhJ5qhJ5qhJ5qhJ5qOxKxKxKxKxKxKxKxKxKxKxKxKxKxKxKx', 'operator');

-- Sample printers (matching the frontend sample data)
INSERT OR IGNORE INTO printers (id, name, type, model, slicer, speed_multiplier, max_print_speed, build_volume_x, build_volume_y, build_volume_z, status, ip_address, connection_type) VALUES
  ('1', 'Ender 3 Pro #1', 'fdm', 'Creality Ender 3 Pro', 'cura', 1.0, 60, 220, 220, 250, 'online', '192.168.1.101', 'wifi'),
  ('2', 'Ender 3 Pro #2', 'fdm', 'Creality Ender 3 Pro', 'cura', 1.0, 60, 220, 220, 250, 'online', '192.168.1.102', 'wifi'),
  ('3', 'Prusa MK3S+ #1', 'fdm', 'Prusa i3 MK3S+', 'prusa', 1.1, 80, 250, 210, 210, 'online', '192.168.1.103', 'wifi'),
  ('4', 'Prusa MK3S+ #2', 'fdm', 'Prusa i3 MK3S+', 'prusa', 1.1, 80, 250, 210, 210, 'offline', '192.168.1.104', 'wifi'),
  ('5', 'Bambu X1 Carbon', 'fdm', 'Bambu Lab X1 Carbon', 'bambu', 1.3, 150, 256, 256, 256, 'online', '192.168.1.105', 'wifi'),
  ('6', 'Ultimaker S3', 'fdm', 'Ultimaker S3', 'cura', 0.95, 70, 230, 190, 200, 'offline', '192.168.1.106', 'wifi'),
  ('7', 'Form 3+ Resin #1', 'resin', 'Formlabs Form 3+', 'preform', 1.0, 50, 145, 145, 185, 'online', '192.168.1.107', 'wifi'),
  ('8', 'Form 3+ Resin #2', 'resin', 'Formlabs Form 3+', 'preform', 1.0, 50, 145, 145, 185, 'online', '192.168.1.108', 'wifi');
```

## Migration Notes

- All timestamps use DATETIME format
- Foreign keys have CASCADE delete to maintain referential integrity
- Indexes added for common query patterns
- Default admin user created (username: admin, password: admin123)
  **⚠️ CHANGE THE DEFAULT PASSWORD IMMEDIATELY IN PRODUCTION!**

## Updating the Schema

If you need to add new columns or tables, create a new migration file with a timestamp.

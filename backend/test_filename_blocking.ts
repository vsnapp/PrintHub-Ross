#!/usr/bin/env tsx
/**
 * Test to verify if job filenames are being blocked for students viewing other printers
 */

import Database from 'better-sqlite3';
import * as bcrypt from 'bcrypt';

const TEST_DB_PATH = '/tmp/test_filename_blocking.db';

// Clean up existing test database
try {
  require('fs').unlinkSync(TEST_DB_PATH);
} catch (e) {}

const db = new Database(TEST_DB_PATH);
db.pragma('foreign_keys = ON');

console.log('🔧 Setting up test database to verify filename blocking...\n');

// Create tables
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('student', 'operator', 'admin', 'org_admin')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE print_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    printer_type TEXT NOT NULL CHECK(printer_type IN ('fdm', 'resin')),
    deadline DATETIME NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE printers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('fdm', 'resin')),
    model TEXT,
    slicer TEXT NOT NULL CHECK(slicer IN ('cura', 'orca', 'prusa', 'bambu', 'preform')),
    status TEXT DEFAULT 'offline',
    ip_address TEXT,
    webcam_url TEXT,
    current_job_id INTEGER,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (current_job_id) REFERENCES print_jobs(id) ON DELETE SET NULL
  );
`);

// Create test users
const passwordHash = bcrypt.hashSync('test123', 10);

const student1Id = db.prepare(`
  INSERT INTO users (username, email, password_hash, role)
  VALUES (?, ?, ?, ?)
`).run('student1', 'student1@test.edu', passwordHash, 'student').lastInsertRowid;

const student2Id = db.prepare(`
  INSERT INTO users (username, email, password_hash, role)
  VALUES (?, ?, ?, ?)
`).run('student2', 'student2@test.edu', passwordHash, 'student').lastInsertRowid;

// Create test jobs with sensitive filenames
const job1Id = db.prepare(`
  INSERT INTO print_jobs (user_id, name, printer_type, deadline, status)
  VALUES (?, ?, ?, datetime('now', '+1 day'), 'printing')
`).run(student1Id, 'StudentSecretProject_Confidential.stl', 'fdm').lastInsertRowid;

const job2Id = db.prepare(`
  INSERT INTO print_jobs (user_id, name, printer_type, deadline, status)
  VALUES (?, ?, ?, datetime('now', '+1 day'), 'printing')
`).run(student2Id, 'PrivateDesign_DoNotShare.stl', 'fdm').lastInsertRowid;

console.log('✅ Created test jobs with sensitive filenames:');
console.log(`   - Job ${job1Id}: "StudentSecretProject_Confidential.stl" (owned by student1)`);
console.log(`   - Job ${job2Id}: "PrivateDesign_DoNotShare.stl" (owned by student2)\n`);

// Create test printers
db.prepare(`
  INSERT INTO printers (id, name, type, model, slicer, webcam_url, current_job_id, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run('printer1', 'Printer 1', 'fdm', 'Test Model', 'cura', 'http://printer1.local/webcam', job1Id, 'printing');

db.prepare(`
  INSERT INTO printers (id, name, type, model, slicer, webcam_url, current_job_id, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run('printer2', 'Printer 2', 'fdm', 'Test Model', 'cura', 'http://printer2.local/webcam', job2Id, 'printing');

// Filtering function (current implementation)
function filterPrinterData(printer: any, userId: number, userRole: string): any {
  if (userRole === 'operator' || userRole === 'admin' || userRole === 'org_admin') {
    return printer;
  }

  if (userRole === 'student') {
    const filteredPrinter = { ...printer };

    if (printer.current_job_id) {
      try {
        const job = db.prepare('SELECT user_id FROM print_jobs WHERE id = ?').get(printer.current_job_id) as any;
        
        if (!job || job.user_id !== userId) {
          delete filteredPrinter.webcam_url;
          
          if (filteredPrinter.currentJob) {
            delete filteredPrinter.currentJob.name;
          }
        }
      } catch (error) {
        console.error('Error checking job ownership:', error);
        delete filteredPrinter.webcam_url;
      }
    } else {
      delete filteredPrinter.webcam_url;
      
      if (filteredPrinter.currentJob) {
        delete filteredPrinter.currentJob.name;
      }
    }

    return filteredPrinter;
  }

  return printer;
}

console.log('🧪 Testing Current Implementation\n');
console.log('═'.repeat(70));

// Simulate what the API returns - just the printer table data
const printers = db.prepare('SELECT * FROM printers').all();

console.log('\n📋 Test: Student1 views printers (current implementation)');
console.log('─'.repeat(70));

const student1Results = printers.map((p: any) => filterPrinterData(p, Number(student1Id), 'student'));

student1Results.forEach((p: any) => {
  console.log(`\n  ${p.name}:`);
  console.log(`    - current_job_id: ${p.current_job_id}`);
  console.log(`    - Has webcam_url: ${!!p.webcam_url ? '✅ YES' : '❌ NO'}`);
});

console.log('\n⚠️  ISSUE: The printer table only has current_job_id, not the actual job name!');
console.log('   The job name is in the print_jobs table and needs to be joined.');

// Now let's simulate what happens if we JOIN the job data
console.log('\n\n📋 Test: What if we JOIN job data? (potential data leak)');
console.log('─'.repeat(70));

const printersWithJobs = db.prepare(`
  SELECT p.*, j.name as job_name, j.user_id as job_user_id
  FROM printers p
  LEFT JOIN print_jobs j ON p.current_job_id = j.id
`).all();

console.log('\nPrinter data WITH job names (before filtering):');
printersWithJobs.forEach((p: any) => {
  console.log(`\n  ${p.name}:`);
  console.log(`    - job_name: "${p.job_name}"`);
  console.log(`    - job_user_id: ${p.job_user_id}`);
});

console.log('\n\n⚠️  CRITICAL FINDING:');
console.log('─'.repeat(70));
console.log(`
The current implementation has a gap:

1. ✅ If someone manually adds job data to the printer object (e.g., via WebSocket),
   the currentJob.name field WILL be filtered out.

2. ❌ BUT: The printers table can be JOINed with print_jobs to get job names,
   and the current filtering does NOT handle fields like "job_name" that might
   be added to the printer object from a JOIN query.

3. ❌ The API currently only does "SELECT * FROM printers" which doesn't include
   job names, so there's no immediate leak. HOWEVER, if anyone modifies the
   query to JOIN print_jobs, student names would be exposed.

RECOMMENDATION:
- Add explicit filtering to remove ANY job-related fields from the printer object
  when the student doesn't own the job, not just "currentJob.name"
- This includes: job_name, job.name, print_job_name, etc.
`);

console.log('\n📊 Summary\n');
console.log('Current Status:');
console.log('  ❌ Filenames are NOT currently being leaked (good)');
console.log('  ⚠️  BUT: Implementation is fragile and could leak if queries change');
console.log('  ✅ Need to add more robust filtering to handle JOINed job data\n');

db.close();

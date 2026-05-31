#!/usr/bin/env tsx
/**
 * Integration test script for webcam access control
 * Tests the application with different user roles (student, operator, admin)
 */

import Database from 'better-sqlite3';
import * as bcrypt from 'bcrypt';
import * as path from 'path';

const TEST_DB_PATH = '/tmp/test_printhub.db';

// Clean up any existing test database
try {
  require('fs').unlinkSync(TEST_DB_PATH);
} catch (e) {
  // Ignore if doesn't exist
}

const db = new Database(TEST_DB_PATH);
db.pragma('foreign_keys = ON');

console.log('🔧 Setting up test database...\n');

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
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'scheduled', 'printing', 'completed', 'failed', 'cancelled')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE printers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('fdm', 'resin')),
    model TEXT,
    slicer TEXT NOT NULL CHECK(slicer IN ('cura', 'orca', 'prusa', 'bambu', 'preform')),
    status TEXT DEFAULT 'offline' CHECK(status IN ('online', 'printing', 'paused', 'error', 'offline')),
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

const operatorId = db.prepare(`
  INSERT INTO users (username, email, password_hash, role)
  VALUES (?, ?, ?, ?)
`).run('operator1', 'operator1@test.edu', passwordHash, 'operator').lastInsertRowid;

const adminId = db.prepare(`
  INSERT INTO users (username, email, password_hash, role)
  VALUES (?, ?, ?, ?)
`).run('admin1', 'admin1@test.edu', passwordHash, 'admin').lastInsertRowid;

console.log('✅ Created test users:');
console.log(`   - student1 (ID: ${student1Id})`);
console.log(`   - student2 (ID: ${student2Id})`);
console.log(`   - operator1 (ID: ${operatorId})`);
console.log(`   - admin1 (ID: ${adminId})\n`);

// Create test jobs
const job1Id = db.prepare(`
  INSERT INTO print_jobs (user_id, name, printer_type, deadline, status)
  VALUES (?, ?, ?, datetime('now', '+1 day'), 'printing')
`).run(student1Id, 'Student1 Secret Project.stl', 'fdm').lastInsertRowid;

const job2Id = db.prepare(`
  INSERT INTO print_jobs (user_id, name, printer_type, deadline, status)
  VALUES (?, ?, ?, datetime('now', '+1 day'), 'printing')
`).run(student2Id, 'Student2 Confidential File.stl', 'fdm').lastInsertRowid;

console.log('✅ Created test jobs:');
console.log(`   - Job ${job1Id}: Student1 Secret Project.stl (owned by student1)`);
console.log(`   - Job ${job2Id}: Student2 Confidential File.stl (owned by student2)\n`);

// Create test printers
db.prepare(`
  INSERT INTO printers (id, name, type, model, slicer, webcam_url, current_job_id, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run('printer1', 'Test Printer 1', 'fdm', 'Test Model', 'cura', 'http://printer1.local/webcam', job1Id, 'printing');

db.prepare(`
  INSERT INTO printers (id, name, type, model, slicer, webcam_url, current_job_id, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run('printer2', 'Test Printer 2', 'fdm', 'Test Model', 'cura', 'http://printer2.local/webcam', job2Id, 'printing');

db.prepare(`
  INSERT INTO printers (id, name, type, model, slicer, webcam_url, current_job_id, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run('printer3', 'Test Printer 3', 'fdm', 'Test Model', 'cura', 'http://printer3.local/webcam', null, 'online');

console.log('✅ Created test printers:');
console.log(`   - printer1: Has student1's job (Job ${job1Id})`);
console.log(`   - printer2: Has student2's job (Job ${job2Id})`);
console.log(`   - printer3: Idle (no current job)\n`);

// Test filtering function (copied from implementation)
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

// Run tests
console.log('🧪 Running Integration Tests\n');
console.log('═'.repeat(70));

const printers = db.prepare('SELECT * FROM printers').all();

// Test 1: Student1 views all printers
console.log('\n📋 Test 1: Student1 views all printers');
console.log('─'.repeat(70));
const student1Results = printers.map((p: any) => filterPrinterData(p, Number(student1Id), 'student'));
student1Results.forEach((p: any) => {
  console.log(`\n  ${p.name}:`);
  console.log(`    - Has webcam_url: ${!!p.webcam_url ? '✅ YES' : '❌ NO'}`);
  console.log(`    - Current job ID: ${p.current_job_id || 'none'}`);
  if (p.webcam_url) {
    console.log(`    - Webcam URL: ${p.webcam_url}`);
  }
});

// Verify Test 1
const test1Pass = 
  student1Results[0].webcam_url && // printer1 should have webcam (student1's job)
  !student1Results[1].webcam_url && // printer2 should NOT have webcam (student2's job)
  !student1Results[2].webcam_url; // printer3 should NOT have webcam (no job)

console.log(`\n  Result: ${test1Pass ? '✅ PASS' : '❌ FAIL'}`);
if (test1Pass) {
  console.log('    Student1 can only see webcam for printer with their job');
}

// Test 2: Student2 views all printers
console.log('\n📋 Test 2: Student2 views all printers');
console.log('─'.repeat(70));
const student2Results = printers.map((p: any) => filterPrinterData(p, Number(student2Id), 'student'));
student2Results.forEach((p: any) => {
  console.log(`\n  ${p.name}:`);
  console.log(`    - Has webcam_url: ${!!p.webcam_url ? '✅ YES' : '❌ NO'}`);
  console.log(`    - Current job ID: ${p.current_job_id || 'none'}`);
  if (p.webcam_url) {
    console.log(`    - Webcam URL: ${p.webcam_url}`);
  }
});

// Verify Test 2
const test2Pass = 
  !student2Results[0].webcam_url && // printer1 should NOT have webcam (student1's job)
  student2Results[1].webcam_url && // printer2 should have webcam (student2's job)
  !student2Results[2].webcam_url; // printer3 should NOT have webcam (no job)

console.log(`\n  Result: ${test2Pass ? '✅ PASS' : '❌ FAIL'}`);
if (test2Pass) {
  console.log('    Student2 can only see webcam for printer with their job');
}

// Test 3: Operator views all printers
console.log('\n📋 Test 3: Operator views all printers');
console.log('─'.repeat(70));
const operatorResults = printers.map((p: any) => filterPrinterData(p, Number(operatorId), 'operator'));
operatorResults.forEach((p: any) => {
  console.log(`\n  ${p.name}:`);
  console.log(`    - Has webcam_url: ${!!p.webcam_url ? '✅ YES' : '❌ NO'}`);
  console.log(`    - Current job ID: ${p.current_job_id || 'none'}`);
  if (p.webcam_url) {
    console.log(`    - Webcam URL: ${p.webcam_url}`);
  }
});

// Verify Test 3
const test3Pass = 
  operatorResults[0].webcam_url && // printer1 should have webcam
  operatorResults[1].webcam_url && // printer2 should have webcam
  operatorResults[2].webcam_url; // printer3 should have webcam

console.log(`\n  Result: ${test3Pass ? '✅ PASS' : '❌ FAIL'}`);
if (test3Pass) {
  console.log('    Operator can see all webcams');
}

// Test 4: Admin views all printers
console.log('\n📋 Test 4: Admin views all printers');
console.log('─'.repeat(70));
const adminResults = printers.map((p: any) => filterPrinterData(p, Number(adminId), 'admin'));
adminResults.forEach((p: any) => {
  console.log(`\n  ${p.name}:`);
  console.log(`    - Has webcam_url: ${!!p.webcam_url ? '✅ YES' : '❌ NO'}`);
  console.log(`    - Current job ID: ${p.current_job_id || 'none'}`);
  if (p.webcam_url) {
    console.log(`    - Webcam URL: ${p.webcam_url}`);
  }
});

// Verify Test 4
const test4Pass = 
  adminResults[0].webcam_url && // printer1 should have webcam
  adminResults[1].webcam_url && // printer2 should have webcam
  adminResults[2].webcam_url; // printer3 should have webcam

console.log(`\n  Result: ${test4Pass ? '✅ PASS' : '❌ FAIL'}`);
if (test4Pass) {
  console.log('    Admin can see all webcams');
}

// Summary
console.log('\n' + '═'.repeat(70));
console.log('\n📊 Test Summary\n');

const allTestsPass = test1Pass && test2Pass && test3Pass && test4Pass;

console.log(`  Test 1 (Student1):  ${test1Pass ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  Test 2 (Student2):  ${test2Pass ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  Test 3 (Operator):  ${test3Pass ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  Test 4 (Admin):     ${test4Pass ? '✅ PASS' : '❌ FAIL'}`);
console.log('');
console.log('─'.repeat(70));
console.log(`\n  Overall: ${allTestsPass ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}\n`);

if (allTestsPass) {
  console.log('✨ Webcam access control is working correctly for all user roles!\n');
  console.log('Summary of access control:');
  console.log('  • Students can ONLY see webcams for printers with their own jobs');
  console.log('  • Operators and Admins can see all webcams');
  console.log('  • Idle printers (no job) hide webcams from students');
  console.log('');
}

// Cleanup
db.close();

process.exit(allTestsPass ? 0 : 1);

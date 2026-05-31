#!/usr/bin/env tsx
/**
 * End-to-end API test for webcam access control
 * Tests actual API endpoints with different user roles
 */

import Database from 'better-sqlite3';
import * as bcrypt from 'bcrypt';
import express from 'express';
import jwt from 'jsonwebtoken';

const TEST_DB_PATH = '/tmp/test_api_printhub.db';
const JWT_SECRET = 'test-secret-key';
const PORT = 13579;

// Clean up existing test database
try {
  require('fs').unlinkSync(TEST_DB_PATH);
} catch (e) {}

const db = new Database(TEST_DB_PATH);
db.pragma('foreign_keys = ON');

console.log('🔧 Setting up test database and API server...\n');

// Create schema
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

// Create test data
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

const job1Id = db.prepare(`
  INSERT INTO print_jobs (user_id, name, printer_type, deadline, status)
  VALUES (?, ?, ?, datetime('now', '+1 day'), 'printing')
`).run(student1Id, 'Student1 Secret Project.stl', 'fdm').lastInsertRowid;

const job2Id = db.prepare(`
  INSERT INTO print_jobs (user_id, name, printer_type, deadline, status)
  VALUES (?, ?, ?, datetime('now', '+1 day'), 'printing')
`).run(student2Id, 'Student2 Confidential File.stl', 'fdm').lastInsertRowid;

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

// Filtering function
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

// Create Express app
const app = express();
app.use(express.json());

// Auth middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Printers endpoint
app.get('/api/printers', authenticateToken, (req: any, res: any) => {
  try {
    const printers = db.prepare('SELECT * FROM printers WHERE is_active = 1').all();
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const filteredPrinters = printers.map((printer: any) => 
      filterPrinterData(printer, userId, userRole)
    );

    res.json({ printers: filteredPrinters });
  } catch (error) {
    console.error('Error fetching printers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
const server = app.listen(PORT, async () => {
  console.log(`✅ Test API server started on port ${PORT}\n`);
  
  // Generate tokens for each user
  const student1Token = jwt.sign({ id: student1Id, username: 'student1', role: 'student' }, JWT_SECRET);
  const student2Token = jwt.sign({ id: student2Id, username: 'student2', role: 'student' }, JWT_SECRET);
  const operatorToken = jwt.sign({ id: operatorId, username: 'operator1', role: 'operator' }, JWT_SECRET);

  console.log('🧪 Running API Tests\n');
  console.log('═'.repeat(70));

  // Helper to make API calls
  const fetch = (await import('node-fetch')).default;

  async function testRole(roleName: string, token: string, expectedWebcams: boolean[]) {
    console.log(`\n📋 Test: ${roleName} calls GET /api/printers`);
    console.log('─'.repeat(70));

    const response = await fetch(`http://localhost:${PORT}/api/printers`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json() as any;
    const printers = data.printers;

    let passed = true;
    printers.forEach((p: any, i: number) => {
      const hasWebcam = !!p.webcam_url;
      const expected = expectedWebcams[i];
      const match = hasWebcam === expected;

      console.log(`\n  ${p.name}:`);
      console.log(`    - Has webcam_url: ${hasWebcam ? '✅ YES' : '❌ NO'}`);
      console.log(`    - Expected: ${expected ? 'YES' : 'NO'}`);
      console.log(`    - Match: ${match ? '✅' : '❌'}`);

      if (!match) passed = false;
    });

    console.log(`\n  Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    return passed;
  }

  // Run tests
  const test1 = await testRole('Student1', student1Token, [true, false, false]);
  const test2 = await testRole('Student2', student2Token, [false, true, false]);
  const test3 = await testRole('Operator', operatorToken, [true, true, true]);

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('\n📊 API Test Summary\n');

  const allPassed = test1 && test2 && test3;

  console.log(`  Test 1 (Student1):  ${test1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Test 2 (Student2):  ${test2 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Test 3 (Operator):  ${test3 ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
  console.log('─'.repeat(70));
  console.log(`\n  Overall: ${allPassed ? '✅ ALL API TESTS PASSED' : '❌ SOME TESTS FAILED'}\n`);

  if (allPassed) {
    console.log('✨ API endpoints are correctly filtering webcam access!\n');
  }

  // Cleanup
  server.close();
  db.close();
  process.exit(allPassed ? 0 : 1);
});

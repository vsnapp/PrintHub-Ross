import Database from 'better-sqlite3';
import type { Database as DatabaseType, Statement } from 'better-sqlite3';
import * as bcrypt from 'bcrypt';

const DB_PATH = process.env.DATABASE_URL || './database.db';

// Initialize database
export const db: DatabaseType = new Database(DB_PATH);

// Export database getter for routes
export function getDatabase(): DatabaseType {
  return db;
}

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize schema
export function initializeDatabase() {
  console.log('Initializing database...');
  
  // Create tables directly (schema.sql is documentation)
  
  // Organizations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      domain TEXT UNIQUE,
      subscription_id TEXT,
      subscription_status TEXT DEFAULT 'inactive' CHECK(subscription_status IN ('active', 'inactive', 'trial', 'cancelled', 'past_due')),
      subscription_plan TEXT CHECK(subscription_plan IN ('standard', 'custom')),
      subscription_starts_at DATETIME,
      subscription_ends_at DATETIME,
      num_printers INTEGER DEFAULT 0,
      num_additional_users INTEGER DEFAULT 0,
      price_per_printer REAL DEFAULT 10.00,
      price_per_additional_user REAL DEFAULT 0.25,
      custom_pricing BOOLEAN DEFAULT 0,
      custom_monthly_fee REAL,
      saml_enabled BOOLEAN DEFAULT 0,
      saml_entity_id TEXT,
      saml_sso_url TEXT,
      saml_certificate TEXT,
      settings TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      organization_id INTEGER,
      role TEXT NOT NULL CHECK(role IN ('student', 'operator', 'admin', 'org_admin')),
      is_org_admin BOOLEAN DEFAULT 0,
      is_whitelisted BOOLEAN DEFAULT 0,
      saml_identifier TEXT,
      email_verified BOOLEAN DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
    )
  `);

  // Files table
  db.exec(`
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
    )
  `);

  // Print jobs table
  db.exec(`
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
    )
  `);

  // Printer-specific times
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_printer_times (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      printer_id TEXT NOT NULL,
      estimated_minutes INTEGER NOT NULL,
      FOREIGN KEY (job_id) REFERENCES print_jobs(id) ON DELETE CASCADE
    )
  `);

  // Printers table
  db.exec(`
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
    )
  `);

  ensurePrinterColumns();
  ensurePrintJobColumns();

  // Queue schedule
  db.exec(`
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
    )
  `);

  // Work hours configuration
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_hours (
      id INTEGER PRIMARY KEY,
      start_hour INTEGER NOT NULL CHECK(start_hour >= 0 AND start_hour <= 23),
      end_hour INTEGER NOT NULL CHECK(end_hour >= 0 AND end_hour <= 23),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Subscription transactions/audit log
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscription_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      transaction_type TEXT NOT NULL CHECK(transaction_type IN ('created', 'updated', 'cancelled', 'payment_succeeded', 'payment_failed')),
      amount REAL,
      currency TEXT DEFAULT 'USD',
      stripe_invoice_id TEXT,
      stripe_payment_id TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    )
  `);

  // Audit logs for compliance
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      organization_id INTEGER,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
    CREATE INDEX IF NOT EXISTS idx_print_jobs_user_id ON print_jobs(user_id);
    CREATE INDEX IF NOT EXISTS idx_print_jobs_file_id ON print_jobs(file_id);
    CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON print_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_print_jobs_deadline ON print_jobs(deadline);
    CREATE INDEX IF NOT EXISTS idx_queue_schedule_job_id ON queue_schedule(job_id);
    CREATE INDEX IF NOT EXISTS idx_queue_schedule_printer_id ON queue_schedule(printer_id);
    CREATE INDEX IF NOT EXISTS idx_queue_schedule_start_time ON queue_schedule(start_time);
    CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_organizations_domain ON organizations(domain);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_id ON audit_logs(organization_id);
    CREATE INDEX IF NOT EXISTS idx_subscription_transactions_organization_id ON subscription_transactions(organization_id);
  `);

  // Insert default work hours (8am - 6pm)
  db.exec(`INSERT OR IGNORE INTO work_hours (id, start_hour, end_hour) VALUES (1, 8, 18)`);
  
  // Create default admin if not exists
  createDefaultAdmin();
  
  // Initialize sample printers if none exist
  initializeSamplePrinters();
  
  console.log('Database initialized successfully');
}

function ensurePrinterColumns() {
  const columns = db.prepare("PRAGMA table_info('printers')").all() as Array<{ name: string }>;
  const existing = new Set(columns.map((column) => column.name));

  if (!existing.has('integration_type')) {
    db.exec("ALTER TABLE printers ADD COLUMN integration_type TEXT CHECK(integration_type IN ('octoprint', 'moonraker', 'serial', 'bambu', 'formlabs'))");
  }

  if (!existing.has('connection_details')) {
    db.exec('ALTER TABLE printers ADD COLUMN connection_details TEXT');
  }

  // Per-printer default slicing settings (JSON: layerHeight, infill, nozzleTemperature, ...)
  if (!existing.has('slicer_settings')) {
    db.exec('ALTER TABLE printers ADD COLUMN slicer_settings TEXT');
  }
}

function ensurePrintJobColumns() {
  const columns = db.prepare("PRAGMA table_info('print_jobs')").all() as Array<{ name: string }>;
  const existing = new Set(columns.map((column) => column.name));

  // Sliced gcode produced for this job (the STL stays in file_id).
  if (!existing.has('gcode_file_id')) {
    db.exec('ALTER TABLE print_jobs ADD COLUMN gcode_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL');
  }
}

// Create default admin user
function createDefaultAdmin() {
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  
  if (!adminExists) {
    const passwordHash = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (username, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `).run('admin', 'admin@printfarm.local', passwordHash, 'admin');
    
    console.log('⚠️  Default admin user created:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('   ⚠️  CHANGE THIS PASSWORD IMMEDIATELY!');
  }
}

// Initialize sample printers
function initializeSamplePrinters() {
  // Sample printers removed for production
  // Printers should only be added by users through the UI
  console.log('✅ Sample printers initialization skipped (production mode)');
}

// Prepared statements for common queries (initialized after database)
export const userQueries = {
  findByUsername: () => db.prepare('SELECT * FROM users WHERE username = ?') as any,
  findByEmail: () => db.prepare('SELECT * FROM users WHERE email = ?') as any,
  findById: () => db.prepare('SELECT * FROM users WHERE id = ?') as any,
  create: () => db.prepare(`
    INSERT INTO users (username, email, password_hash, role, organization_id)
    VALUES (?, ?, ?, ?, ?)
  `) as any,
  updateOrganization: () => db.prepare(`
    UPDATE users SET organization_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `) as any,
  listByOrganization: () => db.prepare(`
    SELECT id, username, email, role, is_org_admin, is_whitelisted, email_verified, is_active, created_at 
    FROM users WHERE organization_id = ?
  `) as any,
  updateWhitelist: () => db.prepare(`
    UPDATE users SET is_whitelisted = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `) as any,
  listWhitelisted: () => db.prepare(`
    SELECT id, username, email, role, is_whitelisted, created_at 
    FROM users WHERE is_whitelisted = 1
  `) as any,
};

export const organizationQueries = {
  findById: () => db.prepare('SELECT * FROM organizations WHERE id = ?') as any,
  findByDomain: () => db.prepare('SELECT * FROM organizations WHERE domain = ?') as any,
  create: () => db.prepare(`
    INSERT INTO organizations (name, domain, subscription_plan, subscription_status)
    VALUES (?, ?, ?, ?)
  `) as any,
  updateSubscription: () => db.prepare(`
    UPDATE organizations 
    SET subscription_id = ?, subscription_status = ?, subscription_plan = ?,
        subscription_starts_at = ?, subscription_ends_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `) as any,
  updateSAML: () => db.prepare(`
    UPDATE organizations
    SET saml_enabled = ?, saml_entity_id = ?, saml_sso_url = ?, saml_certificate = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `) as any,
  list: () => db.prepare('SELECT * FROM organizations ORDER BY created_at DESC') as any,
};

export const auditLogQueries = {
  create: () => db.prepare(`
    INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, details, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `) as any,
  listByOrganization: () => db.prepare(`
    SELECT * FROM audit_logs WHERE organization_id = ? ORDER BY created_at DESC LIMIT ?
  `) as any,
  listByUser: () => db.prepare(`
    SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
  `) as any,
};

export const subscriptionTransactionQueries = {
  create: () => db.prepare(`
    INSERT INTO subscription_transactions (organization_id, transaction_type, amount, currency, stripe_invoice_id, stripe_payment_id, details)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `) as any,
  listByOrganization: () => db.prepare(`
    SELECT * FROM subscription_transactions WHERE organization_id = ? ORDER BY created_at DESC LIMIT ?
  `) as any,
};

// Utility functions for license validation
export function checkOrganizationSubscription(organizationId: number): { valid: boolean; reason?: string } {
  const org = organizationQueries.findById().get(organizationId) as any;
  
  if (!org) {
    return { valid: false, reason: 'Organization not found' };
  }

  if (org.subscription_status === 'inactive') {
    return { valid: false, reason: 'Subscription is inactive' };
  }

  if (org.subscription_status === 'cancelled') {
    return { valid: false, reason: 'Subscription has been cancelled' };
  }

  if (org.subscription_status === 'past_due') {
    return { valid: false, reason: 'Subscription payment is past due' };
  }

  // Check if subscription has expired
  if (org.subscription_ends_at) {
    const endDate = new Date(org.subscription_ends_at);
    if (endDate < new Date()) {
      return { valid: false, reason: 'Subscription has expired' };
    }
  }

  return { valid: true };
}

export function getDomainFromEmail(email: string): string | null {
  // Use a more specific regex to avoid ReDoS vulnerability
  // Only match valid domain characters: alphanumeric, hyphen, and dots
  const match = email.match(/@([a-zA-Z0-9.-]+)$/);
  return match ? match[1].toLowerCase() : null;
}

export function findOrganizationByEmailDomain(email: string): any | null {
  const domain = getDomainFromEmail(email);
  if (!domain) return null;
  
  return organizationQueries.findByDomain().get(domain);
}

// Graceful shutdown
export function closeDatabase() {
  db.close();
  console.log('Database connection closed');
}

# Print Farm Orchestrator - Hybrid Architecture

## Overview

This project implements a **dual-mode system** for 3D print farm management:

1. **Web Interface** - Student/User portal for submitting print jobs
2. **Desktop App** - Operator tool with embedded slicer integration

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Students/Users                          │
│              (Web Browser - Any Device)                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ HTTPS/WebSocket
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   Backend API Server                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   REST API   │  │  WebSocket   │  │   Database   │      │
│  │  Endpoints   │  │   Server     │  │  (SQLite/    │      │
│  │              │  │              │  │  PostgreSQL) │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Queue         │  │Slicer CLI    │  │File Storage  │      │
│  │Optimizer     │  │Integration   │  │(STL/Gcode)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ IPC/HTTP
                         │
┌────────────────────────▼────────────────────────────────────┐
│              Electron Desktop App                            │
│                  (Print Farm Operators)                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          React Frontend (Same as Web)                │   │
│  │  + Printer Control + Slicer UI Embedding             │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Cura          │  │PrusaSlicer   │  │Bambu Studio  │      │
│  │Integration   │  │Integration   │  │Integration   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │OrcaSlicer    │  │Preform       │                         │
│  │Integration   │  │Integration   │                         │
│  └──────────────┘  └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Web Interface (Student Portal)

**Current Implementation:** The existing React/Vite web app

**Features:**
- Upload STL files with metadata (name, deadline, quantity)
- Select printer type (FDM/Resin) and preferences
- View queue status and estimated completion times
- Track personal print jobs
- Receive notifications when prints are ready
- Read-only view of print farm schedule

**Access Control:**
- Authentication required (student login)
- Limited to own print jobs
- Cannot modify queue or printer settings
- Cannot approve/reject other users' jobs

**Tech Stack:**
- React + TypeScript
- Vite build system
- TailwindCSS + shadcn/ui
- REST API client
- WebSocket for real-time updates

### 2. Backend API Server

**New Implementation Required**

**Core Services:**

#### Print Job Management
```typescript
POST   /api/jobs              - Submit new print job
GET    /api/jobs              - List all jobs (filtered by user)
GET    /api/jobs/:id          - Get job details
PATCH  /api/jobs/:id          - Update job (operators only)
DELETE /api/jobs/:id          - Cancel job

POST   /api/jobs/:id/approve  - Approve job (operators only)
POST   /api/jobs/:id/reject   - Reject job (operators only)
```

#### File Management
```typescript
POST   /api/files/upload      - Upload STL file
GET    /api/files/:id         - Download file
POST   /api/files/:id/slice   - Trigger slicing job
GET    /api/files/:id/gcode   - Get sliced gcode
```

#### Queue Optimization
```typescript
GET    /api/queue             - Get optimized queue
POST   /api/queue/optimize    - Trigger optimization
GET    /api/queue/timeline    - Get schedule timeline
```

#### Printer Management
```typescript
GET    /api/printers          - List all printers
GET    /api/printers/:id      - Get printer details
PATCH  /api/printers/:id      - Update printer (operators only)
```

#### User Management
```typescript
POST   /api/auth/login        - User login
POST   /api/auth/logout       - User logout
GET    /api/auth/me           - Get current user
POST   /api/users             - Create user (admin only)
```

**WebSocket Events:**
```typescript
// Server -> Client
'job:created'           - New job submitted
'job:approved'          - Job approved by operator
'job:started'           - Print started
'job:completed'         - Print completed
'job:failed'           - Print failed
'queue:updated'         - Queue optimization updated
'printer:status'        - Printer status changed

// Client -> Server  
'subscribe:jobs'        - Subscribe to job updates
'subscribe:printers'    - Subscribe to printer updates
```

**Database Schema:**

```sql
-- Users table
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('student', 'operator', 'admin')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Print jobs table
CREATE TABLE print_jobs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK(file_type IN ('stl', 'gcode')),
  printer_type TEXT NOT NULL CHECK(printer_type IN ('fdm', 'resin')),
  slicer TEXT CHECK(slicer IN ('cura', 'orca', 'prusa', 'bambu', 'preform')),
  deadline DATETIME NOT NULL,
  quantity INTEGER DEFAULT 1,
  parts_per_print INTEGER DEFAULT 1,
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'queued', 'printing', 'completed', 'failed', 'cancelled')),
  estimated_time_minutes INTEGER,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Printer-specific times
CREATE TABLE job_printer_times (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL,
  printer_id TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL,
  FOREIGN KEY (job_id) REFERENCES print_jobs(id)
);

-- Printers table
CREATE TABLE printers (
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
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Queue schedule
CREATE TABLE queue_schedule (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL,
  printer_id TEXT NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  is_overnight BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES print_jobs(id),
  FOREIGN KEY (printer_id) REFERENCES printers(id)
);
```

**Tech Stack Options:**
- **Node.js + Express** - JavaScript/TypeScript (matches frontend)
- **Python + FastAPI** - Better slicer CLI integration, ML potential
- **Rust + Actix** - High performance, type safety

**Recommended:** Node.js + Express for consistency with frontend

### 3. Electron Desktop App (Operator Tool)

**New Implementation Required**

**Main Features:**

#### Core UI (Shared with Web)
- All web interface features
- Plus operator-specific controls

#### Slicer Integration
- Launch slicer processes
- Embed slicer windows (via BrowserView or native)
- Pass STL files to slicers
- Retrieve gcode and metadata
- Store slicer profiles per printer

#### Enhanced Controls
- Approve/reject pending jobs
- Override queue optimization
- Manual printer assignment
- Real-time printer monitoring
- Emergency stop/pause all printers
- Printer maintenance tracking

#### Slicer Window Management
```typescript
// Example Electron IPC structure
ipcMain.handle('slicer:open', async (event, slicerId, stlPath) => {
  // Launch slicer with file
  const slicerProcess = launchSlicer(slicerId, stlPath);
  return { processId: slicerProcess.pid };
});

ipcMain.handle('slicer:getGcode', async (event, processId) => {
  // Wait for slicing to complete, return gcode path
});
```

**Tech Stack:**
- Electron 28+
- React (same codebase as web)
- Node.js backend integration
- Native module for slicer launching

**File Structure:**
```
electron/
├── main.ts                 # Electron main process
├── preload.ts             # Preload scripts
├── slicers/
│   ├── cura.ts            # Cura integration
│   ├── orca.ts            # OrcaSlicer integration
│   ├── prusa.ts           # PrusaSlicer integration
│   ├── bambu.ts           # Bambu Studio integration
│   └── preform.ts         # Preform integration
└── ipc/
    ├── handlers.ts        # IPC handlers
    └── events.ts          # IPC events
```

## Implementation Phases

### Phase 1: Backend API Setup (Week 1-2)
- [ ] Set up Node.js + Express server
- [ ] Implement database schema
- [ ] Create REST API endpoints
- [ ] Add WebSocket support
- [ ] Implement authentication/authorization
- [ ] File upload and storage
- [ ] Basic slicer CLI integration

### Phase 2: Web Interface Updates (Week 2-3)
- [ ] Update existing UI for dual-mode support
- [ ] Add user authentication
- [ ] Integrate with backend API
- [ ] Replace local state with API calls
- [ ] Add WebSocket real-time updates
- [ ] User role-based UI differences

### Phase 3: Electron Desktop App (Week 3-5)
- [ ] Set up Electron project structure
- [ ] Package React app in Electron
- [ ] Implement slicer integration modules
- [ ] Create slicer window embedding
- [ ] Add operator-specific controls
- [ ] Test on Windows/Mac/Linux

### Phase 4: Integration & Testing (Week 5-6)
- [ ] End-to-end testing
- [ ] Security audit
- [ ] Performance optimization
- [ ] Documentation
- [ ] Deployment guides

## Development Setup

### Backend Server
```bash
cd backend
npm install
npm run dev
```

### Web Interface (Student Portal)
```bash
npm install
npm run dev
```

### Electron Desktop App
```bash
cd electron-app
npm install
npm run electron:dev
```

## Deployment

### Web Interface
- Static hosting (Vercel, Netlify, S3)
- Or serve from backend

### Backend
- VPS/Cloud (AWS, DigitalOcean, Heroku)
- Docker container
- Reverse proxy (nginx)

### Desktop App
- Package with electron-builder
- Distribute via GitHub releases
- Auto-update support

## Security Considerations

- HTTPS for all API communication
- JWT tokens for authentication
- Rate limiting on uploads
- File size limits
- Virus scanning on uploads
- Role-based access control
- Audit logging for operator actions
- Secure slicer process isolation

## Configuration

### Environment Variables
```bash
# Backend
DATABASE_URL=sqlite:./database.db
JWT_SECRET=your-secret-key
PORT=3000
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=100MB

# Electron
API_URL=http://localhost:3000
SLICER_CURA_PATH=/path/to/cura
SLICER_PRUSA_PATH=/path/to/prusaslicer
SLICER_ORCA_PATH=/path/to/orcaslicer
SLICER_BAMBU_PATH=/path/to/bambu-studio
SLICER_PREFORM_PATH=/path/to/preform
```

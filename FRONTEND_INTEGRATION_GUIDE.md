# Frontend Integration Guide

Complete guide for the frontend-backend integration and Electron desktop app.

## ✅ Completed Features

### Backend APIs (Fully Implemented)
- ✅ Authentication (JWT login/register)
- ✅ Jobs API (CRUD + approval workflow)
- ✅ Files API (upload/download)
- ✅ Queue API (optimization + timeline)
- ✅ Work Hours API
- ✅ Printers API
- ✅ WebSocket server

### Frontend Integration (NEW - This Update)
- ✅ API client layer (`src/lib/api.ts`)
- ✅ WebSocket client (`src/lib/websocket.ts`)
- ✅ Authentication context (`src/contexts/AuthContext.tsx`)
- ✅ Login page (`src/pages/Login.tsx`)
- ✅ Register page (`src/pages/Register.tsx`)
- ✅ Protected routes with auto-redirect
- ✅ JWT token management
- ✅ Role-based access control

### Electron Desktop App (NEW - Foundation Created)
- ✅ Project structure (`electron/`)
- ✅ Package configuration
- ✅ Main process scaffold (`electron/src/main.ts`)
- ✅ Slicer manager (`electron/src/slicers/index.ts`)
- ✅ Documentation and README
- 🚧 Full slicer integration (scaffold complete, needs testing)
- 🚧 Preload script
- 🚧 API client for desktop app

## Getting Started

### 1. Frontend Setup

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your backend URL
# VITE_API_URL=http://localhost:3000/api
# VITE_WS_URL=http://localhost:3000

# Start dev server
npm run dev
```

### 2. Backend Setup

```bash
cd backend
npm install
npm run dev
# Server starts on http://localhost:3000
```

### 3. Test the Integration

**Login Flow:**
1. Navigate to http://localhost:5173
2. Redirected to `/login` (not authenticated)
3. Login with default credentials:
   - Username: `admin`
   - Password: `admin123`
4. Redirected to `/` (main dashboard)
5. JWT token stored in localStorage
6. WebSocket connection established

**Or Register:**
1. Click "Sign up" link
2. Create new student account
3. Auto-login after registration
4. Access to dashboard

### 4. Electron Desktop App

```bash
cd electron
npm install
npm run dev
```

## Architecture Overview

```
┌─────────────────┐
│  Web Browser    │ ← Students (upload files, track jobs)
│  (React App)    │
└────────┬────────┘
         │ HTTP/WebSocket
         │
┌────────▼────────┐
│  Backend API    │ ← Node.js + Express + SQLite
│  (Port 3000)    │
└────────┬────────┘
         │ HTTP/WebSocket
         │
┌────────▼────────┐
│  Electron App   │ ← Operators (manage printers, approve jobs)
│  (Desktop)      │   Embedded slicers (Cura, Prusa, Orca, Bambu, Preform)
└─────────────────┘
```

## API Usage Examples

### Login
```typescript
import { authApi } from '@/lib/api';

const response = await authApi.login({
  username: 'admin',
  password: 'admin123'
});

const { token, user } = response.data;
localStorage.setItem('auth_token', token);
```

### Upload File
```typescript
import { filesApi } from '@/lib/api';

const file = event.target.files[0];
const response = await filesApi.upload(file);
const { file_id } = response.data;
```

### Create Job
```typescript
import { jobsApi } from '@/lib/api';

const response = await jobsApi.create({
  name: 'Dragon Model',
  file_id: fileId,
  deadline: '2025-11-01',
  priority: 'medium'
});
```

### Optimize Queue
```typescript
import { queueApi } from '@/lib/api';

const response = await queueApi.optimize();
const { scheduled_prints, unscheduled_jobs } = response.data;
```

## WebSocket Events

Subscribe to real-time updates:

```typescript
import { subscribeToEvent } from '@/lib/websocket';

// Listen for new jobs
const unsubscribe = subscribeToEvent('job:created', (job) => {
  console.log('New job:', job);
  // Update UI
});

// Listen for queue updates
subscribeToEvent('queue:optimized', (data) => {
  console.log('Queue optimized:', data);
  // Refresh schedule
});

// Cleanup
unsubscribe();
```

## Role-Based Features

### Students
- ✅ Upload STL files
- ✅ Create print jobs
- ✅ View own jobs only
- ✅ Track print status
- ❌ Cannot approve jobs
- ❌ Cannot access all jobs

### Operators/Admins
- ✅ View all jobs
- ✅ Approve/reject jobs
- ✅ Update printer status
- ✅ Modify work hours
- ✅ Access Electron desktop app
- ✅ Launch slicers

## Authentication Flow

```
┌──────┐
│Login │
└──┬───┘
   │ POST /api/auth/login
   │
┌──▼──────────────────┐
│ Backend validates   │
│ Returns JWT + user  │
└──┬──────────────────┘
   │
┌──▼──────────────────┐
│ Store in localStorage│
│ - auth_token        │
│ - user (JSON)       │
└──┬──────────────────┘
   │
┌──▼──────────────────┐
│ Init WebSocket      │
│ with token          │
└──┬──────────────────┘
   │
┌──▼──────────────────┐
│ Redirect to /       │
│ (Protected Route)   │
└─────────────────────┘
```

## Electron Slicer Integration

### Launch Slicer UI
```typescript
// In Electron renderer process
const result = await window.electron.launchSlicer({
  slicer: 'cura',
  filePath: '/path/to/model.stl',
  printerType: 'fdm'
});

// Slicer opens in separate window
// User adjusts settings manually
// Exports gcode when done
```

### CLI Slicing
```typescript
const result = await window.electron.sliceFile({
  slicer: 'prusaslicer',
  filePath: '/path/to/model.stl',
  printerProfile: 'prusa_mk3s.ini',
  outputPath: '/path/to/output.gcode'
});

// Returns: { gcodeFile, printTime }
```

## Next Implementation Steps

### Frontend (Remaining)
1. **Connect Dashboard to API**
   - Replace mock data with API calls
   - Update PrintSchedule to use backend queue
   - Real-time updates via WebSocket

2. **File Upload Integration**
   - Wire up file upload to backend
   - Show upload progress
   - Handle errors

3. **Job Management UI**
   - Job creation form with API
   - Job list from backend
   - Approval/rejection UI (operators)

4. **User Profile**
   - Display logged-in user
   - Logout button
   - Role indicator

### Electron (Remaining)
1. **Complete Slicer Integrations**
   - Test each slicer's CLI
   - Handle slicer-specific config
   - Parse gcode metadata

2. **API Client**
   - HTTP client for backend
   - File upload/download
   - Job approval workflow

3. **Preload Script**
   - IPC bridge
   - Secure context isolation

4. **Build & Package**
   - Test on Windows/Mac/Linux
   - Create installers
   - Auto-update

## Testing Checklist

### Frontend
- [ ] Login with valid credentials
- [ ] Login with invalid credentials
- [ ] Register new account
- [ ] Auto-redirect when not authenticated
- [ ] Logout clears token
- [ ] WebSocket connects after login
- [ ] Role-based UI rendering

### Backend API
- [ ] All endpoints return correct data
- [ ] JWT validation works
- [ ] Role checks prevent unauthorized access
- [ ] File uploads work
- [ ] Queue optimization runs
- [ ] WebSocket events broadcast

### Electron
- [ ] App launches
- [ ] Detects installed slicers
- [ ] Opens slicer with STL file
- [ ] CLI slicing produces gcode
- [ ] Connects to backend API
- [ ] File selection dialog works

## Troubleshooting

### Frontend Issues

**"401 Unauthorized" errors:**
- Check token in localStorage
- Verify backend is running
- Check VITE_API_URL in .env

**WebSocket not connecting:**
- Verify VITE_WS_URL in .env
- Check backend WebSocket server
- Check browser console for errors

**Login redirect loop:**
- Clear localStorage
- Check AuthContext loading state
- Verify protected route logic

### Electron Issues

**Slicer not found:**
- Install slicer
- Set path in electron/.env
- Check SlicerManager detection logic

**Cannot connect to backend:**
- Check BACKEND_URL in electron/.env
- Verify backend is running
- Check CORS settings

## Security Notes

- ✅ JWT tokens have 7-day expiration
- ✅ Passwords hashed with bcrypt
- ✅ Role-based access control
- ✅ CORS configured for frontend
- ✅ SQL injection prevented (prepared statements)
- ⚠️ Change default admin password!
- ⚠️ Use HTTPS in production
- ⚠️ Implement rate limiting
- ⚠️ Add input validation

## Production Deployment

See `DEPLOYMENT.md` for complete production setup including:
- Environment variables
- Database configuration
- HTTPS setup
- Process management
- Monitoring
- Backups

---

**Status**: Frontend integration complete, Electron foundation complete.
**Next**: Wire up remaining UI components to backend APIs and complete Electron slicer testing.

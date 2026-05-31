# Desktop App Testing Guide

Complete guide for testing the Electron desktop app for print farm operators.

## Prerequisites

Before testing the desktop app, ensure you have:

1. **Node.js 18+** installed
2. **Backend API** running
3. **At least one slicer** installed (optional but recommended for full testing)

## Setup Instructions

### Step 1: Start the Backend API

The desktop app requires the backend API server to be running.

```bash
# Open a terminal and navigate to the backend directory
cd backend

# Install dependencies (first time only)
npm install

# Start the backend server
npm run dev
```

You should see:
```
Server running on http://localhost:3000
WebSocket server ready
```

**Keep this terminal open** - the backend must remain running.

### Step 2: Install Desktop App Dependencies

Open a **new terminal** window:

```bash
# Navigate to the electron directory
cd electron

# Install dependencies (first time only)
npm install
```

### Step 3: Start the Desktop App

In the same terminal (electron directory):

```bash
# Start the desktop app in development mode
npm run dev
```

This will:
1. Compile TypeScript files (`src/` → `dist/`)
2. Launch the Electron application
3. Open a desktop window

## Testing the App

### 1. Login Screen

When the app first opens, you'll see a login screen.

**Test Login:**
- Username: `admin`
- Password: `admin123`
- Click "Login"

**Expected Result:**
✅ You should be logged in and see the main dashboard
✅ Console should show: "Connected to backend API"
✅ WebSocket connection established

**Troubleshooting:**
- ❌ "Cannot connect to backend" → Make sure backend is running on port 3000
- ❌ "Invalid credentials" → Check username/password spelling
- ❌ App crashes → Check terminal for error messages

### 2. Dashboard Overview

After login, you should see:

- **Job Queue** - List of all print jobs (pending, approved, in progress)
- **Printers Panel** - Status of all printers (online/offline)
- **Queue Timeline** - Visual schedule of upcoming prints
- **Navigation Menu** - Jobs, Printers, Queue, Settings

### 3. View Print Jobs

**Steps:**
1. Click on "Jobs" in the navigation menu
2. View list of all print jobs

**What to Check:**
- ✅ Jobs are displayed with name, status, deadline
- ✅ Filter by status (pending, approved, printing, completed)
- ✅ Filter by printer type (FDM, Resin)
- ✅ Click on a job to see details

**Expected Data:**
- If no jobs exist, create one via the web portal first
- Or the database may have sample jobs pre-loaded

### 4. Approve/Reject Jobs (Operator Function)

**Steps:**
1. Find a job with status "pending"
2. Click on the job to open details
3. Click "Approve" or "Reject"

**Test Approve:**
- Job status changes to "approved"
- Job appears in queue optimizer
- Toast notification shows success
- WebSocket event broadcasts to other clients

**Test Reject:**
- Enter rejection reason (e.g., "File too large")
- Job status changes to "rejected"
- User is notified

### 5. Slicer Integration Testing

This is the **key feature** of the desktop app - the ability to launch real slicers.

#### 5.1 Check Available Slicers

**Steps:**
1. Click on "Settings" or "Slicers"
2. View list of detected slicers

**Expected Result:**
- ✅ Installed slicers show as "Available" with path
- ❌ Non-installed slicers show as "Not found"

**Example Output:**
```
Cura: ✅ Available (/Applications/UltiMaker Cura.app)
PrusaSlicer: ❌ Not found
OrcaSlicer: ✅ Available (/usr/bin/orcaslicer)
Bambu Studio: ❌ Not found
Preform: ❌ Not found
```

#### 5.2 Launch Slicer with Job

**Prerequisites:**
- At least one slicer installed (e.g., Cura)
- A job with STL file in "pending" or "approved" status

**Steps:**
1. Navigate to Jobs list
2. Select a job with an STL file
3. Click "Slice" or "Open in Slicer"
4. Select which slicer to use (if multiple available)
5. Click "Launch"

**Expected Result:**
✅ Slicer application opens in a **new window**
✅ STL file is loaded in the slicer
✅ You can interact with the slicer normally (rotate, scale, configure settings)
✅ Electron app remains open in background

**In the Slicer:**
- Configure your print settings (infill, layer height, supports, etc.)
- Click "Slice" in the slicer to generate gcode
- Save/export the gcode file

**After Slicing:**
- The gcode file is detected by the app
- Job status updates to "ready" or "approved"
- Print time is extracted from gcode
- Job enters the queue optimizer

#### 5.3 CLI Slicing (Automated)

**Advanced Testing:**

If you want to test automated slicing without opening the GUI:

**Steps:**
1. Open Developer Tools (View → Toggle Developer Tools)
2. In the console, run:

```javascript
await window.electron.sliceFile({
  slicer: 'cura',
  filePath: '/path/to/your/model.stl',
  printerProfile: '/path/to/profile.ini',
  outputPath: '/path/to/output.gcode'
});
```

**Expected Result:**
- Slicer runs in background (no window appears)
- Gcode file is created at outputPath
- Console shows print time estimate
- Returns: `{ success: true, gcodeFile: '...', printTime: 7200 }`

### 6. Printer Management

**Steps:**
1. Click "Printers" in navigation
2. View list of all printers

**What to Test:**
- ✅ View printer details (name, type, status, current job)
- ✅ Change printer status (operators only):
  - Click printer → Click "Mark Offline"
  - Status changes to "offline"
  - Printer is excluded from queue optimizer
- ✅ View printer statistics (total prints, hours, success rate)

**Test Status Updates:**
1. Mark printer offline
2. Run queue optimizer
3. Verify offline printer doesn't get new jobs
4. Mark printer back online

### 7. Queue Optimization

**Steps:**
1. Click "Queue" in navigation
2. View current optimized schedule
3. Click "Re-optimize" or "Optimize Queue"

**Expected Result:**
✅ Timeline updates with new job assignments
✅ Overnight jobs scheduled (12+ hours) finish at work hours start
✅ Short jobs scheduled during work hours
✅ Printer utilization percentages shown
✅ Unscheduled jobs listed (if any)

**What to Check:**
- Jobs respect printer type (FDM vs Resin)
- Deadlines are met
- Work hours configuration is applied (default 8am-6pm)
- Long prints scheduled overnight when possible

### 8. Real-time Updates (WebSocket)

**Test Multi-Client Sync:**

**Setup:**
1. Keep desktop app open
2. Open web portal in browser (http://localhost:5173)
3. Login as student or admin

**Test Sequence:**
1. In **web portal**: Create a new job
2. In **desktop app**: Job should appear immediately without refresh
3. In **desktop app**: Approve the job
4. In **web portal**: Job status updates to "approved" immediately
5. In **desktop app**: Run queue optimizer
6. In **web portal**: Timeline updates with new schedule

**Expected Result:**
✅ Changes sync instantly between web and desktop
✅ Toast notifications show updates
✅ No manual refresh needed

### 9. Work Hours Configuration

**Steps:**
1. Navigate to Settings → Work Hours
2. View current work hours (default: 8am-6pm)
3. Change to different hours (e.g., 9am-5pm)
4. Click "Save"
5. Run queue optimizer

**Expected Result:**
✅ Queue is re-optimized with new work hours
✅ Long prints rescheduled to finish at new start time
✅ Short prints during new work window

### 10. File Operations

**Test File Upload:**
1. Click "Upload File" or drag-and-drop STL/gcode
2. Select file from computer
3. Enter job details (name, deadline, priority)
4. Click "Upload"

**Expected Result:**
✅ File uploads to backend (`backend/uploads/`)
✅ Job is created in database
✅ File appears in jobs list
✅ Other clients see new job via WebSocket

**Test File Download:**
1. Click on a job with file
2. Click "Download STL" or "Download Gcode"
3. File downloads to your computer

## Common Issues & Solutions

### Issue: "Cannot start backend"

**Solution:**
```bash
cd backend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Issue: "Desktop app won't compile"

**Solution:**
```bash
cd electron
rm -rf dist node_modules package-lock.json
npm install
npm run build
npm run dev
```

### Issue: "Slicer not detected"

**Possible Causes:**
1. Slicer not installed
2. Non-standard installation path
3. Operating system differences

**Solution:**
- Verify slicer is installed and works standalone
- Check console for detected paths
- Manually configure path (if feature available)

### Issue: "WebSocket not connecting"

**Check:**
1. Backend is running on port 3000
2. No firewall blocking connections
3. Check console for WebSocket errors

**Solution:**
```bash
# Restart backend
cd backend
npm run dev

# Restart desktop app
cd electron
npm run dev
```

### Issue: "Login fails"

**Solution:**
1. Verify backend is running
2. Check credentials: admin / admin123
3. Check backend console for errors
4. Reset database:
```bash
cd backend
rm printfarm.db
npm run dev  # Will recreate with default admin
```

## Production Build Testing

### Build Installer

**For your OS:**

```bash
cd electron

# Windows
npm run package:win

# macOS
npm run package:mac

# Linux
npm run package:linux
```

**Test Installation:**
1. Navigate to `electron/release/`
2. Run the installer
3. Install the app
4. Launch from Applications/Start Menu
5. Verify all features work

## Performance Testing

### Test with Multiple Jobs

1. Create 20+ jobs via API or web portal
2. Open desktop app
3. Check load time
4. Scroll through jobs list
5. Run queue optimizer
6. Verify responsiveness

### Test with Real Files

1. Upload actual STL files (10-50MB)
2. Launch slicer with large file
3. Generate gcode
4. Verify no crashes or freezes

## Security Testing

### Test Role-Based Access

**As Student:**
- Login with student account
- ❌ Should NOT see "Approve" button
- ❌ Should NOT access operator features

**As Operator:**
- Login with operator account
- ✅ Can approve/reject jobs
- ✅ Can manage printers
- ✅ Can override queue

**As Admin:**
- Login with admin account
- ✅ Full access to all features
- ✅ Can manage users
- ✅ Can configure system settings

### Test Session Persistence

1. Login to desktop app
2. Close app
3. Reopen app
4. ✅ Should auto-login (token persisted)

### Test Token Expiration

1. Login to desktop app
2. Wait 7 days (or manually expire token)
3. Try to perform action
4. ✅ Should redirect to login with message "Session expired"

## Reporting Issues

When reporting a bug, include:

1. **Steps to reproduce** - Exact sequence of actions
2. **Expected behavior** - What should happen
3. **Actual behavior** - What actually happened
4. **Console output** - Any error messages (View → Toggle Developer Tools)
5. **Backend logs** - Check backend terminal
6. **Environment**:
   - OS version
   - Node.js version
   - Installed slicers
   - Backend version

## Next Steps

After basic testing, try:

1. **Real Workflow**: Set up with your actual printers
2. **Multi-User**: Test with students + operators
3. **Production Deploy**: Deploy backend to server, use desktop app from multiple machines
4. **Slicer Profiles**: Configure custom printer profiles in each slicer

## Documentation References

- `electron/README.md` - Desktop app documentation
- `FRONTEND_INTEGRATION_GUIDE.md` - Overall architecture
- `API_TESTING_GUIDE.md` - All API endpoints
- `DEPLOYMENT.md` - Production deployment
- `backend/README.md` - Backend setup

## Summary Checklist

- [ ] Backend running on port 3000
- [ ] Desktop app compiles and starts
- [ ] Can login with admin/admin123
- [ ] Jobs list displays
- [ ] Can approve/reject jobs
- [ ] At least one slicer detected
- [ ] Can launch slicer with STL file
- [ ] Printers list displays
- [ ] Queue optimizer works
- [ ] WebSocket real-time updates working
- [ ] Work hours configuration functional
- [ ] File upload/download working

**If all checked ✅ - System is working correctly!**

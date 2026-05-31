# Print Farm Orchestrator - Desktop App

Electron desktop application for print farm operators with integrated slicer support.

## Features

- **Job Management**: View all print jobs, approve/reject student submissions
- **Slicer Integration**: Launch 5 different slicers (Cura, PrusaSlicer, OrcaSlicer, Bambu Studio, Preform)
- **Printer Control**: Monitor and manage all printers in the farm
- **Queue Management**: Override and optimize print schedules
- **Real-time Updates**: WebSocket connection for live status updates

## Prerequisites

### Required
- Node.js 18+ and npm
- Backend API server running (see `../backend/README.md`)

### Optional (for slicer integration)
Install any of the following slicers on your system:

**FDM Slicers:**
- [Cura](https://ultimaker.com/software/ultimaker-cura) - Free, open source
- [PrusaSlicer](https://www.prusa3d.com/page/prusaslicer_424/) - Free, open source
- [OrcaSlicer](https://github.com/SoftFever/OrcaSlicer) - Free, open source
- [Bambu Studio](https://bambulab.com/en/download/studio) - Free, for Bambu printers

**Resin Slicers:**
- [Preform](https://formlabs.com/software/preform/) - Free, for Formlabs printers

The app will auto-detect installed slicers. You don't need all of them - install only what you use.

## Quick Start

### 1. Install Dependencies

```bash
cd electron
npm install
```

### 2. Start Backend API

In a separate terminal:

```bash
cd ../backend
npm install
npm run dev
# Backend runs on http://localhost:3000
```

### 3. Run Desktop App

```bash
# Development mode
npm run dev
```

The desktop app window will open. Login with operator/admin credentials.

## Default Login

- **Username**: `admin`
- **Password**: `admin123`
- **Role**: admin (has operator permissions)

⚠️ **Change this password in production!**

## Development

### Project Structure

```
electron/
├── package.json          # Dependencies and build config
├── tsconfig.json         # TypeScript configuration
├── README.md            # This file
└── src/
    ├── main.ts          # Main Electron process
    ├── preload.ts       # Preload script (IPC bridge)
    ├── api/
    │   └── client.ts    # Backend API client
    └── slicers/
        └── index.ts     # Slicer manager
```

### Build TypeScript

```bash
npm run build
# Compiles src/ to dist/
```

### Start App

```bash
npm start
# Runs the compiled app
```

## Slicer Integration

### Auto-Detection

The app automatically detects installed slicers in common locations:

**Windows:**
- `C:\Program Files\UltiMaker Cura\UltiMaker-Cura.exe`
- `C:\Program Files\Prusa3D\PrusaSlicer\prusa-slicer.exe`
- `C:\Program Files\OrcaSlicer\OrcaSlicer.exe`
- `C:\Program Files\Bambu Studio\bambu-studio.exe`
- `C:\Program Files\Formlabs\PreForm\PreForm.exe`

**macOS:**
- `/Applications/UltiMaker Cura.app`
- `/Applications/PrusaSlicer.app`
- `/Applications/OrcaSlicer.app`
- `/Applications/Bambu Studio.app`
- `/Applications/PreForm.app`

**Linux:**
- `/usr/bin/cura`
- `/usr/bin/prusa-slicer`
- `/usr/bin/orcaslicer`
- `/usr/bin/bambu-studio`
- `/usr/local/bin/preform`

### Launch Slicer GUI

From the app, click "Slice" on any job to:
1. Auto-detect compatible slicers (FDM vs Resin)
2. Launch slicer with the STL file loaded
3. Configure print settings manually in the slicer UI
4. Export gcode from the slicer
5. Gcode is auto-uploaded and job is marked as ready

### CLI Slicing (Advanced)

For automated slicing without GUI:

```typescript
const result = await window.electron.sliceFile({
  slicer: 'cura',
  filePath: '/path/to/model.stl',
  printerProfile: '/path/to/profile.ini',
  outputPath: '/path/to/output.gcode'
});
```

The slicer runs in the background and generates gcode automatically.

## Testing Workflow

### 1. Start Backend
```bash
cd ../backend && npm run dev
```

### 2. Start Desktop App
```bash
cd electron && npm run dev
```

### 3. Login
- Use admin credentials (admin/admin123)
- Desktop app connects to backend API

### 4. View Jobs
- See all pending student submissions
- Filter by status, deadline, printer type

### 5. Approve/Slice Job
- Click on a job to review details
- Click "Slice" to open slicer
- Configure settings in slicer
- Export gcode
- Job auto-approved and sent to queue

### 6. Monitor Printers
- View all printer statuses
- Mark printers online/offline
- See current prints

### 7. Manage Queue
- View optimized schedule
- Override queue assignments
- Re-optimize with new settings

## Building for Production

### Windows

```bash
npm run package:win
# Creates: release/Print Farm Orchestrator Setup.exe
```

### macOS

```bash
npm run package:mac
# Creates: release/Print Farm Orchestrator.dmg
```

### Linux

```bash
npm run package:linux
# Creates: release/Print Farm Orchestrator.AppImage
```

## Configuration

Create a `.env` file in the electron directory:

```bash
# Backend API URL
API_URL=http://localhost:3000/api

# WebSocket URL
WS_URL=http://localhost:3000
```

## Troubleshooting

### "Slicer not found"
- Make sure the slicer is installed
- Check if it's in the default installation path
- Manually set the path in settings (coming soon)

### "Cannot connect to backend"
- Verify backend is running on http://localhost:3000
- Check firewall settings
- Verify API_URL in .env

### "TypeScript errors"
```bash
npm run build
# Check for compilation errors
```

### "App won't start"
```bash
# Clear dist and rebuild
rm -rf dist
npm run build
npm start
```

## API Integration

The desktop app uses the same backend API as the web portal. See:
- `../API_TESTING_GUIDE.md` - All API endpoints
- `../backend/README.md` - Backend setup
- `src/api/client.ts` - Desktop API client implementation

## Architecture

```
┌──────────────────┐
│  Electron Main   │ ← Window management, IPC
│    Process       │
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
┌───▼──┐  ┌──▼────┐
│ Web  │  │Slicer │ ← Launch external apps
│ UI   │  │Manager│
└───┬──┘  └───────┘
    │
┌───▼──────┐
│ Backend  │ ← HTTP + WebSocket
│   API    │
└──────────┘
```

## Support

For issues or questions:
1. Check `FRONTEND_INTEGRATION_GUIDE.md`
2. Check `API_TESTING_GUIDE.md`
3. Check backend logs
4. Open an issue on GitHub

## License

MIT

import { app, BrowserWindow, ipcMain, dialog, type IpcMainInvokeEvent } from 'electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { SlicerManager } from './slicers';
import { ApiClient } from './api/client';

let mainWindow: BrowserWindow | null = null;
let slicerManager: SlicerManager | null = null;
let apiClient: ApiClient | null = null;

const isDev = process.argv.includes('--dev');
const defaultDevRendererUrls = [
  'http://localhost:8081/printhub/',
  'http://localhost:8080/printhub/',
];
const devRendererUrls = process.env.ELECTRON_RENDERER_URL
  ? [process.env.ELECTRON_RENDERER_URL]
  : defaultDevRendererUrls;

const getRendererIndexPath = () => {
  return path.resolve(__dirname, '../../dist/index.html');
};

const buildLoadErrorHtml = (message: string) => {
  return `
    <html>
      <body style="font-family: Segoe UI, Arial, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 24px;">
        <h2 style="margin-top: 0;">Renderer failed to load</h2>
        <p>${message}</p>
        <pre style="background: #111827; padding: 12px; border-radius: 8px; overflow: auto;">For development:
1) Start backend:   cd backend && npm run dev
2) Start web app:   npm run dev  (from repo root)
3) Start electron:  cd electron && npm run dev

Expected web URLs:
${devRendererUrls.map((url) => `- ${url}`).join('\n')}</pre>
      </body>
    </html>
  `;
};

async function loadRenderer(window: BrowserWindow) {
  if (isDev) {
    const errors: string[] = [];
    for (const rendererUrl of devRendererUrls) {
      try {
        await window.loadURL(rendererUrl);
        return;
      } catch (error: any) {
        errors.push(`${rendererUrl}: ${error?.message || 'Unable to load dev renderer URL'}`);
      }
    }
    await window.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(buildLoadErrorHtml(errors.join('\n')))}`);
    return;
  }

  const rendererIndexPath = getRendererIndexPath();
  try {
    await window.loadFile(rendererIndexPath);
  } catch (error: any) {
    await window.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(buildLoadErrorHtml(error?.message || 'Unable to load built renderer file'))}`);
  }
}

interface LaunchSlicerRequest {
  slicer: string;
  filePath: string;
  printerType: 'fdm' | 'resin';
}

interface SliceFileRequest {
  slicer: string;
  filePath: string;
  printerProfile?: string;
  outputPath: string;
}

interface SliceLocalFileRequest {
  slicer: string;
  stlName: string;
  stlBase64: string;
  printerProfile?: string;
  overrides?: {
    layerHeight?: number;
    infill?: number;
    printSpeed?: number;
    nozzleTemperature?: number;
    bedTemperature?: number;
    supportEnabled?: boolean;
  };
}

interface SelectFileRequest {
  filters?: Electron.FileFilter[];
}

interface ApiCallRequest {
  method: string;
  endpoint: string;
  data?: unknown;
  token?: string;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  loadRenderer(mainWindow);

  mainWindow.webContents.on('did-fail-load', async (_event, errorCode, errorDescription, validatedURL) => {
    const message = `URL: ${validatedURL}\nCode: ${errorCode}\nReason: ${errorDescription}`;
    await mainWindow?.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(buildLoadErrorHtml(message))}`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Initialize slicer manager
  slicerManager = new SlicerManager();
  
  // Initialize API client
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
  apiClient = new ApiClient(backendUrl);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers

// Launch slicer with STL file
ipcMain.handle('launch-slicer', async (_event: IpcMainInvokeEvent, { slicer, filePath, printerType }: LaunchSlicerRequest) => {
  if (!slicerManager) {
    throw new Error('Slicer manager not initialized');
  }

  try {
    const result = await slicerManager.launchSlicer(slicer, filePath, printerType);
    return { success: true, ...result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Slice file using CLI
ipcMain.handle('slice-file', async (_event: IpcMainInvokeEvent, { slicer, filePath, printerProfile, outputPath }: SliceFileRequest) => {
  if (!slicerManager) {
    throw new Error('Slicer manager not initialized');
  }

  try {
    const result = await slicerManager.sliceFile(slicer, filePath, printerProfile, outputPath);
    return { success: true, ...result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-available-slicers', async () => {
  if (!slicerManager) {
    throw new Error('Slicer manager not initialized');
  }

  return {
    success: true,
    slicers: slicerManager.getAvailableSlicers(),
  };
});

ipcMain.handle('slice-local-file', async (_event: IpcMainInvokeEvent, { slicer, stlName, stlBase64, printerProfile, overrides }: SliceLocalFileRequest) => {
  if (!slicerManager) {
    throw new Error('Slicer manager not initialized');
  }

  const safeName = path.basename(stlName || 'model.stl');
  const baseName = safeName.toLowerCase().endsWith('.stl')
    ? safeName.slice(0, -4)
    : safeName;

  const tempDir = path.join(os.tmpdir(), 'printhub-slices', `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const stlPath = path.join(tempDir, safeName);
  const outputPath = path.join(tempDir, `${baseName}_sliced.gcode`);

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(stlPath, Buffer.from(stlBase64, 'base64'));

    const result = await slicerManager.sliceFile(slicer, stlPath, printerProfile, outputPath, overrides);
    const gcodeContent = await fs.readFile(result.gcodeFile, 'utf-8');

    return {
      success: true,
      gcodeContent,
      gcodeFileName: path.basename(result.gcodeFile),
      gcodeFilePath: result.gcodeFile,
      estimatedPrintTimeSeconds: result.printTime,
      slicer,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Local slicing failed',
    };
  }
});

// Get slicer path
ipcMain.handle('get-slicer-path', async (_event: IpcMainInvokeEvent, slicerName: string) => {
  if (!slicerManager) {
    throw new Error('Slicer manager not initialized');
  }

  const path = slicerManager.getSlicerPath(slicerName);
  return { path, available: !!path };
});

// File selection dialog
ipcMain.handle('select-file', async (_event: IpcMainInvokeEvent, { filters = [] }: SelectFileRequest) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters,
  });

  if (result.canceled) {
    return { canceled: true };
  }

  return { canceled: false, filePath: result.filePaths[0] };
});

// API Calls
ipcMain.handle('api-call', async (_event: IpcMainInvokeEvent, { method, endpoint, data, token }: ApiCallRequest) => {
  if (!apiClient) {
    throw new Error('API client not initialized');
  }

  try {
    apiClient.setAuthToken(token ?? null);
    const response = await apiClient.request(method, endpoint, data);
    return { success: true, data: response };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.response?.data?.error || error.message 
    };
  }
});

console.log('Print Farm Orchestrator Desktop App started');

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  // Slicer operations
  launchSlicer: (params: { slicer: string; filePath: string; printerType: string }) =>
    ipcRenderer.invoke('launch-slicer', params),
  
  sliceFile: (params: { slicer: string; filePath: string; printerProfile: string; outputPath: string }) =>
    ipcRenderer.invoke('slice-file', params),

  sliceLocalFile: (params: {
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
  }) =>
    ipcRenderer.invoke('slice-local-file', params),

  getAvailableSlicers: () =>
    ipcRenderer.invoke('get-available-slicers'),
  
  getSlicerPath: (slicerName: string) =>
    ipcRenderer.invoke('get-slicer-path', slicerName),

  // File operations
  selectFile: (params: { filters?: any[] }) =>
    ipcRenderer.invoke('select-file', params),

  // API calls
  apiCall: (params: { method: string; endpoint: string; data?: any; token?: string }) =>
    ipcRenderer.invoke('api-call', params),
});

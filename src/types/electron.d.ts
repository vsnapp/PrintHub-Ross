export interface ElectronSlicerConfig {
  name: string;
  type: 'fdm' | 'resin';
  executablePath?: string;
  cliCommand?: string;
}

export interface LocalSliceResult {
  success: true;
  gcodeContent: string;
  gcodeFileName: string;
  gcodeFilePath: string;
  estimatedPrintTimeSeconds: number;
  slicer: string;
}

export interface LocalSliceError {
  success: false;
  error: string;
}

export interface AvailableSlicersResult {
  success: true;
  slicers: ElectronSlicerConfig[];
}

export interface SliceJobOverrides {
  layerHeight?: number;
  infill?: number;
  printSpeed?: number;
  nozzleTemperature?: number;
  bedTemperature?: number;
  supportEnabled?: boolean;
}

interface ElectronBridge {
  launchSlicer: (params: { slicer: string; filePath: string; printerType: string }) => Promise<any>;
  sliceFile: (params: { slicer: string; filePath: string; printerProfile: string; outputPath: string }) => Promise<any>;
  sliceLocalFile: (params: { slicer: string; stlName: string; stlBase64: string; printerProfile?: string; overrides?: SliceJobOverrides }) => Promise<LocalSliceResult | LocalSliceError>;
  getAvailableSlicers: () => Promise<AvailableSlicersResult>;
  getSlicerPath: (slicerName: string) => Promise<{ path: string | null; available: boolean }>;
  selectFile: (params: { filters?: any[] }) => Promise<any>;
  apiCall: (params: { method: string; endpoint: string; data?: any; token?: string }) => Promise<any>;
}

declare global {
  interface Window {
    electron?: ElectronBridge;
  }
}

export {};

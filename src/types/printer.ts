export type PrinterType = 'fdm' | 'resin';

export type PrinterStatus = 'online' | 'printing' | 'paused' | 'error' | 'offline';

export interface PrintJob {
  id: string;
  name: string;
  progress: number;
  timeRemaining: number;
  filament: string;
  filamentUsed: number; // in grams
}

export interface FilamentSpool {
  id: string;
  type: string; // PLA, ABS, PETG, etc.
  color: string;
  brand: string;
  totalCapacity: number; // in grams
  used: number; // in grams
  remaining: number; // in grams
}

export interface FilamentInventoryItem {
  id: string;
  type: string; // PLA, ABS, PETG, etc.
  brand: string;
  color: string;
  diameter: number; // 1.75mm, 3mm, etc.
  totalCapacity: number; // in grams
  used: number; // in grams
  remaining: number; // in grams
  status: 'new' | 'partially-used' | 'empty';
  purchaseDate?: string;
  cost?: number;
  location?: string;
}

export interface CommonSlicingSettings {
  supportEnabled: boolean;
  nozzleTemperature: number;
  bedTemperature: number;
  layerHeight: number;
  infill: number;
  wallNumber: number;
}

/**
 * Default slicing settings stored per printer (backend printers.slicer_settings).
 * Used as the base configuration when slicing for this printer; per-slice
 * overrides take precedence.
 */
export interface SlicerDefaultSettings {
  layerHeight?: number;
  infill?: number;
  printSpeed?: number;
  nozzleTemperature?: number;
  bedTemperature?: number;
  supportEnabled?: boolean;
  nozzleSize?: number;
  customSettings?: string;
}

export interface PrinterSlicingSettings {
  layerHeight: number | 'default';
  infill: number | 'default';
  printSpeed: number | 'default';
  nozzleTemperature: number | 'default';
  bedTemperature: number | 'default';
  supportEnabled: boolean | 'default';
  nozzleSize: number | 'default';
  supportOverhangAngle: number | 'default';
  customSettings: string;
}

export interface QueueItem {
  id: string;
  filename: string;
  target: string;
  type: 'printer' | 'group';
  status: 'ready' | 'printing' | 'completed' | 'failed';
}

export interface Printer {
  id: string;
  name: string;
  status: PrinterStatus;
  type: PrinterType; // FDM or Resin
  temperature: {
    nozzle: number;
    bed: number;
  };
  currentJob?: PrintJob;
  groupIds: string[]; // Changed from groupId to support multiple groups
  model: string;
  connectionType?: 'wifi' | 'usb';
  integrationType?: 'octoprint' | 'moonraker' | 'serial' | 'bambu' | 'formlabs';
  connectionDetails?: {
    protocol?: 'http' | 'https';
    host?: string;
    port?: number;
    path?: string;
    apiKey?: string;
    accessToken?: string;
    accessCode?: string;
    deviceId?: string;
    serialPath?: string;
    baudRate?: number;
    mqttPort?: number;
    mqttUsername?: string;
    mqttPassword?: string;
    mqttClientId?: string;
    mqttTopicPrefix?: string;
    mqttCommandTopic?: string;
    mqttReportTopic?: string;
    mqttRejectUnauthorized?: boolean;
    uploadPort?: number;
    uploadPath?: string;
    rtspPort?: number;
    rtspPath?: string;
    commands?: {
      home?: string;
      preheat?: string;
      cooldown?: string;
    };
    firmwareCode?: string;
    macros?: Array<{
      name: string;
      gcode: string;
    }>;
  };
  ipAddress: string;
  webcamUrl?: string;
  filamentSpool?: FilamentSpool;
  notes?: string;
  firmware?: string;
  gcodeData?: string; // For tracking active gcode
  slicingSettings?: PrinterSlicingSettings;
  slicerDefaults?: SlicerDefaultSettings;
  slicer: 'cura' | 'orca' | 'prusa' | 'bambu' | 'preform'; // Supported slicers (preform for resin)
  speedMultiplier?: number; // Print speed relative to baseline (1.0 = normal, 1.2 = 20% faster, 0.8 = 20% slower)
  maxPrintSpeed?: number; // Maximum print speed in mm/s
  buildVolume?: {
    x: number;
    y: number;
    z: number;
  }; // Build volume in mm
}

export interface PrinterGroup {
  id: string;
  name: string;
  printerIds: string[];
  color: string;
  icon?: string; // For custom folder icons
}

export type BatchCommand = 'pause' | 'resume' | 'stop' | 'home' | 'preheat' | 'cooldown';
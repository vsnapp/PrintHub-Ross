export type PrinterIntegrationType = 'octoprint' | 'moonraker' | 'serial' | 'bambu' | 'formlabs';

export type PrinterStatus = 'online' | 'printing' | 'paused' | 'error' | 'offline';

export interface ConnectionDetails {
  protocol?: 'http' | 'https';
  host?: string;
  port?: number;
  path?: string;
  apiKey?: string;
  accessToken?: string;
  accessCode?: string;
  deviceId?: string;
  username?: string;
  password?: string;
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
}

export interface PrinterStatusInfo {
  status: PrinterStatus;
  progress?: number;
  filename?: string;
  raw?: any;
}

export interface UploadResult {
  remoteFile: string;
}

export interface TerminalEntry {
  line: string;
  timestamp?: string;
}

export interface PrinterAdapter {
  connect(): Promise<void>;
  getStatus(): Promise<PrinterStatusInfo>;
  getTerminal(): Promise<TerminalEntry[]>;
  uploadFile(filePath: string, remoteName: string): Promise<UploadResult>;
  startPrint(remoteFile: string): Promise<void>;
  pausePrint(): Promise<void>;
  resumePrint(): Promise<void>;
  cancelPrint(): Promise<void>;
  sendGcode(gcode: string | string[]): Promise<void>;
}

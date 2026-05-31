import path from 'path';
import mqtt, { MqttClient } from 'mqtt';
import { Client as FtpClient } from 'basic-ftp';
import { ConnectionDetails, PrinterAdapter, PrinterStatusInfo, TerminalEntry, UploadResult } from './types';

// Community-standard Bambu LAN defaults; override via connection_details when needed.
const DEFAULT_MQTT_PORT = 8883;
const DEFAULT_MQTT_USERNAME = 'bblp';
const DEFAULT_UPLOAD_PORT = 990;
const DEFAULT_UPLOAD_PATH = '/sdcard';

export class BambuAdapter implements PrinterAdapter {
  private details: ConnectionDetails;
  private client?: MqttClient;
  private connectPromise?: Promise<MqttClient>;
  private subscribed = false;
  private connected = false;
  private lastReport?: any;
  private lastReportAt?: number;
  private terminal: TerminalEntry[] = [];

  constructor(details: ConnectionDetails) {
    this.details = details;
  }

  async connect(): Promise<void> {
    const client = await this.ensureClient();
    await this.ensureSubscribed(client);
  }

  async getStatus(): Promise<PrinterStatusInfo> {
    const report = await this.waitForReport();
    const print = report?.print || report?.status?.print || {};
    const stateRaw = String(print?.gcode_state || print?.state || report?.gcode_state || '').toLowerCase();

    let status: PrinterStatusInfo['status'] = 'offline';
    if (stateRaw.includes('print')) {
      status = 'printing';
    } else if (stateRaw.includes('pause')) {
      status = 'paused';
    } else if (stateRaw.includes('error') || stateRaw.includes('fail') || stateRaw.includes('abort')) {
      status = 'error';
    } else if (stateRaw) {
      status = 'online';
    }

    let progress: number | undefined;
    const percent = typeof print?.mc_percent === 'number'
      ? print.mc_percent
      : (typeof print?.progress === 'number' ? print.progress : undefined);
    if (typeof percent === 'number') {
      progress = percent <= 1 ? percent * 100 : percent;
    }

    const filename = print?.gcode_file || print?.gcode_file_name || print?.file || undefined;

    return {
      status,
      progress,
      filename,
      raw: report,
    };
  }

  async getTerminal(): Promise<TerminalEntry[]> {
    try {
      await this.connect();
      await this.waitForReport();
    } catch (error: any) {
      const message = error?.message || 'Failed to fetch Bambu status report.';
      this.pushTerminal(`Bambu LAN: ${message}`);
    }
    return this.terminal;
  }

  async uploadFile(filePath: string, remoteName: string): Promise<UploadResult> {
    const host = this.requireHost();
    const accessCode = this.requireAccessCode();
    const uploadPort = this.details.uploadPort ?? DEFAULT_UPLOAD_PORT;
    const uploadPath = this.details.uploadPath || DEFAULT_UPLOAD_PATH;
    const username = this.details.username || DEFAULT_MQTT_USERNAME;

    const remotePath = path.posix.join(uploadPath, remoteName);
    const client = new FtpClient();
    try {
      await client.access({
        host,
        port: uploadPort,
        user: username,
        password: accessCode,
        secure: true,
        secureOptions: {
          rejectUnauthorized: this.details.mqttRejectUnauthorized ?? false,
        },
      });
      await client.ensureDir(uploadPath);
      await client.uploadFrom(filePath, remotePath);
    } finally {
      client.close();
    }

    return { remoteFile: remotePath };
  }

  async startPrint(remoteFile: string): Promise<void> {
    await this.publishCommand({
      print: {
        command: 'start',
        param: remoteFile,
      },
    });
  }

  async pausePrint(): Promise<void> {
    await this.publishCommand({ print: { command: 'pause' } });
  }

  async resumePrint(): Promise<void> {
    await this.publishCommand({ print: { command: 'resume' } });
  }

  async cancelPrint(): Promise<void> {
    await this.publishCommand({ print: { command: 'stop' } });
  }

  async sendGcode(_gcode: string | string[]): Promise<void> {
    throw new Error('Bambu LAN API does not support raw G-code commands.');
  }

  private async ensureClient(): Promise<MqttClient> {
    if (this.client && this.connected) {
      return this.client;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    const host = this.requireHost();
    const accessCode = this.requireAccessCode();
    const deviceId = this.requireDeviceId();
    const port = this.details.mqttPort ?? this.details.port ?? DEFAULT_MQTT_PORT;
    const username = this.details.mqttUsername || this.details.username || DEFAULT_MQTT_USERNAME;
    const password = this.details.mqttPassword || this.details.password || accessCode;
    const clientId = this.details.mqttClientId || `bblp-${deviceId}-${Date.now()}`;
    const rejectUnauthorized = this.details.mqttRejectUnauthorized ?? false;

    this.connectPromise = new Promise((resolve, reject) => {
      const url = `mqtts://${host}:${port}`;
      const client = mqtt.connect(url, {
        username,
        password,
        clientId,
        rejectUnauthorized,
      });

      let settled = false;
      client.on('connect', () => {
        this.client = client;
        this.connected = true;
        this.setupListeners(client);
        settled = true;
        resolve(client);
      });

      client.on('error', (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      });

      client.on('close', () => {
        this.connected = false;
      });
    });

    return this.connectPromise;
  }

  private setupListeners(client: MqttClient) {
    const reportTopic = this.getReportTopic();
    client.on('message', (topic, payload) => {
      if (topic !== reportTopic) {
        return;
      }
      this.captureReport(payload);
    });
  }

  private async ensureSubscribed(client: MqttClient) {
    if (this.subscribed) {
      return;
    }
    const reportTopic = this.getReportTopic();
    await new Promise<void>((resolve, reject) => {
      client.subscribe(reportTopic, { qos: 0 }, (error) => {
        if (error) {
          reject(error);
          return;
        }
        this.subscribed = true;
        resolve();
      });
    });
  }

  private async publishCommand(payload: Record<string, any>) {
    const client = await this.ensureClient();
    const commandTopic = this.getCommandTopic();
    await this.ensureSubscribed(client);
    await new Promise<void>((resolve, reject) => {
      client.publish(commandTopic, JSON.stringify(payload), { qos: 0 }, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private async waitForReport(): Promise<any> {
    const client = await this.ensureClient();
    await this.ensureSubscribed(client);

    if (this.lastReport && this.lastReportAt && Date.now() - this.lastReportAt < 3000) {
      return this.lastReport;
    }

    return new Promise((resolve, reject) => {
      const reportTopic = this.getReportTopic();
      const timeout = setTimeout(() => {
        cleanup();
        if (this.lastReport) {
          resolve(this.lastReport);
          return;
        }
        reject(new Error('Timed out waiting for Bambu status report'));
      }, 4000);

      const handler = (topic: string, payload: Buffer) => {
        if (topic !== reportTopic) {
          return;
        }
        const report = this.captureReport(payload);
        cleanup();
        resolve(report);
      };

      const cleanup = () => {
        clearTimeout(timeout);
        client.off('message', handler);
      };

      client.on('message', handler);
    });
  }

  private captureReport(payload: Buffer) {
    const text = payload.toString('utf-8');
    try {
      const report = JSON.parse(text);
      this.lastReport = report;
      this.lastReportAt = Date.now();
      this.pushTerminal(text);
      return report;
    } catch (error) {
      this.pushTerminal(text);
      return this.lastReport || { raw: text };
    }
  }

  private pushTerminal(line: string) {
    this.terminal.push({
      line,
      timestamp: new Date().toISOString(),
    });
    if (this.terminal.length > 200) {
      this.terminal.shift();
    }
  }

  private getCommandTopic(): string {
    if (this.details.mqttCommandTopic) {
      return this.details.mqttCommandTopic;
    }
    return `${this.getTopicPrefix()}/request`;
  }

  private getReportTopic(): string {
    if (this.details.mqttReportTopic) {
      return this.details.mqttReportTopic;
    }
    return `${this.getTopicPrefix()}/report`;
  }

  private getTopicPrefix(): string {
    if (this.details.mqttTopicPrefix) {
      return this.details.mqttTopicPrefix;
    }
    const deviceId = this.requireDeviceId();
    return `device/${deviceId}`;
  }

  private requireHost(): string {
    if (!this.details.host) {
      throw new Error('Bambu integration requires host/IP address.');
    }
    return this.details.host;
  }

  private requireDeviceId(): string {
    if (!this.details.deviceId) {
      throw new Error('Bambu integration requires deviceId in connection_details.');
    }
    return this.details.deviceId;
  }

  private requireAccessCode(): string {
    const accessCode = this.details.accessCode || this.details.password || this.details.accessToken;
    if (!accessCode) {
      throw new Error('Bambu integration requires accessCode in connection_details.');
    }
    return accessCode;
  }
}

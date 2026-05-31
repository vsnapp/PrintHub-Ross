import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { ConnectionDetails, PrinterAdapter, PrinterStatusInfo, TerminalEntry, UploadResult } from './types';

export class OctoPrintAdapter implements PrinterAdapter {
  private baseUrl: string;
  private apiKey: string;

  constructor(details: ConnectionDetails) {
    const protocol = details.protocol || 'http';
    const host = details.host || 'localhost';
    const port = details.port ? `:${details.port}` : '';
    const basePath = details.path ? `/${details.path.replace(/^\/+/, '')}` : '';

    this.baseUrl = `${protocol}://${host}${port}${basePath}`;
    this.apiKey = details.apiKey || '';
  }

  async connect(): Promise<void> {
    await this.request('/api/version');
  }

  async getStatus(): Promise<PrinterStatusInfo> {
    const [printer, job] = await Promise.all([
      this.request('/api/printer'),
      this.request('/api/job'),
    ]);

    const state = (job?.state || printer?.state?.text || '').toLowerCase();
    let status: PrinterStatusInfo['status'] = 'offline';

    if (state.includes('printing')) {
      status = 'printing';
    } else if (state.includes('paused')) {
      status = 'paused';
    } else if (state.includes('error') || state.includes('offline')) {
      status = 'error';
    } else if (state) {
      status = 'online';
    }

    return {
      status,
      progress: job?.progress?.completion ?? undefined,
      filename: job?.job?.file?.name ?? undefined,
      raw: { printer, job },
    };
  }

  async uploadFile(filePath: string, remoteName: string): Promise<UploadResult> {
    const form = new FormData();
    const stream = fs.createReadStream(filePath);
    form.append('file', stream, {
      filename: remoteName,
      contentType: 'application/octet-stream',
    });
    form.append('path', '');

    await this.request('/api/files/local', {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });

    return { remoteFile: remoteName };
  }

  async getTerminal(): Promise<TerminalEntry[]> {
    const response = await this.request('/api/logs?limit=100');
    if (Array.isArray(response?.serial)) {
      return response.serial.map((line: string) => ({ line }));
    }
    if (Array.isArray(response?.logs)) {
      return response.logs.map((entry: any) => {
        if (typeof entry === 'string') {
          return { line: entry };
        }
        return {
          line: entry?.message || entry?.text || JSON.stringify(entry),
          timestamp: entry?.time || entry?.timestamp,
        };
      });
    }
    return [];
  }

  async startPrint(remoteFile: string): Promise<void> {
    const encoded = encodeURIComponent(remoteFile);
    await this.request(`/api/files/local/${encoded}`, {
      method: 'POST',
      body: JSON.stringify({ command: 'select', print: true }),
    });
  }

  async pausePrint(): Promise<void> {
    await this.request('/api/job', {
      method: 'POST',
      body: JSON.stringify({ command: 'pause', action: 'pause' }),
    });
  }

  async resumePrint(): Promise<void> {
    await this.request('/api/job', {
      method: 'POST',
      body: JSON.stringify({ command: 'pause', action: 'resume' }),
    });
  }

  async cancelPrint(): Promise<void> {
    await this.request('/api/job', {
      method: 'POST',
      body: JSON.stringify({ command: 'cancel' }),
    });
  }

  async sendGcode(gcode: string | string[]): Promise<void> {
    const commands = Array.isArray(gcode)
      ? gcode
      : gcode
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);

    if (commands.length === 0) {
      return;
    }

    await this.request('/api/printer/command', {
      method: 'POST',
      body: JSON.stringify({ commands }),
    });
  }

  private async request(endpoint: string, options: any = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      ...options.headers,
      'X-Api-Key': this.apiKey,
    };

    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OctoPrint request failed (${response.status}): ${body}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }

    return response.text();
  }
}

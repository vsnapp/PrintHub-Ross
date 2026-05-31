import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import { ConnectionDetails, PrinterAdapter, PrinterStatusInfo, TerminalEntry, UploadResult } from './types';

export class MoonrakerAdapter implements PrinterAdapter {
  private baseUrl: string;
  private accessToken?: string;

  constructor(details: ConnectionDetails) {
    const protocol = details.protocol || 'http';
    const host = details.host || 'localhost';
    const port = details.port ? `:${details.port}` : '';
    const basePath = details.path ? `/${details.path.replace(/^\/+/, '')}` : '';

    this.baseUrl = `${protocol}://${host}${port}${basePath}`;
    this.accessToken = details.accessToken || details.apiKey;
  }

  async connect(): Promise<void> {
    await this.request('/server/info');
  }

  async getStatus(): Promise<PrinterStatusInfo> {
    const data = await this.request('/printer/objects/query?print_stats&display_status');
    const printStats = data?.result?.status?.print_stats || {};
    const state = String(printStats.state || '').toLowerCase();

    let status: PrinterStatusInfo['status'] = 'offline';
    if (state === 'printing') {
      status = 'printing';
    } else if (state === 'paused') {
      status = 'paused';
    } else if (state === 'error' || state === 'cancelled') {
      status = 'error';
    } else if (state) {
      status = 'online';
    }

    return {
      status,
      progress: printStats?.progress ? printStats.progress * 100 : undefined,
      filename: printStats?.filename || undefined,
      raw: data,
    };
  }

  async uploadFile(filePath: string, remoteName: string): Promise<UploadResult> {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), {
      filename: remoteName,
      contentType: 'application/octet-stream',
    });
    form.append('path', 'gcodes');

    await this.request('/server/files/upload', {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });

    return { remoteFile: remoteName };
  }

  async getTerminal(): Promise<TerminalEntry[]> {
    const data = await this.request('/server/console?lines=100');
    const result = data?.result || {};

    if (Array.isArray(result?.output)) {
      return result.output.map((entry: any) => {
        if (typeof entry === 'string') {
          return { line: entry };
        }
        return {
          line: entry?.message || entry?.content || JSON.stringify(entry),
          timestamp: entry?.time || entry?.timestamp,
        };
      });
    }

    if (Array.isArray(result?.rows)) {
      return result.rows.map((row: any) => ({
        line: row?.message || row?.content || String(row),
        timestamp: row?.time || row?.timestamp,
      }));
    }

    if (typeof result?.output === 'string') {
      return result.output
        .split('\n')
        .filter((line: string) => line.trim().length > 0)
        .map((line: string) => ({ line }));
    }

    return [];
  }

  async startPrint(remoteFile: string): Promise<void> {
    await this.request('/printer/print/start', {
      method: 'POST',
      body: JSON.stringify({ filename: remoteFile }),
    });
  }

  async pausePrint(): Promise<void> {
    await this.request('/printer/print/pause', { method: 'POST' });
  }

  async resumePrint(): Promise<void> {
    await this.request('/printer/print/resume', { method: 'POST' });
  }

  async cancelPrint(): Promise<void> {
    await this.request('/printer/print/cancel', { method: 'POST' });
  }

  async sendGcode(gcode: string | string[]): Promise<void> {
    const script = Array.isArray(gcode)
      ? gcode.join('\n')
      : gcode;

    if (!script.trim()) {
      return;
    }

    await this.request('/printer/gcode/script', {
      method: 'POST',
      body: JSON.stringify({ script }),
    });
  }

  private async request(endpoint: string, options: any = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      ...options.headers,
    };

    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Moonraker request failed (${response.status}): ${body}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }

    return response.text();
  }
}

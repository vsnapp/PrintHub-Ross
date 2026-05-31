import fs from 'fs';
import readline from 'readline';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { ConnectionDetails, PrinterAdapter, PrinterStatusInfo, TerminalEntry, UploadResult } from './types';

export class SerialAdapter implements PrinterAdapter {
  private portPath: string;
  private baudRate: number;
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private static terminalBuffers = new Map<string, TerminalEntry[]>();

  private pushTerminalLine(line: string) {
    const buffer = SerialAdapter.terminalBuffers.get(this.portPath) || [];
    buffer.push({ line, timestamp: new Date().toISOString() });
    SerialAdapter.terminalBuffers.set(this.portPath, buffer.slice(0, 200));
  }

  constructor(details: ConnectionDetails) {
    if (!details.serialPath) {
      throw new Error('serialPath is required for serial printers');
    }

    this.portPath = details.serialPath;
    const rawBaudRate = details.baudRate;
    const parsedBaudRate = typeof rawBaudRate === 'string' ? Number(rawBaudRate) : rawBaudRate;
    if (parsedBaudRate !== undefined && Number.isNaN(parsedBaudRate)) {
      throw new Error(`baudRate must be a number: ${rawBaudRate}`);
    }
    this.baudRate = parsedBaudRate || 115200;
  }

  async connect(): Promise<void> {
    if (this.port?.isOpen) {
      return;
    }

    this.port = new SerialPort({ path: this.portPath, baudRate: this.baudRate, autoOpen: false });
    this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

    this.parser.on('data', (data: string) => {
      const line = data.trim();
      if (!line) {
        return;
      }
      const buffer = SerialAdapter.terminalBuffers.get(this.portPath) || [];
      buffer.push({ line, timestamp: new Date().toISOString() });
      SerialAdapter.terminalBuffers.set(this.portPath, buffer.slice(-200));
    });

    await new Promise<void>((resolve, reject) => {
      this.port?.open((error) => {
        if (error) {
          const message = `Serial open failed (${this.portPath} @ ${this.baudRate}): ${error.message}`;
          this.pushTerminalLine(message);
          reject(error);
          return;
        }
        this.pushTerminalLine(`Serial connected (${this.portPath} @ ${this.baudRate})`);
        resolve();
      });
    });
  }

  async getStatus(): Promise<PrinterStatusInfo> {
    await this.connect();
    const response = await this.sendAndWait('M105');

    if (!response) {
      return { status: 'offline' };
    }

    return { status: 'online', raw: response };
  }

  async getTerminal(): Promise<TerminalEntry[]> {
    return SerialAdapter.terminalBuffers.get(this.portPath) || [];
  }

  async uploadFile(filePath: string): Promise<UploadResult> {
    return { remoteFile: filePath };
  }

  async startPrint(remoteFile: string): Promise<void> {
    await this.connect();

    if (!fs.existsSync(remoteFile)) {
      throw new Error('Gcode file not found for serial print');
    }

    const fileStream = fs.createReadStream(remoteFile);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';')) {
        continue;
      }

      await this.sendAndWait(trimmed);
    }
  }

  async pausePrint(): Promise<void> {
    await this.sendGcode('M25');
  }

  async resumePrint(): Promise<void> {
    await this.sendGcode('M24');
  }

  async cancelPrint(): Promise<void> {
    await this.sendGcode('M0');
  }

  async sendGcode(gcode: string | string[]): Promise<void> {
    await this.connect();
    const commands = Array.isArray(gcode)
      ? gcode
      : gcode
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);

    for (const command of commands) {
      await this.sendAndWait(command);
    }
  }

  private async sendAndWait(command: string): Promise<string> {
    if (!this.port || !this.parser) {
      const message = 'Serial port not connected';
      this.pushTerminalLine(message);
      throw new Error(message);
    }

    const parser = this.parser;
    const port = this.port;

    return await new Promise<string>((resolve, reject) => {
      let resolved = false;
      const timeoutMs = 60000;
      const timeout = setTimeout(() => {
        if (!resolved) {
          parser.removeListener('data', onData);
          const message = `Serial command timeout: ${command}`;
          this.pushTerminalLine(message);
          reject(new Error(message));
        }
      }, timeoutMs);

      const onData = (data: string) => {
        if (data.toLowerCase().startsWith('ok')) {
          resolved = true;
          clearTimeout(timeout);
          parser.removeListener('data', onData);
          resolve(data);
        }
      };

      parser.on('data', onData);
      port.write(`${command}\n`, (error) => {
        if (error) {
          clearTimeout(timeout);
          parser.removeListener('data', onData);
          this.pushTerminalLine(`Serial write error: ${error.message}`);
          reject(error);
        }
      });
    });
  }
}

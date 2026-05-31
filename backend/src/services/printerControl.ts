import path from 'path';
import { db } from '../database';
import { buildAdapter } from './printerAdapters';
import { ConnectionDetails, PrinterIntegrationType, PrinterStatusInfo, TerminalEntry } from './printerAdapters/types';

interface PrinterRecord {
  id: string;
  name: string;
  ip_address?: string;
  type?: string;
  integration_type?: PrinterIntegrationType | null;
  connection_details?: string | null;
}

interface FileRecord {
  id: number;
  original_name: string;
  stored_name: string;
  file_path: string;
  file_type: string;
}

function parseConnectionDetails(details?: string | null): ConnectionDetails {
  if (!details) {
    return {};
  }

  try {
    return JSON.parse(details) as ConnectionDetails;
  } catch (error) {
    return {};
  }
}

function getIntegrationType(printer: PrinterRecord): PrinterIntegrationType {
  if (!printer.integration_type) {
    throw new Error('Printer integration_type is not configured');
  }

  return printer.integration_type;
}

function getAdapterForPrinter(printer: PrinterRecord) {
  const details = parseConnectionDetails(printer.connection_details);
  if (!details.host && printer.ip_address) {
    details.host = printer.ip_address;
  }

  return buildAdapter(getIntegrationType(printer), details);
}

function getCommandForPrinter(printer: PrinterRecord, command: 'home' | 'preheat' | 'cooldown'): string | undefined {
  const details = parseConnectionDetails(printer.connection_details);
  const fromDetails = details.commands?.[command];
  if (fromDetails) {
    return fromDetails;
  }

  if (printer.type === 'fdm') {
    if (command === 'home') {
      return 'G28';
    }
    if (command === 'preheat') {
      return 'M104 S200\nM140 S60';
    }
    if (command === 'cooldown') {
      return 'M104 S0\nM140 S0';
    }
  }

  return undefined;
}

function getFileRecord(fileId: number): FileRecord {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as FileRecord | undefined;
  if (!file) {
    throw new Error('File not found');
  }

  return file;
}

function ensureGcodeFile(file: FileRecord) {
  const ext = path.extname(file.original_name).toLowerCase();
  const allowed = ['.gcode', '.gco', '.g'];
  if (!allowed.includes(ext)) {
    throw new Error('Only gcode files can be sent to printers');
  }
}

export async function getPrinterStatus(printerId: string): Promise<PrinterStatusInfo> {
  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(printerId) as PrinterRecord | undefined;
  if (!printer) {
    throw new Error('Printer not found');
  }

  const adapter = getAdapterForPrinter(printer);
  const status = await adapter.getStatus();

  db.prepare('UPDATE printers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(status.status, printerId);

  return status;
}

export async function getPrinterTerminal(printerId: string): Promise<TerminalEntry[]> {
  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(printerId) as PrinterRecord | undefined;
  if (!printer) {
    throw new Error('Printer not found');
  }

  const adapter = getAdapterForPrinter(printer);
  return await adapter.getTerminal();
}

export async function startPrint(printerId: string, fileId?: number, jobId?: number) {
  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(printerId) as PrinterRecord | undefined;
  if (!printer) {
    throw new Error('Printer not found');
  }

  let resolvedFileId = fileId;
  if (!resolvedFileId && jobId) {
    const job = db.prepare('SELECT file_id FROM print_jobs WHERE id = ?').get(jobId) as { file_id?: number } | undefined;
    if (!job || !job.file_id) {
      throw new Error('Job does not have an associated file');
    }
    resolvedFileId = job.file_id;
  }

  if (!resolvedFileId) {
    throw new Error('file_id or job_id is required');
  }

  const file = getFileRecord(resolvedFileId);
  ensureGcodeFile(file);

  const adapter = getAdapterForPrinter(printer);
  await adapter.connect();

  const remoteName = file.stored_name || file.original_name;
  const uploadResult = await adapter.uploadFile(file.file_path, remoteName);
  await adapter.startPrint(uploadResult.remoteFile);

  db.prepare('UPDATE printers SET status = ?, current_job_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run('printing', jobId || null, printerId);

  if (jobId) {
    db.prepare('UPDATE print_jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('printing', jobId);
  }

  return { printerId, remoteFile: uploadResult.remoteFile, fileId: resolvedFileId };
}

export async function pausePrint(printerId: string) {
  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(printerId) as PrinterRecord | undefined;
  if (!printer) {
    throw new Error('Printer not found');
  }

  const adapter = getAdapterForPrinter(printer);
  await adapter.pausePrint();

  db.prepare('UPDATE printers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run('paused', printerId);
}

export async function resumePrint(printerId: string) {
  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(printerId) as PrinterRecord | undefined;
  if (!printer) {
    throw new Error('Printer not found');
  }

  const adapter = getAdapterForPrinter(printer);
  await adapter.resumePrint();

  db.prepare('UPDATE printers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run('printing', printerId);
}

export async function cancelPrint(printerId: string) {
  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(printerId) as PrinterRecord | undefined;
  if (!printer) {
    throw new Error('Printer not found');
  }

  const adapter = getAdapterForPrinter(printer);
  await adapter.cancelPrint();

  db.prepare('UPDATE printers SET status = ?, current_job_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run('online', printerId);
}

export async function sendPrinterCommand(printerId: string, command: 'home' | 'preheat' | 'cooldown') {
  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(printerId) as PrinterRecord | undefined;
  if (!printer) {
    throw new Error('Printer not found');
  }

  const gcode = getCommandForPrinter(printer, command);
  if (!gcode) {
    throw new Error('Command is not configured for this printer');
  }

  const adapter = getAdapterForPrinter(printer);
  await adapter.sendGcode(gcode);
}

export async function sendRawGcode(printerId: string, gcode: string) {
  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(printerId) as PrinterRecord | undefined;
  if (!printer) {
    throw new Error('Printer not found');
  }

  const adapter = getAdapterForPrinter(printer);
  await adapter.sendGcode(gcode);
}

import { ConnectionDetails, PrinterAdapter, PrinterIntegrationType } from './types';
import { OctoPrintAdapter } from './octoprint';
import { MoonrakerAdapter } from './moonraker';
import { SerialAdapter } from './serial';
import { BambuAdapter } from './bambu';

const adapterCache = new Map<string, PrinterAdapter>();

function buildSerialKey(details: ConnectionDetails): string {
  const port = details.serialPath || 'unknown';
  const baud = details.baudRate || 115200;
  return `serial:${port}:${baud}`;
}

export function buildAdapter(integrationType: PrinterIntegrationType, details: ConnectionDetails): PrinterAdapter {
  switch (integrationType) {
    case 'octoprint':
      return new OctoPrintAdapter(details);
    case 'moonraker':
      return new MoonrakerAdapter(details);
    case 'serial':
      {
        const key = buildSerialKey(details);
        const cached = adapterCache.get(key);
        if (cached) {
          return cached;
        }
        const adapter = new SerialAdapter(details);
        adapterCache.set(key, adapter);
        return adapter;
      }
    case 'bambu':
      return new BambuAdapter(details);
    default:
      throw new Error(`Unsupported printer integration: ${integrationType}`);
  }
}

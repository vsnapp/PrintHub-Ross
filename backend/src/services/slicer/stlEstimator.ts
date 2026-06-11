import fs from 'fs';

/**
 * Geometry-based print estimation, used to give students an immediate
 * "when will my print be done" answer before an operator runs a real slice.
 * A real slice (CLI slicer) always replaces this estimate when available.
 */

export interface StlStats {
  triangleCount: number;
  volumeCm3: number;
  surfaceAreaCm2: number;
  boundingBox: { x: number; y: number; z: number }; // mm
}

export interface EstimateSettings {
  layerHeight?: number; // mm
  infill?: number; // percent 0-100
  printSpeed?: number; // mm/s
  wallCount?: number;
}

export interface PrintEstimate {
  estimatedMinutes: number;
  estimatedFilamentGrams: number;
  stats: StlStats;
  method: 'stl-geometry';
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function parseBinaryStl(buffer: Buffer): { triangles: Vec3[][]; count: number } {
  const count = buffer.readUInt32LE(80);
  const triangles: Vec3[][] = [];
  let offset = 84;

  for (let i = 0; i < count; i++) {
    if (offset + 50 > buffer.length) {
      break;
    }
    // Skip the 12-byte normal vector, read three vertices.
    const tri: Vec3[] = [];
    for (let v = 0; v < 3; v++) {
      const base = offset + 12 + v * 12;
      tri.push({
        x: buffer.readFloatLE(base),
        y: buffer.readFloatLE(base + 4),
        z: buffer.readFloatLE(base + 8),
      });
    }
    triangles.push(tri);
    offset += 50;
  }

  return { triangles, count: triangles.length };
}

function parseAsciiStl(content: string): { triangles: Vec3[][]; count: number } {
  const triangles: Vec3[][] = [];
  const vertexRegex = /vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g;
  const vertices: Vec3[] = [];

  let match: RegExpExecArray | null;
  while ((match = vertexRegex.exec(content)) !== null) {
    vertices.push({
      x: Number.parseFloat(match[1]),
      y: Number.parseFloat(match[2]),
      z: Number.parseFloat(match[3]),
    });
  }

  for (let i = 0; i + 2 < vertices.length; i += 3) {
    triangles.push([vertices[i], vertices[i + 1], vertices[i + 2]]);
  }

  return { triangles, count: triangles.length };
}

function isAsciiStl(buffer: Buffer): boolean {
  const head = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf-8');
  if (!head.trimStart().toLowerCase().startsWith('solid')) {
    return false;
  }
  // Binary files often start with "solid" too; verify a facet keyword appears.
  return buffer.toString('utf-8', 0, Math.min(buffer.length, 4096)).includes('facet');
}

export function analyzeStl(filePath: string): StlStats {
  const buffer = fs.readFileSync(filePath);
  const { triangles } = isAsciiStl(buffer)
    ? parseAsciiStl(buffer.toString('utf-8'))
    : parseBinaryStl(buffer);

  if (triangles.length === 0) {
    throw new Error('STL file contains no triangles');
  }

  let signedVolume = 0; // mm^3, via divergence theorem
  let surfaceArea = 0; // mm^2
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };

  for (const [a, b, c] of triangles) {
    signedVolume +=
      (a.x * (b.y * c.z - c.y * b.z) -
        a.y * (b.x * c.z - c.x * b.z) +
        a.z * (b.x * c.y - c.x * b.y)) / 6;

    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abz = b.z - a.z;
    const acx = c.x - a.x;
    const acy = c.y - a.y;
    const acz = c.z - a.z;
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    surfaceArea += Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ) / 2;

    for (const p of [a, b, c]) {
      min.x = Math.min(min.x, p.x);
      min.y = Math.min(min.y, p.y);
      min.z = Math.min(min.z, p.z);
      max.x = Math.max(max.x, p.x);
      max.y = Math.max(max.y, p.y);
      max.z = Math.max(max.z, p.z);
    }
  }

  return {
    triangleCount: triangles.length,
    volumeCm3: Math.abs(signedVolume) / 1000,
    surfaceAreaCm2: surfaceArea / 100,
    boundingBox: {
      x: max.x - min.x,
      y: max.y - min.y,
      z: max.z - min.z,
    },
  };
}

/**
 * Estimate print time from STL geometry. Models the print as:
 * - perimeter walls along the surface area
 * - sparse infill filling the interior volume
 * The deposition rate is derived from layer height, extrusion width and speed,
 * derated to account for accelerations, travel and small features.
 */
export function estimatePrint(filePath: string, settings: EstimateSettings = {}): PrintEstimate {
  const stats = analyzeStl(filePath);

  const layerHeight = settings.layerHeight && settings.layerHeight > 0 ? settings.layerHeight : 0.2;
  const infill = settings.infill !== undefined ? Math.min(100, Math.max(0, settings.infill)) : 20;
  const printSpeed = settings.printSpeed && settings.printSpeed > 0 ? settings.printSpeed : 60;
  const wallCount = settings.wallCount && settings.wallCount > 0 ? settings.wallCount : 2;
  const extrusionWidth = 0.45; // mm

  const shellVolumeMm3 = stats.surfaceAreaCm2 * 100 * extrusionWidth * wallCount * 0.5;
  const interiorVolumeMm3 = Math.max(stats.volumeCm3 * 1000 - shellVolumeMm3, 0);
  const depositedVolumeMm3 = shellVolumeMm3 + interiorVolumeMm3 * (infill / 100);

  // Volumetric flow at nominal speed, derated to ~45% for real-world motion planning.
  const nominalFlowMm3PerSec = layerHeight * extrusionWidth * printSpeed;
  const effectiveFlow = nominalFlowMm3PerSec * 0.45;

  const extrusionSeconds = depositedVolumeMm3 / Math.max(effectiveFlow, 0.01);

  // Per-layer overhead (z-hops, layer change, minimum layer time).
  const layerCount = Math.max(1, Math.ceil(stats.boundingBox.z / layerHeight));
  const layerOverheadSeconds = layerCount * 2.5;

  const totalMinutes = Math.max(5, Math.round((extrusionSeconds + layerOverheadSeconds + 120) / 60));

  const plaDensityGPerCm3 = 1.24;
  const filamentGrams = Math.round((depositedVolumeMm3 / 1000) * plaDensityGPerCm3 * 10) / 10;

  return {
    estimatedMinutes: totalMinutes,
    estimatedFilamentGrams: filamentGrams,
    stats,
    method: 'stl-geometry',
  };
}

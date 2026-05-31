// Utility to parse gcode files and extract print time estimates
export interface GCodeInfo {
  estimatedPrintTime: number; // in minutes
  layerHeight?: number;
  filamentUsed?: number; // in mm
  filamentWeight?: number; // in grams
  extruderTemp?: number;
  bedTemp?: number;
  fileName: string;
}

export interface GCodeSegment {
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
  layer: number;
  extruding: boolean;
}

export interface GCodePreviewData {
  segments: GCodeSegment[];
  layerCount: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
}

export const parseGCodeFile = async (file: File): Promise<GCodeInfo> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const info = extractGCodeInfo(content, file.name);
        resolve(info);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

const extractGCodeInfo = (content: string, fileName: string): GCodeInfo => {
  const lines = content.split('\n');
  let estimatedPrintTime = 0;
  let layerHeight: number | undefined;
  let filamentUsed: number | undefined;
  let filamentWeight: number | undefined;
  let extruderTemp: number | undefined;
  let bedTemp: number | undefined;

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Check for various slicer time estimates
    // Cura format
    if (trimmedLine.startsWith(';TIME:')) {
      const seconds = parseInt(trimmedLine.split(':')[1]);
      estimatedPrintTime = Math.round(seconds / 60);
    }
    
    // PrusaSlicer format
    if (trimmedLine.includes('estimated printing time')) {
      const match = trimmedLine.match(/(\d+)h\s*(\d+)m/);
      if (match) {
        const hours = parseInt(match[1]) || 0;
        const minutes = parseInt(match[2]) || 0;
        estimatedPrintTime = hours * 60 + minutes;
      }
    }
    
    // Another PrusaSlicer format
    if (trimmedLine.includes('estimated printing time (normal mode)')) {
      const match = trimmedLine.match(/(\d+)h\s*(\d+)m/);
      if (match) {
        const hours = parseInt(match[1]) || 0;
        const minutes = parseInt(match[2]) || 0;
        estimatedPrintTime = hours * 60 + minutes;
      }
    }
    
    // Layer height
    if (trimmedLine.includes('layer_height') || trimmedLine.includes('Layer height')) {
      const match = trimmedLine.match(/(\d+\.?\d*)/);
      if (match) {
        layerHeight = parseFloat(match[1]);
      }
    }
    
    // Filament used (length in mm)
    if (trimmedLine.includes('filament used') && trimmedLine.includes('mm')) {
      const match = trimmedLine.match(/(\d+\.?\d*)/);
      if (match) {
        filamentUsed = parseFloat(match[1]);
      }
    }
    
    // Filament weight
    if (trimmedLine.includes('filament used') && trimmedLine.includes('g')) {
      const match = trimmedLine.match(/(\d+\.?\d*)/);
      if (match) {
        filamentWeight = parseFloat(match[1]);
      }
    }
    
    // Extruder temperature
    if (trimmedLine.startsWith('M104') || trimmedLine.startsWith('M109')) {
      const match = trimmedLine.match(/S(\d+)/);
      if (match) {
        extruderTemp = parseInt(match[1]);
      }
    }
    
    // Bed temperature
    if (trimmedLine.startsWith('M140') || trimmedLine.startsWith('M190')) {
      const match = trimmedLine.match(/S(\d+)/);
      if (match) {
        bedTemp = parseInt(match[1]);
      }
    }
    
    // If we found time estimate and basic info, we can break early for performance
    if (estimatedPrintTime > 0 && layerHeight && filamentUsed) {
      break;
    }
  }
  
  // If no time estimate found, provide a warning
  if (estimatedPrintTime === 0) {
    console.warn('No print time estimate found in gcode file, using default estimate');
    // Provide a rough estimate based on file size (very rough approximation)
    estimatedPrintTime = Math.max(60, Math.round(content.length / 10000)); // 1 minute per 10KB as rough estimate
  }
  
  return {
    estimatedPrintTime,
    layerHeight,
    filamentUsed,
    filamentWeight,
    extruderTemp,
    bedTemp,
    fileName
  };
};

export const formatPrintTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
};

export const parseGCodePreview = (
  content: string,
  options: { maxSegments?: number; includeTravelMoves?: boolean } = {}
): GCodePreviewData => {
  const maxSegments = options.maxSegments ?? 120000;
  const includeTravelMoves = options.includeTravelMoves ?? false;

  const lines = content.split('\n');
  const segments: GCodeSegment[] = [];

  let absolutePositioning = true;
  let absoluteExtrusion = true;
  let currentLayer = 0;
  let lastLayerZ = 0;

  let position = { x: 0, y: 0, z: 0, e: 0 };

  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  };

  const updateBounds = (x: number, y: number, z: number) => {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxY = Math.max(bounds.maxY, y);
    bounds.minZ = Math.min(bounds.minZ, z);
    bounds.maxZ = Math.max(bounds.maxZ, z);
  };

  for (const rawLine of lines) {
    if (segments.length >= maxSegments) {
      break;
    }

    const trimmedRawLine = rawLine.trim();
    if (!trimmedRawLine) {
      continue;
    }

    const layerCommentMatch = trimmedRawLine.match(/^;\s*LAYER\s*:?\s*(-?\d+)/i);
    if (layerCommentMatch) {
      const parsedLayer = Number.parseInt(layerCommentMatch[1], 10);
      if (Number.isFinite(parsedLayer) && parsedLayer >= 0) {
        currentLayer = parsedLayer;
      }
    }

    const line = trimmedRawLine.split(';')[0].trim();
    if (!line) {
      continue;
    }

    const normalizedLine = line.replace(/^N\d+\s+/, '').trim();
    const upperLine = normalizedLine.toUpperCase();
    if (!normalizedLine) {
      continue;
    }

    if (upperLine === 'G90') {
      absolutePositioning = true;
      continue;
    }
    if (upperLine === 'G91') {
      absolutePositioning = false;
      continue;
    }
    if (upperLine === 'M82') {
      absoluteExtrusion = true;
      continue;
    }
    if (upperLine === 'M83') {
      absoluteExtrusion = false;
      continue;
    }

    if (upperLine.startsWith('G92')) {
      const resetRegex = /([XYZEABC])(-?\d*\.?\d+)/g;
      let resetMatch: RegExpExecArray | null;
      while ((resetMatch = resetRegex.exec(upperLine)) !== null) {
        const axis = resetMatch[1];
        const value = Number.parseFloat(resetMatch[2]);
        if (axis === 'X') position.x = value;
        if (axis === 'Y') position.y = value;
        if (axis === 'Z') position.z = value;
        if (axis === 'E' || axis === 'A' || axis === 'B' || axis === 'C') position.e = value;
      }
      continue;
    }

    if (!/^G0?\d?\b/.test(upperLine) && !/^G1\d?\b/.test(upperLine) && !/^G2\d?\b/.test(upperLine) && !/^G3\d?\b/.test(upperLine)) {
      continue;
    }

    const values: Partial<Record<'X' | 'Y' | 'Z' | 'E' | 'A' | 'B' | 'C', number>> = {};
    const regex = /([XYZEABC])(-?\d*\.?\d+)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(upperLine)) !== null) {
      values[match[1] as 'X' | 'Y' | 'Z' | 'E' | 'A' | 'B' | 'C'] = Number.parseFloat(match[2]);
    }

    const nextExtrusionValue = values.E ?? values.A ?? values.B ?? values.C;

    const next = {
      x: values.X === undefined
        ? position.x
        : absolutePositioning
          ? values.X
          : position.x + values.X,
      y: values.Y === undefined
        ? position.y
        : absolutePositioning
          ? values.Y
          : position.y + values.Y,
      z: values.Z === undefined
        ? position.z
        : absolutePositioning
          ? values.Z
          : position.z + values.Z,
      e: nextExtrusionValue === undefined
        ? position.e
        : absoluteExtrusion
          ? nextExtrusionValue
          : position.e + nextExtrusionValue,
    };

    const moved = next.x !== position.x || next.y !== position.y || next.z !== position.z;
    const extruding = next.e > position.e + 0.00001;

    if (moved && (extruding || includeTravelMoves)) {
      if (next.z > lastLayerZ + 0.0001) {
        currentLayer += 1;
        lastLayerZ = next.z;
      }

      segments.push({
        start: { x: position.x, y: position.y, z: position.z },
        end: { x: next.x, y: next.y, z: next.z },
        layer: currentLayer,
        extruding,
      });

      updateBounds(position.x, position.y, position.z);
      updateBounds(next.x, next.y, next.z);
    }

    position = next;
  }

  if (!Number.isFinite(bounds.minX)) {
    return {
      segments: [],
      layerCount: 0,
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
    };
  }

  return {
    segments,
    layerCount: segments.length > 0 ? Math.max(...segments.map((segment) => segment.layer)) + 1 : 0,
    bounds,
  };
};
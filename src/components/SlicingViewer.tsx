import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, RotateCw, X, Play } from "lucide-react";
import { Printer } from "@/types/printer";
import { formatPrintTime, parseGCodePreview } from "@/utils/gcodeParser";

interface SlicingViewerProps {
  buildVolume?: {
    x: number;
    y: number;
    z: number;
  };
  file?: File;
  onClose?: () => void;
  onSlice?: () => void | Promise<void>;
  selectedPrinters?: Printer[];
  className?: string;
  gcodeContent?: string;
  gcodeFileName?: string;
  estimatedPrintTimeSeconds?: number;
}

function BasicBox({ args, position, color, wireframe = false, opacity = 1 }: {
  args: [number, number, number];
  position: [number, number, number];
  color: string;
  wireframe?: boolean;
  opacity?: number;
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={args} />
      <meshStandardMaterial
        color={color}
        wireframe={wireframe}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
}

function BuildPlate({ size }: { size: { x: number; y: number; z: number } }) {
  return (
    <group>
      <BasicBox
        args={[size.x / 100, 0.1, size.y / 100]}
        position={[0, -size.z / 200, 0]}
        color="#444444"
      />

      <BasicBox
        args={[size.x / 100, size.z / 100, size.y / 100]}
        position={[0, 0, 0]}
        color="#00ff00"
        wireframe={true}
        opacity={0.3}
      />

      {Array.from({ length: 11 }, (_, i) => {
        const pos = (i - 5) * (size.x / 100 / 10);
        return (
          <group key={`grid-${i}`}>
            <BasicBox
              args={[0.01, 0.01, size.y / 100]}
              position={[pos, -size.z / 200, 0]}
              color="#666666"
            />
            <BasicBox
              args={[size.x / 100, 0.01, 0.01]}
              position={[0, -size.z / 200, pos]}
              color="#666666"
            />
          </group>
        );
      })}
    </group>
  );
}

function SampleModel({ geometry, modelName }: { geometry?: THREE.BufferGeometry | null; modelName?: string }) {
  if (geometry && modelName) {
    return (
      <mesh geometry={geometry} position={[0, 0, 0]}>
        <meshStandardMaterial
          color="#ff6b35"
          metalness={0.3}
          roughness={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
    );
  }

  return (
    <BasicBox
      args={[2, 2, 2]}
      position={[0, 1, 0]}
      color="#cccccc"
    />
  );
}

function GCodeToolpath({
  gcodeContent,
  visibleLayer,
  buildVolume,
}: {
  gcodeContent: string;
  visibleLayer: number;
  buildVolume: { x: number; y: number; z: number };
}) {
  const preview = useMemo(() => parseGCodePreview(gcodeContent), [gcodeContent]);

  const geometry = useMemo(() => {
    const positions: number[] = [];
    const centerX = (preview.bounds.minX + preview.bounds.maxX) / 2;
    const centerY = (preview.bounds.minY + preview.bounds.maxY) / 2;
    const buildPlateY = -buildVolume.z / 200;

    for (const segment of preview.segments) {
      if (!segment.extruding || segment.layer > visibleLayer) {
        continue;
      }

      positions.push(
        (segment.start.x - centerX) / 100,
        (segment.start.z - preview.bounds.minZ) / 100 + buildPlateY,
        (segment.start.y - centerY) / 100,
        (segment.end.x - centerX) / 100,
        (segment.end.z - preview.bounds.minZ) / 100 + buildPlateY,
        (segment.end.y - centerY) / 100
      );
    }

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return lineGeometry;
  }, [preview, visibleLayer, buildVolume.z]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  if (preview.segments.length === 0) {
    return null;
  }

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#22c55e" />
    </lineSegments>
  );
}

function CameraPositionController({ position }: { position: [number, number, number] }) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(position[0], position[1], position[2]);
    camera.lookAt(0, 0, 0);
  }, [camera, position]);

  return null;
}

function CameraControls() {
  const { camera, gl } = useThree();
  const [isInteracting, setIsInteracting] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPointer, setLastPointer] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = gl.domElement;

    const handlePointerDown = (event: PointerEvent) => {
      setIsInteracting(true);
      setIsPanning(event.ctrlKey || event.metaKey || event.button === 1);
      setLastPointer({ x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!isInteracting) return;

      const deltaX = event.clientX - lastPointer.x;
      const deltaY = event.clientY - lastPointer.y;

      if (isPanning) {
        const panSpeed = 0.002;
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();

        camera.getWorldDirection(new THREE.Vector3());
        right.setFromMatrixColumn(camera.matrix, 0);
        up.setFromMatrixColumn(camera.matrix, 1);

        const panDelta = new THREE.Vector3();
        panDelta.addScaledVector(right, -deltaX * panSpeed);
        panDelta.addScaledVector(up, deltaY * panSpeed);

        camera.position.add(panDelta);
      } else {
        const spherical = new THREE.Spherical();
        spherical.setFromVector3(camera.position);
        spherical.theta -= deltaX * 0.01;
        spherical.phi += deltaY * 0.01;
        spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

        camera.position.setFromSpherical(spherical);
        camera.lookAt(0, 0, 0);
      }

      setLastPointer({ x: event.clientX, y: event.clientY });
    };

    const handlePointerUp = (event: PointerEvent) => {
      setIsInteracting(false);
      setIsPanning(false);
      canvas.releasePointerCapture(event.pointerId);
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      const isTrackpad = Math.abs(event.deltaX) > 0 || Math.abs(event.deltaY) < 50;

      if (isTrackpad && Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        const panSpeed = 0.001;
        const right = new THREE.Vector3();
        right.setFromMatrixColumn(camera.matrix, 0);
        camera.position.addScaledVector(right, -event.deltaX * panSpeed);
      } else if (isTrackpad && event.ctrlKey) {
        const distance = camera.position.length();
        const newDistance = Math.max(2, Math.min(20, distance + event.deltaY * 0.005));
        camera.position.normalize().multiplyScalar(newDistance);
      } else if (isTrackpad) {
        const panSpeed = 0.001;
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();

        right.setFromMatrixColumn(camera.matrix, 0);
        up.setFromMatrixColumn(camera.matrix, 1);

        camera.position.addScaledVector(right, -event.deltaX * panSpeed);
        camera.position.addScaledVector(up, -event.deltaY * panSpeed);
      } else {
        const distance = camera.position.length();
        const newDistance = Math.max(2, Math.min(20, distance + event.deltaY * 0.01));
        camera.position.normalize().multiplyScalar(newDistance);
      }
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [camera, gl, isInteracting, isPanning, lastPointer]);

  return null;
}

export function SlicingViewer({
  buildVolume = { x: 220, y: 220, z: 250 },
  file,
  onClose,
  onSlice,
  selectedPrinters = [],
  className,
  gcodeContent,
  gcodeFileName,
  estimatedPrintTimeSeconds,
}: SlicingViewerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelGeometry, setModelGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [modelName, setModelName] = useState<string>("");
  const [cameraPosition, setCameraPosition] = useState<[number, number, number]>([5, 5, 5]);
  const [stlParsingStatus, setStlParsingStatus] = useState<"idle" | "parsing" | "success" | "error">("idle");
  const [previewMode, setPreviewMode] = useState<"model" | "gcode">(gcodeContent ? "gcode" : "model");
  const [loadedGCodeContent, setLoadedGCodeContent] = useState<string>(gcodeContent || "");
  const [activePrinterId, setActivePrinterId] = useState<string>(selectedPrinters[0]?.id || "default-printer");

  const gcodePreview = useMemo(() => parseGCodePreview(loadedGCodeContent), [loadedGCodeContent]);
  const [visibleLayer, setVisibleLayer] = useState(0);
  const activePrinter = selectedPrinters.find((printer) => printer.id === activePrinterId) || selectedPrinters[0];
  const effectiveBuildVolume = activePrinter?.buildVolume || buildVolume;

  useEffect(() => {
    if (selectedPrinters.length === 0) {
      setActivePrinterId("default-printer");
      return;
    }

    const stillExists = selectedPrinters.some((printer) => printer.id === activePrinterId);
    if (!stillExists) {
      setActivePrinterId(selectedPrinters[0].id);
    }
  }, [selectedPrinters, activePrinterId]);

  const fitCameraForGeometry = (geometry: THREE.BufferGeometry) => {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) {
      setCameraPosition([5, 5, 5]);
      return;
    }

    const size = box.getSize(new THREE.Vector3());
    const largest = Math.max(size.x, size.y, size.z, 1);
    const distance = Math.max(4, largest * 2.2);
    setCameraPosition([distance, distance, distance]);
  };

  const parseAndNormalizeSTL = (content: ArrayBuffer, bedZ: number) => {
    const loader = new STLLoader();
    let geometry: THREE.BufferGeometry;

    try {
      geometry = loader.parse(content);
    } catch {
      const text = new TextDecoder().decode(content);
      geometry = loader.parse(text);
    }

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();

    const rawBox = geometry.boundingBox;
    const rawSize = rawBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1);
    const rawLargest = Math.max(rawSize.x, rawSize.y, rawSize.z, 1e-6);

    const buildLargestScene = Math.max(effectiveBuildVolume.x, effectiveBuildVolume.y, effectiveBuildVolume.z) / 100;
    const baseScale = 1 / 100;
    const scaledLargestWithBase = rawLargest * baseScale;
    let adaptiveMultiplier = 1;

    if (scaledLargestWithBase > buildLargestScene * 0.95) {
      adaptiveMultiplier = (buildLargestScene * 0.95) / scaledLargestWithBase;
    } else if (scaledLargestWithBase < buildLargestScene * 0.03) {
      adaptiveMultiplier = (buildLargestScene * 0.2) / Math.max(scaledLargestWithBase, 1e-6);
    }

    const scaleToSceneUnits = baseScale * adaptiveMultiplier;
    geometry.scale(scaleToSceneUnits, scaleToSceneUnits, scaleToSceneUnits);
    geometry.computeBoundingBox();

    const scaledBox = geometry.boundingBox!;
    const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
    geometry.translate(-scaledCenter.x, bedZ - scaledBox.min.y, -scaledCenter.z);

    return geometry;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    const lowerName = uploadedFile?.name.toLowerCase() ?? "";
    if (!uploadedFile || (!lowerName.endsWith(".stl") && !lowerName.endsWith(".gcode"))) {
      return;
    }

    setStlParsingStatus("parsing");
    setModelLoaded(true);
    setModelName(uploadedFile.name);

    if (lowerName.endsWith(".gcode")) {
      const gcodeReader = new FileReader();
      gcodeReader.onload = (e) => {
        const text = e.target?.result as string;
        setLoadedGCodeContent(text || "");
        setPreviewMode("gcode");
        setStlParsingStatus("success");
      };
      gcodeReader.readAsText(uploadedFile);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (content && lowerName.endsWith(".stl")) {
        try {
          const buildPlateY = -effectiveBuildVolume.z / 200;
          const geometry = parseAndNormalizeSTL(content as ArrayBuffer, buildPlateY);
          setModelGeometry(geometry);
          fitCameraForGeometry(geometry);
          setStlParsingStatus("success");
          setPreviewMode("model");
          setLoadedGCodeContent("");
        } catch (error) {
          console.error("Failed to parse STL file:", error);
          setStlParsingStatus("error");
          const geometry = new THREE.ConeGeometry(1, 3, 8);
          geometry.rotateX(-Math.PI / 2);
          geometry.translate(0, 1.5, 0);
          setModelGeometry(geometry);
        }
      }
    };

    reader.readAsArrayBuffer(uploadedFile);
  };

  const resetView = () => {
    setCameraPosition([5, 5, 5]);
  };

  const handleSlice = async () => {
    if (!file || selectedPrinters.length === 0) return;
    await onSlice?.();
  };

  useEffect(() => {
    if (file && file.name.toLowerCase().endsWith(".stl")) {
      setModelLoaded(true);
      setModelName(file.name);
      setStlParsingStatus("parsing");
      setPreviewMode("model");

      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result;
        if (!content) {
          return;
        }

        try {
          const buildPlateY = -effectiveBuildVolume.z / 200;
          const geometry = parseAndNormalizeSTL(content as ArrayBuffer, buildPlateY);
          setModelGeometry(geometry);
          fitCameraForGeometry(geometry);
          setLoadedGCodeContent("");
          setStlParsingStatus("success");
        } catch (error) {
          console.error("Failed to parse STL file:", error);
          setStlParsingStatus("error");
          const fallback = new THREE.ConeGeometry(1, 3, 8);
          fallback.rotateX(-Math.PI / 2);
          fallback.translate(0, 1.5, 0);
          setModelGeometry(fallback);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }, [file, effectiveBuildVolume.z]);

  useEffect(() => {
    if (!modelGeometry || previewMode === "gcode") {
      return;
    }

    fitCameraForGeometry(modelGeometry);
  }, [effectiveBuildVolume.z]);

  useEffect(() => {
    if (!gcodeContent) {
      return;
    }

    setLoadedGCodeContent(gcodeContent);
    setPreviewMode("gcode");
  }, [gcodeContent]);

  useEffect(() => {
    setVisibleLayer(Math.max(0, gcodePreview.layerCount - 1));
  }, [gcodePreview.layerCount]);

  return (
    <Card className={`w-full ${className || ""}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>3D Model Viewer</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              Build Volume: {effectiveBuildVolume.x}×{effectiveBuildVolume.y}×{effectiveBuildVolume.z}mm
            </Badge>
            {onClose && (
              <Button size="sm" variant="outline" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex">
          <div className="flex-1">
            <div className="h-96 w-full bg-muted/20 relative">
              <Canvas
                camera={{ position: cameraPosition, fov: 50 }}
                gl={{ antialias: true }}
                style={{ background: "linear-gradient(to bottom, hsl(var(--background)) 0%, hsl(var(--muted)) 100%)" }}
              >
                <ambientLight intensity={0.6} />
                <directionalLight position={[10, 10, 5]} intensity={1} />
                <BuildPlate size={effectiveBuildVolume} />
                {previewMode === "gcode" && loadedGCodeContent ? (
                  <GCodeToolpath gcodeContent={loadedGCodeContent} visibleLayer={visibleLayer} buildVolume={effectiveBuildVolume} />
                ) : (
                  <SampleModel geometry={modelGeometry} modelName={modelName} />
                )}
                <CameraPositionController position={cameraPosition} />
                <CameraControls />
              </Canvas>

              {!modelLoaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <Upload className="h-8 w-8 mx-auto mb-2" />
                    <p>Upload your STL file to get started</p>
                    <p className="text-sm">Use trackpad to pan and zoom</p>
                  </div>
                </div>
              )}

              {stlParsingStatus === "parsing" && (
                <div className="absolute top-2 right-2 bg-background/90 p-2 rounded border">
                  <p className="text-sm font-medium">Parsing 3D model...</p>
                  <div className="w-full bg-muted h-2 rounded mt-1">
                    <div className="bg-primary h-full rounded animate-pulse w-3/4"></div>
                  </div>
                </div>
              )}

              {modelLoaded && modelName && stlParsingStatus === "success" && previewMode !== "gcode" && (
                <div className="absolute top-2 right-2 bg-background/90 p-2 rounded border">
                  <p className="text-sm font-medium">✓ Loaded: {modelName}</p>
                  <p className="text-xs text-success">Ready for slicing</p>
                </div>
              )}

              {previewMode === "gcode" && loadedGCodeContent && (
                <div className="absolute top-2 left-2 bg-background/90 p-2 rounded border">
                  <p className="text-sm font-medium">G-code Preview: {gcodeFileName || modelName || "sliced_output.gcode"}</p>
                  <p className="text-xs text-muted-foreground">
                    Layers: {gcodePreview.layerCount}
                    {typeof estimatedPrintTimeSeconds === "number" && estimatedPrintTimeSeconds > 0
                      ? ` • Est: ${formatPrintTime(Math.round(estimatedPrintTimeSeconds / 60))}`
                      : ""}
                  </p>
                </div>
              )}

              {previewMode === "gcode" && loadedGCodeContent && gcodePreview.segments.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-background/90 border rounded-md p-3 text-center max-w-sm">
                    <p className="text-sm font-medium">No extrusion paths detected</p>
                    <p className="text-xs text-muted-foreground">
                      The G-code loaded, but no drawable toolpath segments were parsed.
                    </p>
                  </div>
                </div>
              )}

              {stlParsingStatus === "error" && (
                <div className="absolute top-2 right-2 bg-destructive/10 border-destructive p-2 rounded border">
                  <p className="text-sm font-medium text-destructive">⚠ Parsing failed</p>
                  <p className="text-xs text-muted-foreground">Using fallback geometry</p>
                </div>
              )}
            </div>
          </div>

          <div className="w-80 bg-card border-l border-border overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h3 className="text-lg font-semibold">3D Viewer</h3>
              {onClose && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="p-4 space-y-4 flex-1">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={previewMode === "model" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPreviewMode("model")}
                >
                  Model
                </Button>
                <Button
                  variant={previewMode === "gcode" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPreviewMode("gcode")}
                  disabled={!loadedGCodeContent}
                >
                  G-code
                </Button>
              </div>

              {selectedPrinters.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="active-printer">Active Printer / Volume</Label>
                  <Select value={activePrinterId} onValueChange={setActivePrinterId}>
                    <SelectTrigger id="active-printer">
                      <SelectValue placeholder="Select printer" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedPrinters.map((printer) => {
                        const printerVolume = printer.buildVolume || buildVolume;
                        return (
                          <SelectItem key={printer.id} value={printer.id}>
                            {printer.name} ({printerVolume.x}×{printerVolume.y}×{printerVolume.z})
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {previewMode === "gcode" && loadedGCodeContent && (
                <div className="space-y-2 border border-border rounded-md p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Layer Preview</span>
                    <span className="text-muted-foreground">
                      {gcodePreview.layerCount > 0 ? `${visibleLayer + 1}/${gcodePreview.layerCount}` : "0/0"}
                    </span>
                  </div>
                  <input
                    type="range"
                    title="Visible layer"
                    min={0}
                    max={Math.max(0, gcodePreview.layerCount - 1)}
                    value={visibleLayer}
                    onChange={(event) => setVisibleLayer(Number(event.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Scrub layers to inspect extrusion paths of the sliced file.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Load Model</h4>
                  <Badge
                    variant={stlParsingStatus === "success" ? "default" :
                      stlParsingStatus === "error" ? "destructive" : "secondary"}
                  >
                    {stlParsingStatus === "idle" ? "Ready" :
                      stlParsingStatus === "parsing" ? "Loading..." :
                        stlParsingStatus === "success" ? "Loaded" : "Error"}
                  </Badge>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  title="Upload STL or G-code"
                  accept=".stl,.gcode"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload STL or G-code
                </Button>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Camera Controls</h4>
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetView}
                  >
                    <RotateCw className="mr-2 h-4 w-4" />
                    Reset View
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>• Click + drag to rotate</p>
                  <p>• Ctrl + drag to pan</p>
                  <p>• Scroll to zoom</p>
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  onClick={handleSlice}
                  className="w-full"
                  disabled={!modelLoaded || selectedPrinters.length === 0 || !file}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Slice Locally ({selectedPrinters.length})
                </Button>
              </div>

              {selectedPrinters.length > 0 && (
                <div className="border-t border-border pt-4">
                  <h4 className="font-medium mb-2">Selected Printers:</h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {selectedPrinters.map((printer) => (
                      <div key={printer.id} className="flex items-center justify-between text-sm">
                        <span>{printer.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {printer.slicer}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

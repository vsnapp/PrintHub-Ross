import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { filesApi, preformApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Droplets, Loader2, Play, RotateCcw, Send, Wand2 } from "lucide-react";

/**
 * PrintHub's custom resin slicing UI. The operator orients/scales/positions the
 * model on a virtual Formlabs build platform and picks material + support
 * settings; the backend translates this exact scene setup into Formlabs Local
 * API (PreForm Server) calls and returns PreForm's real estimates.
 */

interface ResinPrepDialogProps {
  open: boolean;
  onClose: () => void;
  /** Local file (Slicer tab flow). Uploaded automatically on prepare. */
  file?: File | null;
  /** Already-uploaded STL (job flow). */
  fileId?: number | null;
  jobId?: number;
  jobName?: string;
  printerId?: string;
  onPrepared?: () => void;
}

const MACHINE_TYPES: Array<{ code: string; label: string; volume: { x: number; y: number; z: number } }> = [
  { code: "FORM-4-0", label: "Form 4", volume: { x: 200, y: 125, z: 210 } },
  { code: "FORM-4B-0", label: "Form 4B", volume: { x: 200, y: 125, z: 210 } },
  { code: "FORM-3-0", label: "Form 3 / 3+", volume: { x: 145, y: 145, z: 185 } },
  { code: "FORM-3B-0", label: "Form 3B / 3B+", volume: { x: 145, y: 145, z: 185 } },
  { code: "FORM-3L-0", label: "Form 3L", volume: { x: 335, y: 200, z: 300 } },
  { code: "FORM-2-0", label: "Form 2", volume: { x: 145, y: 145, z: 175 } },
];

const FALLBACK_MATERIALS: Array<{ code: string; label: string }> = [
  { code: "FLGPBK05", label: "Black V5" },
  { code: "FLGPGR04", label: "Grey V4" },
  { code: "FLGPWH04", label: "White V4" },
  { code: "FLGPCL04", label: "Clear V4" },
  { code: "FLTO2001", label: "Tough 2000" },
  { code: "FLDUCL02", label: "Durable" },
];

const LAYER_THICKNESS_OPTIONS = ["0.025", "0.05", "0.1", "0.16", "ADAPTIVE"];

interface TransformState {
  rotation: { x: number; y: number; z: number }; // degrees, PreForm convention
  position: { x: number; y: number }; // mm from platform center
  scale: number;
}

const DEFAULT_TRANSFORM: TransformState = {
  rotation: { x: 0, y: 0, z: 0 },
  position: { x: 0, y: 0 },
  scale: 1,
};

/**
 * Build the rotation matrix matching PreForm's Euler convention:
 * rotations applied in z, x, y order (three.js 'YXZ' composes Ry*Rx*Rz,
 * which applies Rz to the vector first).
 */
function preformEuler(rotation: { x: number; y: number; z: number }): THREE.Euler {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  return new THREE.Euler(rad(rotation.x), rad(rotation.y), rad(rotation.z), "YXZ");
}

function transformedBounds(geometry: THREE.BufferGeometry, transform: TransformState): THREE.Box3 {
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  const box = geometry.boundingBox!;
  const matrix = new THREE.Matrix4()
    .makeRotationFromEuler(preformEuler(transform.rotation))
    .multiply(new THREE.Matrix4().makeScale(transform.scale, transform.scale, transform.scale));

  const result = new THREE.Box3();
  const corner = new THREE.Vector3();
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        corner.set(x, y, z).applyMatrix4(matrix);
        result.expandByPoint(corner);
      }
    }
  }
  return result;
}

/** The model, rotated/scaled per the UI and rested on the build platform. */
function ModelMesh({ geometry, transform }: { geometry: THREE.BufferGeometry; transform: TransformState }) {
  const { euler, liftZ } = useMemo(() => {
    const bounds = transformedBounds(geometry, transform);
    return {
      euler: preformEuler(transform.rotation),
      liftZ: -bounds.min.z,
    };
  }, [geometry, transform]);

  return (
    <mesh
      geometry={geometry}
      rotation={euler}
      scale={[transform.scale, transform.scale, transform.scale]}
      position={[transform.position.x, transform.position.y, liftZ]}
    >
      <meshStandardMaterial color="#f97316" roughness={0.55} metalness={0.05} />
    </mesh>
  );
}

function BuildPlatform({ volume }: { volume: { x: number; y: number; z: number } }) {
  return (
    <group>
      {/* Platform slab */}
      <mesh position={[0, 0, -1]}>
        <boxGeometry args={[volume.x, volume.y, 2]} />
        <meshStandardMaterial color="#3f3f46" />
      </mesh>
      {/* Build volume wireframe */}
      <lineSegments position={[0, 0, volume.z / 2]}>
        <edgesGeometry args={[new THREE.BoxGeometry(volume.x, volume.y, volume.z)]} />
        <lineBasicMaterial color="#22c55e" />
      </lineSegments>
      {/* Grid lines on the platform */}
      {Array.from({ length: 9 }, (_, i) => {
        const fx = ((i + 1) / 10 - 0.5) * volume.x;
        const fy = ((i + 1) / 10 - 0.5) * volume.y;
        return (
          <group key={i}>
            <mesh position={[fx, 0, 0.05]}>
              <boxGeometry args={[0.4, volume.y, 0.1]} />
              <meshBasicMaterial color="#52525b" />
            </mesh>
            <mesh position={[0, fy, 0.05]}>
              <boxGeometry args={[volume.x, 0.4, 0.1]} />
              <meshBasicMaterial color="#52525b" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export function ResinPrepDialog({
  open,
  onClose,
  file,
  fileId,
  jobId,
  jobName,
  printerId,
  onPrepared,
}: ResinPrepDialogProps) {
  const { toast } = useToast();

  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [loadingModel, setLoadingModel] = useState(false);
  const [transform, setTransform] = useState<TransformState>(DEFAULT_TRANSFORM);
  const [machineType, setMachineType] = useState("FORM-4-0");
  const [materialCode, setMaterialCode] = useState("FLGPBK05");
  const [customMaterial, setCustomMaterial] = useState("");
  const [layerThickness, setLayerThickness] = useState("0.1");
  const [autoOrient, setAutoOrient] = useState(false);
  const [autoLayout, setAutoLayout] = useState(false);
  const [supportsEnabled, setSupportsEnabled] = useState(true);
  const [supportDensity, setSupportDensity] = useState("1.0");
  const [touchpointSize, setTouchpointSize] = useState("0.4");
  const [raftType, setRaftType] = useState<"FULL_RAFT" | "MINI_RAFT" | "MINI_RAFTS_ON_BP">("FULL_RAFT");
  const [internalSupports, setInternalSupports] = useState(true);

  const [serverStatus, setServerStatus] = useState<{
    configured: boolean;
    connected: boolean;
    devices: Array<{ id: string; product_name: string; status: string; ip_address: string }>;
    materials: any[] | null;
  } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [showTankConfirm, setShowTankConfirm] = useState(false);
  const [sendingPrint, setSendingPrint] = useState(false);
  const uploadedFileIdRef = useRef<number | null>(null);

  const machine = MACHINE_TYPES.find((entry) => entry.code === machineType) || MACHINE_TYPES[0];

  // Load STL geometry for the viewer (local file or backend file id).
  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingModel(true);
      try {
        let buffer: ArrayBuffer | null = null;
        if (file) {
          buffer = await file.arrayBuffer();
        } else if (fileId) {
          const response = await filesApi.download(fileId);
          buffer = await (response.data as Blob).arrayBuffer();
        }
        if (!buffer || cancelled) {
          return;
        }
        const loaded = new STLLoader().parse(buffer);
        loaded.computeBoundingBox();
        const center = new THREE.Vector3();
        loaded.boundingBox!.getCenter(center);
        // Center the geometry so UI position/rotation act around the model center.
        loaded.translate(-center.x, -center.y, -center.z);
        loaded.computeBoundingBox();
        loaded.computeVertexNormals();
        if (!cancelled) {
          setGeometry(loaded);
        }
      } catch {
        toast({
          title: "Failed to load model",
          description: "Could not parse the STL file for preview",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) {
          setLoadingModel(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, file, fileId, toast]);

  // PreForm Server status + device discovery.
  useEffect(() => {
    if (!open) {
      return;
    }
    preformApi.status()
      .then((response) => {
        setServerStatus(response.data);
        const firstDevice = response.data?.devices?.[0];
        if (firstDevice) {
          setSelectedDevice(firstDevice.id);
        }
      })
      .catch(() => setServerStatus({ configured: false, connected: false, devices: [], materials: null }));
  }, [open]);

  useEffect(() => {
    if (!open) {
      setResult(null);
      setTransform(DEFAULT_TRANSFORM);
      uploadedFileIdRef.current = null;
    }
  }, [open]);

  const bounds = useMemo(() => {
    if (!geometry) {
      return null;
    }
    return transformedBounds(geometry, transform);
  }, [geometry, transform]);

  const outOfBounds = useMemo(() => {
    if (!bounds) {
      return false;
    }
    const sizeX = bounds.max.x - bounds.min.x;
    const sizeY = bounds.max.y - bounds.min.y;
    const sizeZ = bounds.max.z - bounds.min.z;
    return (
      sizeZ > machine.volume.z ||
      Math.abs(transform.position.x) + sizeX / 2 > machine.volume.x / 2 ||
      Math.abs(transform.position.y) + sizeY / 2 > machine.volume.y / 2
    );
  }, [bounds, machine, transform.position]);

  const rotate = (axis: "x" | "y" | "z", delta: number) => {
    setTransform((prev) => ({
      ...prev,
      rotation: { ...prev.rotation, [axis]: ((prev.rotation[axis] + delta + 540) % 360) - 180 },
    }));
  };

  const setRotationValue = (axis: "x" | "y" | "z", value: string) => {
    const num = Number.parseFloat(value);
    setTransform((prev) => ({
      ...prev,
      rotation: { ...prev.rotation, [axis]: Number.isFinite(num) ? num : 0 },
    }));
  };

  const setPositionValue = (axis: "x" | "y", value: string) => {
    const num = Number.parseFloat(value);
    setTransform((prev) => ({
      ...prev,
      position: { ...prev.position, [axis]: Number.isFinite(num) ? num : 0 },
    }));
  };

  const effectiveMaterial = materialCode === "__custom__" ? customMaterial.trim() : materialCode;

  const serverMaterials: Array<{ code: string; label: string }> = useMemo(() => {
    const list = serverStatus?.materials;
    if (!Array.isArray(list) || list.length === 0) {
      return FALLBACK_MATERIALS;
    }
    return list
      .map((entry: any) => {
        const code = entry?.material_code || entry?.code || (typeof entry === "string" ? entry : null);
        if (!code) {
          return null;
        }
        return { code: String(code), label: String(entry?.display_name || entry?.name || code) };
      })
      .filter(Boolean) as Array<{ code: string; label: string }>;
  }, [serverStatus?.materials]);

  const ensureFileId = useCallback(async (): Promise<number> => {
    if (fileId) {
      return fileId;
    }
    if (uploadedFileIdRef.current) {
      return uploadedFileIdRef.current;
    }
    if (!file) {
      throw new Error("No STL file available");
    }
    const response = await filesApi.upload(file);
    uploadedFileIdRef.current = response.data?.id;
    return uploadedFileIdRef.current!;
  }, [file, fileId]);

  const handlePrepare = async () => {
    if (!effectiveMaterial) {
      toast({
        title: "Material required",
        description: "Select or enter a Formlabs material code",
        variant: "destructive",
      });
      return;
    }

    setPreparing(true);
    setResult(null);
    try {
      const resolvedFileId = await ensureFileId();
      const response = await preformApi.prepare({
        file_id: resolvedFileId,
        job_id: jobId,
        printer_id: printerId,
        scene: {
          machine_type: machineType,
          material_code: effectiveMaterial,
          layer_thickness_mm: layerThickness === "ADAPTIVE" ? "ADAPTIVE" : Number.parseFloat(layerThickness),
        },
        transform: {
          orientation: transform.rotation,
          position: { x: transform.position.x, y: transform.position.y },
          scale: transform.scale !== 1 ? transform.scale : undefined,
        },
        auto_orient: autoOrient,
        auto_layout: autoLayout,
        supports: {
          enabled: supportsEnabled,
          density: Number.parseFloat(supportDensity) || undefined,
          touchpoint_size_mm: Number.parseFloat(touchpointSize) || undefined,
          raft_type: raftType,
          internal_supports_enabled: internalSupports,
        },
      });

      setResult(response.data);
      // Reflect PreForm's refined orientation back into the viewer.
      if (autoOrient && response.data?.final_orientation) {
        setTransform((prev) => ({ ...prev, rotation: response.data.final_orientation }));
      }
      toast({
        title: "Resin job prepared",
        description: `PreForm estimate: ${response.data.estimated_time_minutes} min, ${response.data.volume_ml ? `${Math.round(response.data.volume_ml * 10) / 10} ml resin` : "volume n/a"}`,
      });
      onPrepared?.();
    } catch (error: any) {
      toast({
        title: "Preparation failed",
        description: error.response?.data?.error || error?.message || "PreForm Server request failed",
        variant: "destructive",
      });
    } finally {
      setPreparing(false);
    }
  };

  const handleSendPrint = async () => {
    if (!result?.form_file_id || !selectedDevice) {
      return;
    }
    setSendingPrint(true);
    try {
      await preformApi.print({
        form_file_id: result.form_file_id,
        printer: selectedDevice,
        job_id: jobId,
        printer_id: printerId,
        job_name: jobName || result.form_file_name,
      });
      toast({
        title: "Print sent",
        description: `Job uploaded to ${selectedDevice} via PreForm Server.`,
      });
      setShowTankConfirm(false);
      onPrepared?.();
    } catch (error: any) {
      toast({
        title: "Failed to send print",
        description: error.response?.data?.error || "PreForm Server could not reach the printer",
        variant: "destructive",
      });
      setShowTankConfirm(false);
    } finally {
      setSendingPrint(false);
    }
  };

  const cameraDistance = Math.max(machine.volume.x, machine.volume.y, machine.volume.z) * 1.8;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Droplets className="h-5 w-5" />
            Resin Prep{jobName ? ` — ${jobName}` : ""}
          </DialogTitle>
          <DialogDescription>
            Orient and position the model on the build platform. Your setup is translated 1:1 into
            PreForm (Formlabs Local API) for supports, exact estimates, and printing.
          </DialogDescription>
        </DialogHeader>

        {serverStatus && !serverStatus.connected && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
            <div>
              <span className="font-medium text-destructive">
                {serverStatus.configured ? "PreForm Server is configured but not reachable." : "PreForm Server is not configured."}
              </span>{" "}
              <span className="text-muted-foreground">
                Set <code>PREFORM_SERVER_URL</code> (running PreFormServer, default port 44388) or{" "}
                <code>PREFORM_SERVER_PATH</code> on the backend. You can still preview orientation below.
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
          {/* 3D viewer */}
          <div className="relative rounded-md border border-border bg-zinc-950 min-h-[420px]">
            {loadingModel && (
              <div className="absolute inset-0 z-10 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
            <Canvas camera={{ position: [cameraDistance, cameraDistance * 0.8, cameraDistance], fov: 40, near: 1, far: cameraDistance * 10 }}>
              <ambientLight intensity={0.7} />
              <directionalLight position={[200, 400, 300]} intensity={0.9} />
              <directionalLight position={[-200, 200, -300]} intensity={0.4} />
              {/* Rotate the z-up PreForm/STL space into three.js's y-up view space. */}
              <group rotation={[-Math.PI / 2, 0, 0]}>
                <BuildPlatform volume={machine.volume} />
                {geometry && <ModelMesh geometry={geometry} transform={transform} />}
              </group>
              <OrbitControls makeDefault target={[0, machine.volume.z / 4, 0]} />
            </Canvas>
            <div className="absolute bottom-2 left-2 flex gap-2">
              <Badge variant="secondary">{machine.label} — {machine.volume.x}×{machine.volume.y}×{machine.volume.z}mm</Badge>
              {bounds && (
                <Badge variant={outOfBounds ? "destructive" : "outline"} className="bg-background/70">
                  Model: {(bounds.max.x - bounds.min.x).toFixed(1)}×{(bounds.max.y - bounds.min.y).toFixed(1)}×{(bounds.max.z - bounds.min.z).toFixed(1)}mm
                  {outOfBounds ? " — exceeds build volume!" : ""}
                </Badge>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-4 overflow-y-auto pr-1 max-h-[70vh]">
            <div className="space-y-2 rounded-md border border-border p-3">
              <div className="text-sm font-medium">Printer & Material</div>
              <div className="space-y-2">
                <Label className="text-xs">Machine</Label>
                <Select value={machineType} onValueChange={setMachineType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MACHINE_TYPES.map((entry) => (
                      <SelectItem key={entry.code} value={entry.code}>{entry.label} ({entry.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Material</Label>
                <Select value={materialCode} onValueChange={setMaterialCode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {serverMaterials.map((entry) => (
                      <SelectItem key={entry.code} value={entry.code}>{entry.label} ({entry.code})</SelectItem>
                    ))}
                    <SelectItem value="__custom__">Other (enter code)...</SelectItem>
                  </SelectContent>
                </Select>
                {materialCode === "__custom__" && (
                  <Input
                    value={customMaterial}
                    onChange={(event) => setCustomMaterial(event.target.value)}
                    placeholder="Formlabs material code, e.g. FLGPBK05"
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Layer Thickness (mm)</Label>
                <Select value={layerThickness} onValueChange={setLayerThickness}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LAYER_THICKNESS_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>{option === "ADAPTIVE" ? "Adaptive" : option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Orientation (°)</div>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setTransform(DEFAULT_TRANSFORM)}>
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset
                </Button>
              </div>
              {(["x", "y", "z"] as const).map((axis) => (
                <div key={axis} className="flex items-center gap-2">
                  <Label className="text-xs w-4 uppercase">{axis}</Label>
                  <Input
                    type="number"
                    step="5"
                    className="h-8"
                    value={transform.rotation[axis]}
                    onChange={(event) => setRotationValue(axis, event.target.value)}
                  />
                  <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => rotate(axis, -90)}>-90</Button>
                  <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => rotate(axis, 90)}>+90</Button>
                </div>
              ))}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs">Pos X (mm)</Label>
                  <Input type="number" step="5" className="h-8" value={transform.position.x}
                    onChange={(event) => setPositionValue("x", event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Pos Y (mm)</Label>
                  <Input type="number" step="5" className="h-8" value={transform.position.y}
                    onChange={(event) => setPositionValue("y", event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Scale</Label>
                  <Input type="number" step="0.1" min="0.01" className="h-8" value={transform.scale}
                    onChange={(event) => {
                      const num = Number.parseFloat(event.target.value);
                      setTransform((prev) => ({ ...prev, scale: Number.isFinite(num) && num > 0 ? num : 1 }));
                    }} />
                </div>
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <Label className="flex items-center gap-2 cursor-pointer text-xs">
                  <Checkbox checked={autoOrient} onCheckedChange={(checked) => setAutoOrient(checked === true)} />
                  <span className="flex items-center gap-1">
                    <Wand2 className="h-3 w-3" />
                    Let PreForm auto-orient (refines your rotation)
                  </span>
                </Label>
                <Label className="flex items-center gap-2 cursor-pointer text-xs">
                  <Checkbox checked={autoLayout} onCheckedChange={(checked) => setAutoLayout(checked === true)} />
                  Auto-layout (re-center on platform)
                </Label>
              </div>
            </div>

            <div className="space-y-2 rounded-md border border-border p-3">
              <Label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                <Checkbox checked={supportsEnabled} onCheckedChange={(checked) => setSupportsEnabled(checked === true)} />
                Generate Supports
              </Label>
              {supportsEnabled && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Density</Label>
                    <Input type="number" step="0.1" min="0.1" className="h-8" value={supportDensity}
                      onChange={(event) => setSupportDensity(event.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Touchpoint (mm)</Label>
                    <Input type="number" step="0.05" min="0.1" className="h-8" value={touchpointSize}
                      onChange={(event) => setTouchpointSize(event.target.value)} />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Raft</Label>
                    <Select value={raftType} onValueChange={(value: typeof raftType) => setRaftType(value)}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FULL_RAFT">Full raft</SelectItem>
                        <SelectItem value="MINI_RAFT">Mini rafts</SelectItem>
                        <SelectItem value="MINI_RAFTS_ON_BP">Mini rafts on build platform</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Label className="flex items-center gap-2 cursor-pointer text-xs col-span-2">
                    <Checkbox checked={internalSupports} onCheckedChange={(checked) => setInternalSupports(checked === true)} />
                    Internal supports
                  </Label>
                </div>
              )}
            </div>

            <Button
              className="w-full"
              onClick={handlePrepare}
              disabled={preparing || (!file && !fileId) || !serverStatus?.connected}
            >
              {preparing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Droplets className="h-4 w-4 mr-2" />}
              Prepare in PreForm
            </Button>

            {result && (
              <div className="space-y-2 rounded-md border border-border bg-muted/50 p-3 text-sm">
                <div className="font-medium">PreForm Result</div>
                <div className="text-muted-foreground space-y-0.5">
                  <div>Print time: {result.estimated_time_minutes} min</div>
                  {result.volume_ml != null && <div>Resin: ~{Math.round(result.volume_ml * 10) / 10} ml</div>}
                  {result.layer_count != null && <div>Layers: {result.layer_count}</div>}
                  <div>Supports: {result.has_supports ? "yes" : "no"}</div>
                  {!result.in_bounds && (
                    <div className="text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Model is outside the build volume
                    </div>
                  )}
                </div>
                <div className="space-y-2 pt-1">
                  <Label className="text-xs">Formlabs printer</Label>
                  <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder={serverStatus?.devices?.length ? "Select printer" : "No printers discovered"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(serverStatus?.devices || []).map((device) => (
                        <SelectItem key={device.id} value={device.id}>
                          {device.product_name} ({device.id}) — {device.status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    className="w-full"
                    variant="default"
                    disabled={!selectedDevice || sendingPrint}
                    onClick={() => setShowTankConfirm(true)}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send to Printer
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Resin equivalent of the bed-clear confirmation */}
        <AlertDialog open={showTankConfirm} onOpenChange={(isOpen) => { if (!isOpen && !sendingPrint) setShowTankConfirm(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Is the printer ready?</AlertDialogTitle>
              <AlertDialogDescription>
                Confirm the build platform is installed and empty, the resin tank is in place, and there
                is enough {effectiveMaterial || "resin"} for {result?.volume_ml ? `~${Math.ceil(result.volume_ml)} ml` : "this print"}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={sendingPrint}>Not yet</AlertDialogCancel>
              <AlertDialogAction onClick={(event) => { event.preventDefault(); handleSendPrint(); }} disabled={sendingPrint}>
                {sendingPrint ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Printer is ready — send job
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

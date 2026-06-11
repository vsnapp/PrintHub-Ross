import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, PrinterGroup as PrinterGroupType } from "@/types/printer";
import { SlicingViewer } from "./SlicingViewer";
import { slicersApi, SlicerIdentifier } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { 
  Upload, 
  Play,
  Printer as PrinterIcon,
  Send,
  Users
} from "lucide-react";

type FdmSlicerId = 'cura' | 'prusa' | 'orca' | 'bambu';

const FDM_SLICERS: Array<{ id: FdmSlicerId; label: string }> = [
  { id: 'cura', label: 'Ultimaker Cura' },
  { id: 'prusa', label: 'PrusaSlicer' },
  { id: 'orca', label: 'OrcaSlicer' },
  { id: 'bambu', label: 'Bambu Studio' },
];

// Electron exposed slicers historically with alias names; normalize them.
const LOCAL_SLICER_ALIASES: Record<string, FdmSlicerId> = {
  cura: 'cura',
  prusa: 'prusa',
  prusaslicer: 'prusa',
  orca: 'orca',
  orcaslicer: 'orca',
  bambu: 'bambu',
};

interface SliceAvailability {
  local: boolean;
  server: boolean;
}

interface SlicerSectionProps {
  printers: Printer[];
  groups: PrinterGroupType[];
  onSliceFile: (
    file: File,
    selectedPrinters: string[],
    selectedGroups: string[],
    jobConfig: {
      slicer: SlicerIdentifier;
      overrides: {
        layerHeight: number;
        infill: number;
        printSpeed: number;
        nozzleTemperature: number;
        bedTemperature: number;
        supportEnabled: boolean;
      };
    }
  ) => Promise<{
    gcodeContent: string;
    gcodeFileName: string;
    estimatedPrintTimeSeconds: number;
    gcodeFileId?: number;
  } | null>;
  onUploadGcode: (file: File, selectedPrinters: string[], selectedGroups: string[]) => void;
  onStartPrints?: (fileId: number, selectedPrinters: string[], selectedGroups: string[]) => Promise<void>;
}

export function SlicerSection({ printers, groups, onSliceFile, onUploadGcode, onStartPrints }: SlicerSectionProps) {
  const [selectedPrinters, setSelectedPrinters] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [stlFile, setStlFile] = useState<File | null>(null);
  const [gcodeFile, setGcodeFile] = useState<File | null>(null);
  const [showSlicingViewer, setShowSlicingViewer] = useState(false);
  const [isSlicing, setIsSlicing] = useState(false);
  const [selectedSlicer, setSelectedSlicer] = useState<FdmSlicerId>("prusa");
  const [availability, setAvailability] = useState<Record<FdmSlicerId, SliceAvailability>>({
    cura: { local: false, server: false },
    prusa: { local: false, server: false },
    orca: { local: false, server: false },
    bambu: { local: false, server: false },
  });
  const [sliceOverrides, setSliceOverrides] = useState({
    layerHeight: 0.2,
    infill: 20,
    printSpeed: 60,
    nozzleTemperature: 210,
    bedTemperature: 60,
    supportEnabled: false,
  });
  const [slicedGcodeContent, setSlicedGcodeContent] = useState<string | undefined>(undefined);
  const [slicedGcodeFileName, setSlicedGcodeFileName] = useState<string | undefined>(undefined);
  const [slicedGcodeFileId, setSlicedGcodeFileId] = useState<number | undefined>(undefined);
  const [estimatedPrintTimeSeconds, setEstimatedPrintTimeSeconds] = useState<number | undefined>(undefined);
  const [uploadedGcodeContent, setUploadedGcodeContent] = useState<string | undefined>(undefined);
  const { toast } = useToast();

  useEffect(() => {
    const loadSlicerAvailability = async () => {
      const next: Record<FdmSlicerId, SliceAvailability> = {
        cura: { local: false, server: false },
        prusa: { local: false, server: false },
        orca: { local: false, server: false },
        bambu: { local: false, server: false },
      };

      // Local desktop slicers (Electron only)
      if (window.electron) {
        try {
          const result = await window.electron.getAvailableSlicers();
          for (const slicer of result.slicers || []) {
            const id = LOCAL_SLICER_ALIASES[slicer.name];
            if (id) {
              next[id].local = true;
            }
          }
        } catch {
          // Ignore local lookup failures.
        }
      }

      // Server-side embedded engines
      try {
        const response = await slicersApi.list();
        for (const slicer of response.data?.slicers || []) {
          const id = slicer.id as FdmSlicerId;
          if (id in next && slicer.cliSlicing) {
            next[id].server = true;
          }
        }
      } catch {
        // Ignore server lookup failures.
      }

      setAvailability(next);

      const isUsable = (id: FdmSlicerId) => next[id].local || next[id].server;
      if (!isUsable(selectedSlicer)) {
        const fallback = FDM_SLICERS.map(({ id }) => id).find(isUsable);
        if (fallback) {
          setSelectedSlicer(fallback);
        }
      }
    };

    loadSlicerAvailability();
  }, []);

  const handleSTLUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.name.toLowerCase().endsWith('.stl')) {
      setStlFile(file);
      setSlicedGcodeContent(undefined);
      setSlicedGcodeFileName(undefined);
      setSlicedGcodeFileId(undefined);
      setEstimatedPrintTimeSeconds(undefined);
      setUploadedGcodeContent(undefined);
      setShowSlicingViewer(true);
      toast({
        title: "STL file uploaded",
        description: `${file.name} ready for slicing`,
      });
    } else {
      toast({
        title: "Invalid file",
        description: "Please upload a valid STL file",
        variant: "destructive",
      });
    }
  };

  const handleGcodeUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.name.toLowerCase().endsWith('.gcode')) {
      setGcodeFile(file);
      setStlFile(null);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = (e.target?.result as string) || "";
        setUploadedGcodeContent(text);
        setSlicedGcodeContent(undefined);
        setSlicedGcodeFileName(undefined);
        setSlicedGcodeFileId(undefined);
        setEstimatedPrintTimeSeconds(undefined);
        setShowSlicingViewer(true);
      };
      reader.readAsText(file);
      toast({
        title: "Gcode file uploaded",
        description: `${file.name} ready for preview and printing`,
      });
    } else {
      toast({
        title: "Invalid file",
        description: "Please upload a valid Gcode file",
        variant: "destructive",
      });
    }
  };

  const handleSliceAll = async () => {
    if (!stlFile) {
      toast({
        title: "No file selected",
        description: "Please upload an STL file first",
        variant: "destructive",
      });
      return;
    }

    if (selectedPrinters.length === 0 && selectedGroups.length === 0) {
      toast({
        title: "No targets selected",
        description: "Please select printers or groups to slice for",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSlicing(true);
      const result = await onSliceFile(stlFile, selectedPrinters, selectedGroups, {
        slicer: selectedSlicer,
        overrides: sliceOverrides,
      });

      if (result) {
        setSlicedGcodeContent(result.gcodeContent);
        setSlicedGcodeFileName(result.gcodeFileName);
        setSlicedGcodeFileId(result.gcodeFileId);
        setEstimatedPrintTimeSeconds(result.estimatedPrintTimeSeconds);
        setShowSlicingViewer(true);
        toast({
          title: "Slicing complete",
          description: `${result.gcodeFileName} is ready${result.gcodeFileId ? ' — you can now send it to printers' : ' for preview'}`,
        });
      }
    } finally {
      setIsSlicing(false);
    }
  };

  const handlePrintSliced = async () => {
    if (!slicedGcodeFileId || !onStartPrints) {
      return;
    }
    if (selectedPrinters.length === 0 && selectedGroups.length === 0) {
      toast({
        title: "No targets selected",
        description: "Please select printers or groups to print on",
        variant: "destructive",
      });
      return;
    }
    await onStartPrints(slicedGcodeFileId, selectedPrinters, selectedGroups);
  };

  const handleSendGcode = () => {
    if (!gcodeFile) {
      toast({
        title: "No file selected",
        description: "Please upload a Gcode file first",
        variant: "destructive",
      });
      return;
    }

    if (selectedPrinters.length === 0 && selectedGroups.length === 0) {
      toast({
        title: "No targets selected",
        description: "Please select printers or groups to send to",
        variant: "destructive",
      });
      return;
    }

    onUploadGcode(gcodeFile, selectedPrinters, selectedGroups);
    toast({
      title: "Gcode sent",
      description: `${gcodeFile.name} sent to ${selectedPrinters.length} printers and ${selectedGroups.length} groups`,
    });
  };

  const togglePrinterSelection = (printerId: string) => {
    setSelectedPrinters(prev => 
      prev.includes(printerId) 
        ? prev.filter(id => id !== printerId)
        : [...prev, printerId]
    );
  };

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroups(prev => {
      const newGroups = prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId];
      
      const group = groups.find(g => g.id === groupId);
      if (group) {
        if (!prev.includes(groupId)) {
          // Auto-select printers in selected groups
          setSelectedPrinters(prevPrinters => {
            const newPrinters = [...prevPrinters];
            group.printerIds.forEach(printerId => {
              if (!newPrinters.includes(printerId)) {
                newPrinters.push(printerId);
              }
            });
            return newPrinters;
          });
        } else {
          // Deselect printers when group is deselected
          setSelectedPrinters(prevPrinters => 
            prevPrinters.filter(id => !group.printerIds.includes(id))
          );
        }
      }
      
      return newGroups;
    });
  };

  const selectedPrinterObjects = printers.filter(p => selectedPrinters.includes(p.id));

  const viewerGcodeContent = slicedGcodeContent || uploadedGcodeContent;
  const viewerGcodeFileName = slicedGcodeFileName || gcodeFile?.name;

  if (showSlicingViewer && (stlFile || gcodeFile)) {
    return (
      <SlicingViewer
        file={stlFile || undefined}
        onClose={() => setShowSlicingViewer(false)}
        onSlice={handleSliceAll}
        selectedPrinters={selectedPrinterObjects}
        gcodeContent={viewerGcodeContent}
        gcodeFileName={viewerGcodeFileName}
        estimatedPrintTimeSeconds={estimatedPrintTimeSeconds}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* File Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            File Upload
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 border border-border rounded-md p-3">
            <h4 className="font-medium">Slice Settings</h4>

            <div className="space-y-2">
              <Label>Available Slicing Engines</Label>
              <div className="flex flex-wrap gap-2">
                {FDM_SLICERS.map(({ id, label }) => {
                  const slot = availability[id];
                  const usable = slot.local || slot.server;
                  return (
                    <Badge key={id} variant={usable ? "default" : "outline"}>
                      {label} {usable ? (slot.local ? "(local)" : "(server)") : "✕"}
                    </Badge>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Local = slicer installed on this computer (desktop app). Server = embedded slicing engine on the farm server.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="slicer-choice">Slicer</Label>
              <Select value={selectedSlicer} onValueChange={(value: FdmSlicerId) => setSelectedSlicer(value)}>
                <SelectTrigger id="slicer-choice">
                  <SelectValue placeholder="Select slicer" />
                </SelectTrigger>
                <SelectContent>
                  {FDM_SLICERS.map(({ id, label }) => (
                    <SelectItem
                      key={id}
                      value={id}
                      disabled={!availability[id].local && !availability[id].server}
                    >
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="layer-height">Layer (mm)</Label>
                <Input
                  id="layer-height"
                  type="number"
                  step="0.01"
                  min="0.05"
                  value={sliceOverrides.layerHeight}
                  onChange={(event) => setSliceOverrides(prev => ({ ...prev, layerHeight: Number(event.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="infill">Infill (%)</Label>
                <Input
                  id="infill"
                  type="number"
                  min="0"
                  max="100"
                  value={sliceOverrides.infill}
                  onChange={(event) => setSliceOverrides(prev => ({ ...prev, infill: Number(event.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="print-speed">Speed (mm/s)</Label>
                <Input
                  id="print-speed"
                  type="number"
                  min="5"
                  value={sliceOverrides.printSpeed}
                  onChange={(event) => setSliceOverrides(prev => ({ ...prev, printSpeed: Number(event.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nozzle-temp">Nozzle (°C)</Label>
                <Input
                  id="nozzle-temp"
                  type="number"
                  min="0"
                  value={sliceOverrides.nozzleTemperature}
                  onChange={(event) => setSliceOverrides(prev => ({ ...prev, nozzleTemperature: Number(event.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bed-temp">Bed (°C)</Label>
                <Input
                  id="bed-temp"
                  type="number"
                  min="0"
                  value={sliceOverrides.bedTemperature}
                  onChange={(event) => setSliceOverrides(prev => ({ ...prev, bedTemperature: Number(event.target.value) }))}
                />
              </div>
              <div className="space-y-2 flex items-end">
                <Label htmlFor="support-enabled" className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    id="support-enabled"
                    checked={sliceOverrides.supportEnabled}
                    onCheckedChange={(checked) => setSliceOverrides(prev => ({ ...prev, supportEnabled: checked === true }))}
                  />
                  Supports
                </Label>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              These values override printer-specific slicing settings for this slice job only.
            </p>
          </div>

          {/* STL File Upload */}
          <div className="space-y-2">
            <Label htmlFor="stl-upload">STL File</Label>
            <Input
              id="stl-upload"
              type="file"
              accept=".stl"
              onChange={handleSTLUpload}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/80"
            />
            {stlFile && (
              <Badge variant="outline" className="text-xs">
                {stlFile.name}
              </Badge>
            )}
          </div>

          {/* Gcode File Upload */}
          <div className="space-y-2">
            <Label htmlFor="gcode-upload">Gcode File</Label>
            <Input
              id="gcode-upload"
              type="file"
              accept=".gcode,.g"
              onChange={handleGcodeUpload}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/80"
            />
            {gcodeFile && (
              <Badge variant="outline" className="text-xs">
                {gcodeFile.name}
              </Badge>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-4">
            <Button 
              onClick={() => setShowSlicingViewer(true)}
              disabled={!stlFile || isSlicing}
              className="w-full"
            >
              <Play className="mr-2 h-4 w-4" />
              Slice STL File
            </Button>
            
            {slicedGcodeFileId !== undefined && onStartPrints && (
              <Button
                onClick={handlePrintSliced}
                disabled={selectedPrinters.length === 0 && selectedGroups.length === 0}
                variant="default"
                className="w-full"
              >
                <Send className="mr-2 h-4 w-4" />
                Print Sliced Gcode ({slicedGcodeFileName})
              </Button>
            )}

            <Button 
              onClick={handleSendGcode}
              disabled={!gcodeFile || (selectedPrinters.length === 0 && selectedGroups.length === 0)}
              variant="outline"
              className="w-full"
            >
              Send Gcode to Printers
            </Button>

            {isSlicing && (
              <div className="text-xs text-muted-foreground">
                Slicing in progress...
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Target Selection Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PrinterIcon className="h-5 w-5" />
            Target Selection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Printer Groups */}
            {groups.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Groups
                </h4>
                <div className="space-y-2">
                  {groups.map((group) => (
                    <div key={group.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`group-${group.id}`}
                        checked={selectedGroups.includes(group.id)}
                        onCheckedChange={() => toggleGroupSelection(group.id)}
                      />
                      <Label 
                        htmlFor={`group-${group.id}`} 
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 12 12" aria-hidden="true">
                          <circle cx="6" cy="6" r="6" fill={group.color} />
                        </svg>
                        {group.name} ({group.printerIds.length} printers)
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Individual Printers */}
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <PrinterIcon className="h-4 w-4" />
                Printers
              </h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {printers.map((printer) => (
                  <div key={printer.id} className="flex items-center justify-between space-x-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`printer-${printer.id}`}
                        checked={selectedPrinters.includes(printer.id)}
                        onCheckedChange={() => togglePrinterSelection(printer.id)}
                      />
                      <Label 
                        htmlFor={`printer-${printer.id}`} 
                        className="cursor-pointer"
                      >
                        {printer.name}
                      </Label>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {printer.slicer}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Selection Summary */}
            {(selectedPrinters.length > 0 || selectedGroups.length > 0) && (
              <div className="pt-4 border-t border-border">
                <div className="text-sm text-muted-foreground">
                  Selected: {selectedPrinters.length} printers, {selectedGroups.length} groups
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Printer } from "@/types/printer";
import { Printer as PrinterIcon, Plus, Search } from "lucide-react";

interface CreatePrinterDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (printer: Omit<Printer, 'id'>) => void;
}

const SLICER_OPTIONS: Array<{ id: Printer['slicer']; label: string; type: 'fdm' | 'resin' }> = [
  { id: 'cura', label: 'Ultimaker Cura', type: 'fdm' },
  { id: 'prusa', label: 'PrusaSlicer', type: 'fdm' },
  { id: 'orca', label: 'OrcaSlicer', type: 'fdm' },
  { id: 'bambu', label: 'Bambu Studio', type: 'fdm' },
  { id: 'preform', label: 'PreForm (resin)', type: 'resin' },
];

export function CreatePrinterDialog({ isOpen, onClose, onCreate }: CreatePrinterDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    model: "",
    type: "fdm" as 'fdm' | 'resin',
    ipAddress: "",
    webcamUrl: "",
    connectionType: "wifi",
    integrationType: "octoprint" as Printer['integrationType'],
    deviceId: "",
    accessCode: "",
    slicer: "cura" as Printer['slicer'],
  });
  const [slicerDefaults, setSlicerDefaults] = useState({
    layerHeight: "0.2",
    infill: "20",
    printSpeed: "60",
    nozzleTemperature: "210",
    bedTemperature: "60",
    supportEnabled: false,
  });
  const [modelSearchTerm, setModelSearchTerm] = useState("");
  
  const printerModels = [
    "Creality Ender 3",
    "Creality Ender 3 Pro",
    "Creality Ender 3 V2",
    "Creality Ender 5",
    "Creality CR-10",
    "Prusa i3 MK3S+",
    "Prusa i3 MK4",
    "Prusa MINI+",
    "Bambu Lab X1 Carbon",
    "Bambu Lab A1",
    "Bambu Lab A1 mini",
    "Bambu Lab P1P",
    "Ultimaker S3",
    "Ultimaker S5",
    "Artillery Sidewinder X1",
    "Anycubic Kobra 2",
    "Voron 2.4",
    "Raise3D Pro2"
  ];
  
  const filteredModels = printerModels.filter(model => 
    model.toLowerCase().includes(modelSearchTerm.toLowerCase())
  );

  const handleCreate = () => {
    if (!formData.name || !formData.model) {
      return;
    }

    const isBambu = formData.integrationType === 'bambu';
    const connectionDetails = isBambu
      ? {
          host: formData.ipAddress || undefined,
          deviceId: formData.deviceId || undefined,
          accessCode: formData.accessCode || undefined,
        }
      : undefined;

    const parseNumber = (value: string): number | undefined => {
      const num = Number.parseFloat(value);
      return Number.isFinite(num) && num > 0 ? num : undefined;
    };

    const newPrinter: Omit<Printer, 'id'> = {
      name: formData.name,
      model: formData.model,
      type: formData.type,
      status: 'offline',
      temperature: { nozzle: 0, bed: 0 },
      groupIds: [],
      connectionType: (formData.connectionType as 'wifi' | 'usb') || 'wifi',
      ipAddress: formData.connectionType === 'usb' ? '' : (formData.ipAddress || '192.168.1.xxx'),
      webcamUrl: formData.webcamUrl || (isBambu ? '' : `https://picsum.photos/320/240?random=${Math.floor(Math.random() * 100)}`),
      integrationType: formData.integrationType,
      connectionDetails,
      slicer: formData.type === 'resin' ? 'preform' : formData.slicer,
      slicerDefaults: formData.type === 'resin'
        ? { layerHeight: parseNumber(slicerDefaults.layerHeight) }
        : {
            layerHeight: parseNumber(slicerDefaults.layerHeight),
            infill: parseNumber(slicerDefaults.infill),
            printSpeed: parseNumber(slicerDefaults.printSpeed),
            nozzleTemperature: parseNumber(slicerDefaults.nozzleTemperature),
            bedTemperature: parseNumber(slicerDefaults.bedTemperature),
            supportEnabled: slicerDefaults.supportEnabled,
          },
    };

    onCreate(newPrinter);
    
    // Reset form
    setFormData({
      name: "",
      model: "",
      type: "fdm",
      ipAddress: "",
      webcamUrl: "",
      connectionType: "wifi",
      integrationType: "octoprint",
      deviceId: "",
      accessCode: "",
      slicer: "cura",
    });
    setSlicerDefaults({
      layerHeight: "0.2",
      infill: "20",
      printSpeed: "60",
      nozzleTemperature: "210",
      bedTemperature: "60",
      supportEnabled: false,
    });
    
    onClose();
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create New Printer
          </DialogTitle>
        </DialogHeader>
        <Card>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="printer-name">Printer Name</Label>
              <Input
                id="printer-name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="e.g., Farm Printer 1"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="printer-model">Model</Label>
              <div className="relative">
                <Input
                  id="printer-model"
                  value={formData.model}
                  onChange={(e) => {
                    const value = e.target.value;
                    setModelSearchTerm(value);
                    handleInputChange('model', value);
                  }}
                  placeholder="Search or enter model"
                />
                <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              </div>
              {modelSearchTerm && filteredModels.length > 0 && (
                <div className="max-h-40 overflow-auto rounded-md border">
                  {filteredModels.map(model => (
                    <Button
                      key={model}
                      type="button"
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        handleInputChange('model', model);
                        setModelSearchTerm('');
                      }}
                    >
                      {model}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="printer-type">Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => handleInputChange('type', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fdm">FDM</SelectItem>
                    <SelectItem value="resin">Resin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="connection-type">Connection</Label>
                <Select
                  value={formData.connectionType}
                  onValueChange={(value) => handleInputChange('connectionType', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wifi">WiFi (IP Address)</SelectItem>
                    <SelectItem value="usb">USB Connection</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="integration-type">Integration</Label>
              <Select
                value={formData.integrationType || "octoprint"}
                onValueChange={(value) => handleInputChange('integrationType', value)}
              >
                <SelectTrigger id="integration-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="octoprint">OctoPrint</SelectItem>
                  <SelectItem value="moonraker">Moonraker (Klipper)</SelectItem>
                  <SelectItem value="serial">Marlin / Serial</SelectItem>
                  <SelectItem value="bambu">Bambu</SelectItem>
                  <SelectItem value="formlabs">Formlabs</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.connectionType !== 'usb' && (
              <div className="space-y-2">
                <Label htmlFor="ip-address">IP Address</Label>
                <Input
                  id="ip-address"
                  value={formData.ipAddress}
                  onChange={(e) => handleInputChange('ipAddress', e.target.value)}
                  placeholder="e.g., 192.168.1.100"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="webcam-url">Webcam URL</Label>
              <Input
                id="webcam-url"
                value={formData.webcamUrl}
                onChange={(e) => handleInputChange('webcamUrl', e.target.value)}
                placeholder="e.g., http://192.168.1.100:8080/stream"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="printer-slicer">Slicer</Label>
              <Select
                value={formData.type === 'resin' ? 'preform' : formData.slicer}
                onValueChange={(value) => handleInputChange('slicer', value)}
                disabled={formData.type === 'resin'}
              >
                <SelectTrigger id="printer-slicer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SLICER_OPTIONS
                    .filter(option => option.type === formData.type)
                    .map(option => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Files sliced for this printer use this slicer with the default settings below.
              </p>
            </div>

            <div className="space-y-2 rounded-md border border-dashed border-border p-3">
              <div className="text-sm font-medium">Default Slicing Settings</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="default-layer-height" className="text-xs">Layer Height (mm)</Label>
                  <Input
                    id="default-layer-height"
                    value={slicerDefaults.layerHeight}
                    onChange={(e) => setSlicerDefaults(prev => ({ ...prev, layerHeight: e.target.value }))}
                    placeholder="0.2"
                  />
                </div>
                {formData.type !== 'resin' && (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="default-infill" className="text-xs">Infill (%)</Label>
                      <Input
                        id="default-infill"
                        value={slicerDefaults.infill}
                        onChange={(e) => setSlicerDefaults(prev => ({ ...prev, infill: e.target.value }))}
                        placeholder="20"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="default-speed" className="text-xs">Print Speed (mm/s)</Label>
                      <Input
                        id="default-speed"
                        value={slicerDefaults.printSpeed}
                        onChange={(e) => setSlicerDefaults(prev => ({ ...prev, printSpeed: e.target.value }))}
                        placeholder="60"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="default-nozzle-temp" className="text-xs">Nozzle Temp (°C)</Label>
                      <Input
                        id="default-nozzle-temp"
                        value={slicerDefaults.nozzleTemperature}
                        onChange={(e) => setSlicerDefaults(prev => ({ ...prev, nozzleTemperature: e.target.value }))}
                        placeholder="210"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="default-bed-temp" className="text-xs">Bed Temp (°C)</Label>
                      <Input
                        id="default-bed-temp"
                        value={slicerDefaults.bedTemperature}
                        onChange={(e) => setSlicerDefaults(prev => ({ ...prev, bedTemperature: e.target.value }))}
                        placeholder="60"
                      />
                    </div>
                    <div className="flex items-end pb-1">
                      <Label className="flex items-center gap-2 cursor-pointer text-xs">
                        <Checkbox
                          checked={slicerDefaults.supportEnabled}
                          onCheckedChange={(checked) => setSlicerDefaults(prev => ({ ...prev, supportEnabled: checked === true }))}
                        />
                        Supports by default
                      </Label>
                    </div>
                  </>
                )}
              </div>
            </div>

            {formData.integrationType === 'bambu' && (
              <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                <div className="text-sm font-medium">Bambu LAN Details</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="bambu-device-id">Device ID</Label>
                    <Input
                      id="bambu-device-id"
                      value={formData.deviceId}
                      onChange={(e) => handleInputChange('deviceId', e.target.value)}
                      placeholder="device id"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bambu-access-code">Access Code</Label>
                    <Input
                      id="bambu-access-code"
                      value={formData.accessCode}
                      onChange={(e) => handleInputChange('accessCode', e.target.value)}
                      placeholder="printer access code"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button 
                onClick={handleCreate}
                disabled={!formData.name || !formData.model}
                className="flex-1"
              >
                <PrinterIcon className="h-4 w-4 mr-2" />
                Create Printer
              </Button>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
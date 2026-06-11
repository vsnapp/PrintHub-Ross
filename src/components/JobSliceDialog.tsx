import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { printersApi, slicersApi, SlicerIdentifier } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { ResinPrepDialog } from './ResinPrepDialog';
import { Droplets, Loader2, Play, Scissors } from 'lucide-react';

interface JobForSlicing {
  id: number;
  name: string;
  file_id?: number | null;
  printer_type: string;
}

interface PrinterOption {
  id: string;
  name: string;
  type: string;
  status: string;
  slicer: string;
  slicer_settings?: string | null;
}

interface JobSliceDialogProps {
  job: JobForSlicing | null;
  onClose: () => void;
  onSliced: () => void;
}

const SLICER_LABELS: Record<string, string> = {
  cura: 'Ultimaker Cura',
  prusa: 'PrusaSlicer',
  orca: 'OrcaSlicer',
  bambu: 'Bambu Studio',
  preform: 'PreForm',
};

export function JobSliceDialog({ job, onClose, onSliced }: JobSliceDialogProps) {
  const { toast } = useToast();
  const [printers, setPrinters] = useState<PrinterOption[]>([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState<string>('');
  const [slicing, setSlicing] = useState(false);
  const [starting, setStarting] = useState(false);
  // A human must confirm the bed is clear before any print is started.
  const [showBedConfirm, setShowBedConfirm] = useState(false);
  const [showResinPrep, setShowResinPrep] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [overrides, setOverrides] = useState({
    layerHeight: '',
    infill: '',
    printSpeed: '',
    nozzleTemperature: '',
    bedTemperature: '',
    supportEnabled: false,
  });

  useEffect(() => {
    if (!job) {
      return;
    }
    setResult(null);
    printersApi.list()
      .then((response) => {
        const all: PrinterOption[] = response.data?.printers || [];
        const matching = all.filter((printer) => printer.type === job.printer_type);
        setPrinters(matching);
        if (matching.length > 0) {
          setSelectedPrinterId(matching[0].id);
        }
      })
      .catch(() => setPrinters([]));
  }, [job]);

  const selectedPrinter = useMemo(
    () => printers.find((printer) => printer.id === selectedPrinterId),
    [printers, selectedPrinterId]
  );

  // Pre-fill override fields from the printer's stored default settings.
  useEffect(() => {
    if (!selectedPrinter?.slicer_settings) {
      return;
    }
    try {
      const defaults = typeof selectedPrinter.slicer_settings === 'string'
        ? JSON.parse(selectedPrinter.slicer_settings)
        : selectedPrinter.slicer_settings;
      setOverrides({
        layerHeight: defaults.layerHeight != null ? String(defaults.layerHeight) : '',
        infill: defaults.infill != null ? String(defaults.infill) : '',
        printSpeed: defaults.printSpeed != null ? String(defaults.printSpeed) : '',
        nozzleTemperature: defaults.nozzleTemperature != null ? String(defaults.nozzleTemperature) : '',
        bedTemperature: defaults.bedTemperature != null ? String(defaults.bedTemperature) : '',
        supportEnabled: defaults.supportEnabled === true,
      });
    } catch {
      // Keep current values when defaults can't be parsed.
    }
  }, [selectedPrinter?.id]);

  const buildOverridesPayload = () => {
    const numeric = (value: string) => {
      const num = Number.parseFloat(value);
      return Number.isFinite(num) && num > 0 ? num : undefined;
    };
    return {
      layerHeight: numeric(overrides.layerHeight),
      infill: numeric(overrides.infill),
      printSpeed: numeric(overrides.printSpeed),
      nozzleTemperature: numeric(overrides.nozzleTemperature),
      bedTemperature: numeric(overrides.bedTemperature),
      supportEnabled: overrides.supportEnabled,
    };
  };

  const handleSlice = async () => {
    if (!job?.file_id) {
      toast({
        title: 'No STL attached',
        description: 'This job has no uploaded STL file to slice.',
        variant: 'destructive',
      });
      return;
    }

    setSlicing(true);
    setResult(null);
    try {
      const response = await slicersApi.slice({
        file_id: job.file_id,
        printer_id: selectedPrinterId || undefined,
        job_id: job.id,
        slicer: (selectedPrinter?.slicer as SlicerIdentifier) || undefined,
        overrides: buildOverridesPayload(),
      });
      setResult(response.data);

      if (response.data.method === 'estimate') {
        toast({
          title: 'Resin estimate updated',
          description: response.data.message,
        });
      } else {
        toast({
          title: 'Slicing complete',
          description: `Estimated print time: ${response.data.estimated_time_minutes} min` +
            (response.data.engine_fallback ? ` (used ${SLICER_LABELS[response.data.slicer] || response.data.slicer} as fallback)` : ''),
        });
      }
      onSliced();
    } catch (error: any) {
      toast({
        title: 'Slicing failed',
        description: error.response?.data?.error || 'Unable to slice file',
        variant: 'destructive',
      });
    } finally {
      setSlicing(false);
    }
  };

  const handleStartPrint = async () => {
    if (!job || !selectedPrinterId) {
      return;
    }
    setStarting(true);
    try {
      await printersApi.startPrint(selectedPrinterId, { job_id: job.id });
      toast({
        title: 'Print started',
        description: `${job.name} is printing on ${selectedPrinter?.name}.`,
      });
      onSliced();
      setShowBedConfirm(false);
      onClose();
    } catch (error: any) {
      toast({
        title: 'Failed to start print',
        description: error.response?.data?.error || 'Printer rejected the job',
        variant: 'destructive',
      });
      setShowBedConfirm(false);
    } finally {
      setStarting(false);
    }
  };

  return (
    <Dialog open={!!job} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Slice "{job?.name}"
          </DialogTitle>
          <DialogDescription>
            Slices the student's STL with the printer's assigned slicer and updates the job's time estimate.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="slice-printer">Target Printer</Label>
            <Select value={selectedPrinterId} onValueChange={setSelectedPrinterId}>
              <SelectTrigger id="slice-printer">
                <SelectValue placeholder="Select a printer" />
              </SelectTrigger>
              <SelectContent>
                {printers.map((printer) => (
                  <SelectItem key={printer.id} value={printer.id}>
                    {printer.name} ({SLICER_LABELS[printer.slicer] || printer.slicer})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {printers.length === 0 && (
              <p className="text-xs text-destructive">
                No {job?.printer_type?.toUpperCase()} printers configured. Create one in the dashboard first.
              </p>
            )}
            {selectedPrinter && (
              <div className="flex gap-2 text-xs">
                <Badge variant="outline">Slicer: {SLICER_LABELS[selectedPrinter.slicer] || selectedPrinter.slicer}</Badge>
                <Badge variant={selectedPrinter.status === 'online' ? 'default' : 'secondary'}>
                  {selectedPrinter.status}
                </Badge>
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <div className="text-sm font-medium">Settings Overrides</div>
            <p className="text-xs text-muted-foreground">
              Pre-filled from the printer's defaults; adjust per print as needed.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Layer Height (mm)</Label>
                <Input
                  value={overrides.layerHeight}
                  onChange={(e) => setOverrides(prev => ({ ...prev, layerHeight: e.target.value }))}
                  placeholder="0.2"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Infill (%)</Label>
                <Input
                  value={overrides.infill}
                  onChange={(e) => setOverrides(prev => ({ ...prev, infill: e.target.value }))}
                  placeholder="20"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Print Speed (mm/s)</Label>
                <Input
                  value={overrides.printSpeed}
                  onChange={(e) => setOverrides(prev => ({ ...prev, printSpeed: e.target.value }))}
                  placeholder="60"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nozzle Temp (°C)</Label>
                <Input
                  value={overrides.nozzleTemperature}
                  onChange={(e) => setOverrides(prev => ({ ...prev, nozzleTemperature: e.target.value }))}
                  placeholder="210"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bed Temp (°C)</Label>
                <Input
                  value={overrides.bedTemperature}
                  onChange={(e) => setOverrides(prev => ({ ...prev, bedTemperature: e.target.value }))}
                  placeholder="60"
                />
              </div>
              <div className="flex items-end pb-1">
                <Label className="flex items-center gap-2 cursor-pointer text-xs">
                  <Checkbox
                    checked={overrides.supportEnabled}
                    onCheckedChange={(checked) => setOverrides(prev => ({ ...prev, supportEnabled: checked === true }))}
                  />
                  Supports
                </Label>
              </div>
            </div>
          </div>

          {result && result.method === 'cli-slice' && (
            <div className="rounded-md border border-border bg-muted/50 p-3 text-sm space-y-1">
              <div className="font-medium">
                Sliced with {SLICER_LABELS[result.slicer] || result.slicer}
                {result.engine_fallback ? ' (fallback engine)' : ''}
              </div>
              <div className="text-muted-foreground">
                Print time: {result.estimated_time_minutes} min
                {result.estimated_filament_grams ? ` • Filament: ~${result.estimated_filament_grams}g` : ''}
                {result.layer_count ? ` • ${result.layer_count} layers` : ''}
              </div>
            </div>
          )}

          {job?.printer_type === 'resin' && (
            <Button
              variant="outline"
              className="w-full"
              disabled={!job?.file_id}
              onClick={() => setShowResinPrep(true)}
            >
              <Droplets className="h-4 w-4 mr-2" />
              Resin Prep (orient + supports via PreForm)
            </Button>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSlice} disabled={slicing || !job?.file_id} className="flex-1">
              {slicing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Scissors className="h-4 w-4 mr-2" />}
              {job?.printer_type === 'resin' ? 'Quick Estimate' : 'Slice'}
            </Button>
            <Button
              onClick={() => setShowBedConfirm(true)}
              disabled={starting || !result || result.method !== 'cli-slice' || !selectedPrinterId}
              variant="default"
              className="flex-1"
            >
              {starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Start Print
            </Button>
          </div>
        </div>

        {job && (
          <ResinPrepDialog
            open={showResinPrep}
            onClose={() => setShowResinPrep(false)}
            fileId={job.file_id || undefined}
            jobId={job.id}
            jobName={job.name}
            printerId={selectedPrinterId || undefined}
            onPrepared={onSliced}
          />
        )}

        {/* Bed-clear confirmation before the print starts */}
        <AlertDialog open={showBedConfirm} onOpenChange={(open) => { if (!open && !starting) setShowBedConfirm(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Is the print bed clear?</AlertDialogTitle>
              <AlertDialogDescription>
                You are about to start "{job?.name}" on {selectedPrinter?.name}.
                Confirm the previous print has been removed and the bed is clear and ready.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={starting}>Not yet</AlertDialogCancel>
              <AlertDialogAction onClick={(event) => { event.preventDefault(); handleStartPrint(); }} disabled={starting}>
                {starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Bed is clear — start print
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

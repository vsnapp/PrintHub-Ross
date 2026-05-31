import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Printer, PrinterStatus } from "@/types/printer";
import { useState } from "react";
import { 
  Thermometer, 
  Printer as PrinterIcon, 
  Pause, 
  Play, 
  Square, 
  Home, 
  Flame, 
  Snowflake,
  Package,
  RefreshCw,
  Video,
  VideoOff,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  Expand
} from "lucide-react";

interface PrinterCardProps {
  printer: Printer;
  onCommand: (printerId: string, command: string) => void;
  onNewSpool: (printerId: string) => void;
  onAssignSpool: (printerId: string) => void;
  onSetError: (printerId: string) => void;
  onEditName: (printerId: string, newName: string) => void;
  onClearError?: (printerId: string) => void;
  onExpand?: (printerId: string) => void;
  isSelected?: boolean;
  onSelect?: (printerId: string) => void;
}

const statusColors: Record<PrinterStatus, string> = {
  online: "bg-status-online",
  printing: "bg-status-printing",
  paused: "bg-status-paused",
  error: "bg-status-error",
  offline: "bg-status-offline"
};

const statusLabels: Record<PrinterStatus, string> = {
  online: "Online",
  printing: "Printing",
  paused: "Paused",
  error: "Error",
  offline: "Offline"
};

export function PrinterCard({ printer, onCommand, onNewSpool, onAssignSpool, onSetError, onEditName, onClearError, onExpand, isSelected, onSelect }: PrinterCardProps) {
  const [webcamExpanded, setWebcamExpanded] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(printer.name);
  
  const statusColor = statusColors[printer.status];
  const statusLabel = statusLabels[printer.status];
  
  const filamentUsagePercent = printer.filamentSpool 
    ? (printer.filamentSpool.used / printer.filamentSpool.totalCapacity) * 100
    : 0;

  const handleNameEdit = () => {
    if (isEditingName && editedName.trim() !== printer.name) {
      onEditName(printer.id, editedName.trim());
    }
    setIsEditingName(!isEditingName);
  };

  return (
    <Card 
      className={`transition-all duration-200 hover:shadow-lg ${
        isSelected ? "ring-2 ring-primary" : ""
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <PrinterIcon className="h-5 w-5" />
            {isEditingName ? (
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onBlur={handleNameEdit}
                onKeyDown={(e) => e.key === 'Enter' && handleNameEdit()}
                className="bg-background border rounded px-2 py-1 text-lg font-semibold"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span 
                onClick={(e) => {
                  e.stopPropagation();
                  handleNameEdit();
                }} 
                className="cursor-pointer hover:text-primary"
              >
                {printer.name}
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className={`text-white ${statusColor}`}>
              {statusLabel}
            </Badge>
            {onExpand && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onExpand(printer.id);
                }}
              >
                <Expand className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {printer.model} • {printer.ipAddress}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Collapsible Webcam Feed */}
        <Collapsible open={webcamExpanded} onOpenChange={setWebcamExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-2 h-auto">
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4" />
                <span className="text-sm font-medium">Webcam</span>
              </div>
              {webcamExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2">
            {printer.webcamUrl ? (
              <div className="relative">
                <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                  <img 
                    src={printer.webcamUrl} 
                    alt={`${printer.name} webcam`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjI0MCIgdmlld0JveD0iMCAwIDMyMCAyNDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjMyMCIgaGVpZ2h0PSIyNDAiIGZpbGw9IiNmMWYxZjEiLz48Y2lyY2xlIGN4PSIxNjAiIGN5PSIxMDAiIHI9IjQwIiBmaWxsPSIjZDFkMWQxIi8+PHBhdGggZD0ibTE0MCA4MCAyMCAyMCAyMC0yMCIgc3Ryb2tlPSIjOTk5IiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiLz48L3N2Zz4=';
                    }}
                  />
                  <div className="absolute top-2 right-2 bg-background/80 rounded-full p-1">
                    <Video className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <VideoOff className="h-8 w-8 mx-auto mb-2" />
                  <p className="text-sm">No webcam available</p>
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Filament Usage */}
        {printer.filamentSpool ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {printer.filamentSpool.brand} {printer.filamentSpool.color} {printer.filamentSpool.type}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onNewSpool(printer.id);
                }}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                New Spool
              </Button>
            </div>
            
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Used: {printer.filamentSpool.used}g</span>
                <span>Remaining: {printer.filamentSpool.remaining}g</span>
              </div>
              <Progress value={filamentUsagePercent} className="h-2" />
              <div className="text-xs text-muted-foreground">
                {filamentUsagePercent.toFixed(1)}% used of {printer.filamentSpool.totalCapacity}g
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-md border border-dashed border-border p-3">
            <div className="text-sm text-muted-foreground">
              No filament assigned
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onAssignSpool(printer.id);
              }}
            >
              Assign Spool
            </Button>
          </div>
        )}

        {/* Temperature Display */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <Thermometer className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Nozzle: {printer.temperature.nozzle}°C</span>
          </div>
          <div className="flex items-center gap-1">
            <Thermometer className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Bed: {printer.temperature.bed}°C</span>
          </div>
        </div>

        {/* Current Job */}
        {printer.currentJob && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{printer.currentJob.name}</span>
              <span className="text-xs text-muted-foreground">
                {Math.round(printer.currentJob.timeRemaining / 60)}m left
              </span>
            </div>
            <Progress value={printer.currentJob.progress} className="h-2" />
            <div className="text-xs text-muted-foreground">
              {printer.currentJob.progress.toFixed(1)}% • {printer.currentJob.filament}
            </div>
          </div>
        )}

        {/* Control Buttons */}
        <div className="flex gap-2 flex-wrap">
          {/* Error Control Buttons */}
          {printer.status !== 'error' && printer.status !== 'offline' && (
            <Button 
              size="sm" 
              variant="outline"
              className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onSetError(printer.id);
              }}
            >
              <AlertTriangle className="h-4 w-4 mr-1" />
              Set Error
            </Button>
          )}
          
          {printer.status === 'error' && onClearError && (
            <Button 
              size="sm" 
              variant="outline"
              className="text-success border-success hover:bg-success hover:text-success-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onClearError(printer.id);
              }}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Clear Error
            </Button>
          )}
          
          {printer.status === 'printing' && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onCommand(printer.id, 'pause');
              }}
            >
              <Pause className="h-4 w-4 mr-1" />
              Pause
            </Button>
          )}
          
          {printer.status === 'paused' && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onCommand(printer.id, 'resume');
              }}
            >
              <Play className="h-4 w-4 mr-1" />
              Resume
            </Button>
          )}
          
          {(printer.status === 'printing' || printer.status === 'paused') && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onCommand(printer.id, 'stop');
              }}
            >
              <Square className="h-4 w-4 mr-1" />
              Stop
            </Button>
          )}
          
          {printer.status === 'online' && (
            <>
              <Button 
                size="sm" 
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onCommand(printer.id, 'home');
                }}
              >
                <Home className="h-4 w-4 mr-1" />
                Home
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onCommand(printer.id, 'preheat');
                }}
              >
                <Flame className="h-4 w-4 mr-1" />
                Preheat
              </Button>
            </>
          )}
          
          {printer.temperature.nozzle > 50 && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onCommand(printer.id, 'cooldown');
              }}
            >
              <Snowflake className="h-4 w-4 mr-1" />
              Cool
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
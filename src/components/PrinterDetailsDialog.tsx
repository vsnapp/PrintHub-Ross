import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Printer } from "@/types/printer";
import { Save, Edit3, FileText, Settings, CheckCircle, PauseCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { printersApi } from "@/lib/api";

interface PrinterDetailsDialogProps {
  printer: Printer;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (printerId: string, updates: Partial<Printer>) => void;
  onClearError?: (printerId: string) => void;
}

export function PrinterDetailsDialog({ 
  printer, 
  isOpen, 
  onClose, 
  onUpdate,
  onClearError 
}: PrinterDetailsDialogProps) {
  const getDefaultIntegrationType = (target: Printer) => {
    if (target.integrationType) {
      return target.integrationType;
    }
    if (target.connectionType === 'usb' || target.connectionDetails?.serialPath) {
      return 'serial';
    }
    return 'octoprint';
  };

  const [notes, setNotes] = useState(printer.notes || "");
  const [integrationType, setIntegrationType] = useState(getDefaultIntegrationType(printer));
  const [connectionDetails, setConnectionDetails] = useState({
    protocol: printer.connectionDetails?.protocol || "http",
    host: printer.connectionDetails?.host || printer.ipAddress || "",
    port: printer.connectionDetails?.port ? String(printer.connectionDetails.port) : "",
    path: printer.connectionDetails?.path || "",
    apiKey: printer.connectionDetails?.apiKey || "",
    accessToken: printer.connectionDetails?.accessToken || "",
    accessCode: printer.connectionDetails?.accessCode || printer.connectionDetails?.accessToken || "",
    deviceId: printer.connectionDetails?.deviceId || "",
    mqttPort: printer.connectionDetails?.mqttPort ? String(printer.connectionDetails.mqttPort) : "",
    mqttUsername: printer.connectionDetails?.mqttUsername || "",
    mqttPassword: printer.connectionDetails?.mqttPassword || "",
    mqttClientId: printer.connectionDetails?.mqttClientId || "",
    mqttTopicPrefix: printer.connectionDetails?.mqttTopicPrefix || "",
    mqttCommandTopic: printer.connectionDetails?.mqttCommandTopic || "",
    mqttReportTopic: printer.connectionDetails?.mqttReportTopic || "",
    mqttRejectUnauthorized: printer.connectionDetails?.mqttRejectUnauthorized ?? false,
    uploadPort: printer.connectionDetails?.uploadPort ? String(printer.connectionDetails.uploadPort) : "",
    uploadPath: printer.connectionDetails?.uploadPath || "",
    rtspPort: printer.connectionDetails?.rtspPort ? String(printer.connectionDetails.rtspPort) : "",
    rtspPath: printer.connectionDetails?.rtspPath || "",
    serialPath: printer.connectionDetails?.serialPath || "",
    baudRate: printer.connectionDetails?.baudRate ? String(printer.connectionDetails.baudRate) : "",
    commands: {
      home: printer.connectionDetails?.commands?.home || "",
      preheat: printer.connectionDetails?.commands?.preheat || "",
      cooldown: printer.connectionDetails?.commands?.cooldown || "",
    },
    firmwareCode: printer.connectionDetails?.firmwareCode || "",
    macros: printer.connectionDetails?.macros || [],
  });
  const [gcodeToSend, setGcodeToSend] = useState("");
  const [macroName, setMacroName] = useState("");
  const [gcodeHistory, setGcodeHistory] = useState<Array<{ id: string; gcode: string; sentAt: string }>>([]);
  const [isSendingGcode, setIsSendingGcode] = useState(false);
  const [terminalLines, setTerminalLines] = useState<Array<{ line: string; timestamp?: string }>>([]);
  const [isLoadingTerminal, setIsLoadingTerminal] = useState(false);
  const [followTail, setFollowTail] = useState(true);
  const [autoRefreshTerminal, setAutoRefreshTerminal] = useState(true);
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isEditingIntegration, setIsEditingIntegration] = useState(false);
  const { toast } = useToast();

  const loadHistory = (printerId: string) => {
    try {
      const raw = localStorage.getItem(`printer-gcode-history-${printerId}`);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  };

  const saveHistory = (printerId: string, history: Array<{ id: string; gcode: string; sentAt: string }>) => {
    try {
      localStorage.setItem(`printer-gcode-history-${printerId}`, JSON.stringify(history));
    } catch (error) {
      // Ignore storage errors.
    }
  };

  useEffect(() => {
    setNotes(printer.notes || "");
    setIntegrationType(getDefaultIntegrationType(printer));
    setConnectionDetails({
      protocol: printer.connectionDetails?.protocol || "http",
      host: printer.connectionDetails?.host || printer.ipAddress || "",
      port: printer.connectionDetails?.port ? String(printer.connectionDetails.port) : "",
      path: printer.connectionDetails?.path || "",
      apiKey: printer.connectionDetails?.apiKey || "",
      accessToken: printer.connectionDetails?.accessToken || "",
      accessCode: printer.connectionDetails?.accessCode || printer.connectionDetails?.accessToken || "",
      deviceId: printer.connectionDetails?.deviceId || "",
      mqttPort: printer.connectionDetails?.mqttPort ? String(printer.connectionDetails.mqttPort) : "",
      mqttUsername: printer.connectionDetails?.mqttUsername || "",
      mqttPassword: printer.connectionDetails?.mqttPassword || "",
      mqttClientId: printer.connectionDetails?.mqttClientId || "",
      mqttTopicPrefix: printer.connectionDetails?.mqttTopicPrefix || "",
      mqttCommandTopic: printer.connectionDetails?.mqttCommandTopic || "",
      mqttReportTopic: printer.connectionDetails?.mqttReportTopic || "",
      mqttRejectUnauthorized: printer.connectionDetails?.mqttRejectUnauthorized ?? false,
      uploadPort: printer.connectionDetails?.uploadPort ? String(printer.connectionDetails.uploadPort) : "",
      uploadPath: printer.connectionDetails?.uploadPath || "",
      rtspPort: printer.connectionDetails?.rtspPort ? String(printer.connectionDetails.rtspPort) : "",
      rtspPath: printer.connectionDetails?.rtspPath || "",
      serialPath: printer.connectionDetails?.serialPath || "",
      baudRate: printer.connectionDetails?.baudRate ? String(printer.connectionDetails.baudRate) : "",
      commands: {
        home: printer.connectionDetails?.commands?.home || "",
        preheat: printer.connectionDetails?.commands?.preheat || "",
        cooldown: printer.connectionDetails?.commands?.cooldown || "",
      },
      firmwareCode: printer.connectionDetails?.firmwareCode || "",
      macros: printer.connectionDetails?.macros || [],
    });
    setGcodeToSend("");
    setMacroName("");
    setIsSendingGcode(false);
    setIsEditingNotes(false);
    setIsEditingIntegration(false);
    setGcodeHistory(loadHistory(printer.id));
  }, [printer.id]);

  const suppressBusyLines = (entries: Array<{ line: string; timestamp?: string }>) => {
    const output: Array<{ line: string; timestamp?: string }> = [];
    let lastWasBusy = false;

    for (const entry of entries) {
      const normalizedLine = entry.line.trim().toLowerCase();
      const isBusy = normalizedLine === 'echo:busy: processing';
      if (isBusy && lastWasBusy) {
        continue;
      }
      output.push(entry);
      lastWasBusy = isBusy;
    }

    return output;
  };

  useEffect(() => {
    let intervalId: number | undefined;

    const fetchTerminal = async () => {
      try {
        setIsLoadingTerminal(true);
        const response = await printersApi.getTerminal(printer.id);
        const lines = response.data?.terminal || [];
        const stamped = lines.map((entry: any) => {
          if (typeof entry === "string") {
            return { line: entry, timestamp: new Date().toISOString() };
          }
          return {
            line: entry?.line || entry?.message || entry?.content || String(entry),
            timestamp: entry?.timestamp || entry?.time || new Date().toISOString(),
          };
        });
        setTerminalLines(suppressBusyLines(stamped));
      } catch (error) {
        setTerminalLines([]);
      } finally {
        setIsLoadingTerminal(false);
      }
    };

    if (isOpen) {
      fetchTerminal();
      if (autoRefreshTerminal) {
        intervalId = window.setInterval(fetchTerminal, 5000);
      }
    }

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [autoRefreshTerminal, isOpen, printer.id]);

  useEffect(() => {
    if (!followTail || !terminalRef.current) {
      return;
    }
    terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [followTail, terminalLines]);

  const handleSaveNotes = () => {
    onUpdate(printer.id, { notes });
    setIsEditingNotes(false);
    toast({
      title: "Notes saved",
      description: "Printer notes have been updated",
    });
  };

  const handleSaveIntegration = () => {
    const portValue = connectionDetails.port.trim();
    const baudRateValue = connectionDetails.baudRate.trim();
    const isSerial = integrationType === "serial";
    const isBambu = integrationType === "bambu";
    const serialPathValue = connectionDetails.serialPath.trim();
    if (isSerial && !serialPathValue) {
      toast({
        title: "Serial port required",
        description: "Enter a serial port path (e.g., COM3) before saving.",
        variant: "destructive",
      });
      return;
    }
    const mqttPortValue = connectionDetails.mqttPort.trim();
    const uploadPortValue = connectionDetails.uploadPort.trim();
    const rtspPortValue = connectionDetails.rtspPort.trim();

    const resolvedHost = isSerial ? undefined : (connectionDetails.host.trim() || printer.ipAddress || undefined);
    const details = {
      protocol: isSerial ? undefined : (connectionDetails.protocol || "http"),
      host: resolvedHost,
      port: isSerial ? undefined : (portValue ? Number(portValue) : undefined),
      path: isSerial ? undefined : (connectionDetails.path.trim() || undefined),
      apiKey: isSerial ? undefined : (connectionDetails.apiKey.trim() || undefined),
      accessToken: isSerial ? undefined : (connectionDetails.accessToken.trim() || undefined),
      accessCode: isSerial ? undefined : (connectionDetails.accessCode.trim() || undefined),
      deviceId: isSerial ? undefined : (connectionDetails.deviceId.trim() || undefined),
      mqttPort: isBambu ? (mqttPortValue ? Number(mqttPortValue) : undefined) : undefined,
      mqttUsername: isBambu ? (connectionDetails.mqttUsername.trim() || undefined) : undefined,
      mqttPassword: isBambu ? (connectionDetails.mqttPassword.trim() || undefined) : undefined,
      mqttClientId: isBambu ? (connectionDetails.mqttClientId.trim() || undefined) : undefined,
      mqttTopicPrefix: isBambu ? (connectionDetails.mqttTopicPrefix.trim() || undefined) : undefined,
      mqttCommandTopic: isBambu ? (connectionDetails.mqttCommandTopic.trim() || undefined) : undefined,
      mqttReportTopic: isBambu ? (connectionDetails.mqttReportTopic.trim() || undefined) : undefined,
      mqttRejectUnauthorized: isBambu ? connectionDetails.mqttRejectUnauthorized : undefined,
      uploadPort: isBambu ? (uploadPortValue ? Number(uploadPortValue) : undefined) : undefined,
      uploadPath: isBambu ? (connectionDetails.uploadPath.trim() || undefined) : undefined,
      rtspPort: isBambu ? (rtspPortValue ? Number(rtspPortValue) : undefined) : undefined,
      rtspPath: isBambu ? (connectionDetails.rtspPath.trim() || undefined) : undefined,
      serialPath: serialPathValue || undefined,
      baudRate: baudRateValue ? Number(baudRateValue) : undefined,
      commands: {
        home: connectionDetails.commands.home.trim() || undefined,
        preheat: connectionDetails.commands.preheat.trim() || undefined,
        cooldown: connectionDetails.commands.cooldown.trim() || undefined,
      },
      firmwareCode: connectionDetails.firmwareCode.trim() || undefined,
      macros: connectionDetails.macros.length ? connectionDetails.macros : undefined,
    };

    onUpdate(printer.id, {
      integrationType,
      connectionDetails: details,
      connectionType: isSerial ? 'usb' : printer.connectionType,
      ipAddress: isSerial ? '' : printer.ipAddress,
    });
    setIsEditingIntegration(false);
    toast({
      title: "Firmware type updated",
      description: "Printer firmware integration settings have been updated",
    });
  };

  const handleClearError = () => {
    if (onClearError) {
      onClearError(printer.id);
      toast({
        title: "Error status cleared",
        description: `${printer.name} is now online`,
      });
    }
  };

  const normalizeGcode = (value: unknown) => {
    if (Array.isArray(value)) {
      return value.map((item) => String(item)).join("\n");
    }
    if (typeof value === "string") {
      return value;
    }
    return "";
  };

  const isValidGcodeInput = (value: unknown) => {
    return typeof value === "string" || Array.isArray(value);
  };

  const handleSendGcode = async (overrideGcode?: string) => {
    const raw = typeof overrideGcode === "string" ? overrideGcode : gcodeToSend;
    if (!isValidGcodeInput(raw)) {
      toast({
        title: "Invalid G-code",
        description: "G-code must be plain text (not an object).",
        variant: "destructive",
      });
      return;
    }
    const gcode = normalizeGcode(raw);
    if (!gcode.trim()) {
      toast({
        title: "G-code required",
        description: "Enter a G-code command before sending",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSendingGcode(true);
      await printersApi.sendGcode(printer.id, gcode);
      const newEntry = {
        id: `${Date.now()}`,
        gcode,
        sentAt: new Date().toISOString(),
      };
      const updatedHistory = [newEntry, ...gcodeHistory].slice(0, 20);
      setGcodeHistory(updatedHistory);
      saveHistory(printer.id, updatedHistory);
      toast({
        title: "G-code sent",
        description: `Command sent to ${printer.name}`,
      });
      setGcodeToSend("");
    } catch (error: any) {
      toast({
        title: "Failed to send G-code",
        description: error.response?.data?.error || "Unable to send command",
        variant: "destructive",
      });
    } finally {
      setIsSendingGcode(false);
    }
  };

  const handleSaveMacro = () => {
    if (!macroName.trim() || !gcodeToSend.trim()) {
      toast({
        title: "Macro requires name and G-code",
        description: "Enter a name and G-code to save a macro",
        variant: "destructive",
      });
      return;
    }

    const normalizedName = macroName.trim();
    const existing = connectionDetails.macros.find((macro) => macro.name === normalizedName);
    const nextMacros = existing
      ? connectionDetails.macros.map((macro) =>
          macro.name === normalizedName ? { name: normalizedName, gcode: gcodeToSend } : macro
        )
      : [...connectionDetails.macros, { name: normalizedName, gcode: gcodeToSend }];

    setConnectionDetails(prev => ({ ...prev, macros: nextMacros }));
    onUpdate(printer.id, { connectionDetails: { ...connectionDetails, macros: nextMacros } });
    setMacroName("");

    toast({
      title: existing ? "Macro updated" : "Macro saved",
      description: `Saved macro "${normalizedName}"`,
    });
  };

  const handleDeleteMacro = (name: string) => {
    const nextMacros = connectionDetails.macros.filter((macro) => macro.name !== name);
    setConnectionDetails(prev => ({ ...prev, macros: nextMacros }));
    onUpdate(printer.id, { connectionDetails: { ...connectionDetails, macros: nextMacros } });
  };

  const handleSendMacro = async (gcode: string) => {
    if (!isValidGcodeInput(gcode)) {
      toast({
        title: "Invalid macro",
        description: "Macro G-code must be plain text.",
        variant: "destructive",
      });
      return;
    }
    const normalized = normalizeGcode(gcode);
    setGcodeToSend(normalized);
    await handleSendGcode(normalized);
  };

  const handleLoadMacro = (gcode: string) => {
    if (!isValidGcodeInput(gcode)) {
      toast({
        title: "Invalid macro",
        description: "Macro G-code must be plain text.",
        variant: "destructive",
      });
      return;
    }
    setGcodeToSend(normalizeGcode(gcode));
  };

  const handleClearHistory = () => {
    setGcodeHistory([]);
    saveHistory(printer.id, []);
  };

  const statusColors: Record<string, string> = {
    online: "bg-status-online",
    printing: "bg-status-printing",
    paused: "bg-status-paused",
    error: "bg-status-error",
    offline: "bg-status-offline"
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {printer.name} - Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status and Error Control */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                Status & Control
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Current Status:</span>
                  <Badge className={`text-white ${statusColors[printer.status]}`}>
                    {printer.status.charAt(0).toUpperCase() + printer.status.slice(1)}
                  </Badge>
                </div>
                {printer.status === 'error' && onClearError && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleClearError}
                    className="text-success border-success hover:bg-success hover:text-success-foreground"
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Clear Error
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Model:</span> {printer.model}
                </div>
                <div>
                  <span className="font-medium">IP Address:</span> {printer.ipAddress}
                </div>
                <div>
                  <span className="font-medium">Nozzle:</span> {printer.temperature.nozzle}°C
                </div>
                <div>
                  <span className="font-medium">Bed:</span> {printer.temperature.bed}°C
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Current Job */}
          {printer.currentJob && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Current Job</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">File:</span> {printer.currentJob.name}
                  </div>
                  <div>
                    <span className="font-medium">Progress:</span> {printer.currentJob.progress.toFixed(1)}%
                  </div>
                  <div>
                    <span className="font-medium">Time Remaining:</span> {Math.round(printer.currentJob.timeRemaining / 60)}m
                  </div>
                  <div>
                    <span className="font-medium">Filament:</span> {printer.currentJob.filament}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Notes
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditingNotes(!isEditingNotes)}
                >
                  <Edit3 className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditingNotes ? (
                <div className="space-y-2">
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add notes about this printer..."
                    rows={4}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveNotes}>
                      <Save className="h-4 w-4 mr-1" />
                      Save Notes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setNotes(printer.notes || "");
                        setIsEditingNotes(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="min-h-[100px] p-3 bg-muted rounded-lg">
                  {notes || "No notes added yet. Click the edit button to add notes."}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Firmware Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Firmware & Connection
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditingIntegration(!isEditingIntegration)}
                >
                  <Edit3 className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditingIntegration ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="integration-type">Firmware Type</Label>
                    <Select
                      value={integrationType}
                      onValueChange={(value) => {
                        const next = value as Printer["integrationType"];
                        setIntegrationType(next);
                        if (next === "serial") {
                          setConnectionDetails(prev => ({
                            ...prev,
                            protocol: "http",
                            host: "",
                            port: "",
                            path: "",
                            apiKey: "",
                            accessToken: "",
                          }));
                        }
                      }}
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

                  {integrationType !== "serial" && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="connection-protocol">Protocol</Label>
                          <Select
                            value={connectionDetails.protocol}
                            onValueChange={(value) => setConnectionDetails(prev => ({ ...prev, protocol: value }))}
                          >
                            <SelectTrigger id="connection-protocol">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="http">http</SelectItem>
                              <SelectItem value="https">https</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="connection-host">Host/IP</Label>
                          <Input
                            id="connection-host"
                            value={connectionDetails.host}
                            onChange={(e) => setConnectionDetails(prev => ({ ...prev, host: e.target.value }))}
                            placeholder="192.168.1.100"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="connection-port">Port</Label>
                          <Input
                            id="connection-port"
                            value={connectionDetails.port}
                            onChange={(e) => setConnectionDetails(prev => ({ ...prev, port: e.target.value }))}
                            placeholder="80"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="connection-path">Path</Label>
                          <Input
                            id="connection-path"
                            value={connectionDetails.path}
                            onChange={(e) => setConnectionDetails(prev => ({ ...prev, path: e.target.value }))}
                            placeholder="/"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {integrationType === "octoprint" && (
                          <div className="space-y-2">
                            <Label htmlFor="connection-api-key">API Key (OctoPrint)</Label>
                            <Input
                              id="connection-api-key"
                              value={connectionDetails.apiKey}
                              onChange={(e) => setConnectionDetails(prev => ({ ...prev, apiKey: e.target.value }))}
                              placeholder="octoprint api key"
                            />
                          </div>
                        )}
                        {integrationType === "moonraker" && (
                          <div className="space-y-2">
                            <Label htmlFor="connection-access-token">Access Token (Moonraker)</Label>
                            <Input
                              id="connection-access-token"
                              value={connectionDetails.accessToken}
                              onChange={(e) => setConnectionDetails(prev => ({ ...prev, accessToken: e.target.value }))}
                              placeholder="moonraker token"
                            />
                          </div>
                        )}
                        {integrationType === "bambu" && (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor="connection-access-code">Access Code (Bambu)</Label>
                              <Input
                                id="connection-access-code"
                                value={connectionDetails.accessCode}
                                onChange={(e) => setConnectionDetails(prev => ({ ...prev, accessCode: e.target.value }))}
                                placeholder="bambu access code"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="connection-device-id">Device ID (Bambu)</Label>
                              <Input
                                id="connection-device-id"
                                value={connectionDetails.deviceId}
                                onChange={(e) => setConnectionDetails(prev => ({ ...prev, deviceId: e.target.value }))}
                                placeholder="device id"
                              />
                            </div>
                            <div className="col-span-2 rounded-md border border-dashed border-border p-3 space-y-3">
                              <div className="text-sm font-medium">Bambu LAN Overrides (optional)</div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                  <Label htmlFor="bambu-mqtt-port">MQTT Port</Label>
                                  <Input
                                    id="bambu-mqtt-port"
                                    value={connectionDetails.mqttPort}
                                    onChange={(e) => setConnectionDetails(prev => ({ ...prev, mqttPort: e.target.value }))}
                                    placeholder="8883"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="bambu-mqtt-user">MQTT Username</Label>
                                  <Input
                                    id="bambu-mqtt-user"
                                    value={connectionDetails.mqttUsername}
                                    onChange={(e) => setConnectionDetails(prev => ({ ...prev, mqttUsername: e.target.value }))}
                                    placeholder="bblp"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="bambu-mqtt-pass">MQTT Password</Label>
                                  <Input
                                    id="bambu-mqtt-pass"
                                    value={connectionDetails.mqttPassword}
                                    onChange={(e) => setConnectionDetails(prev => ({ ...prev, mqttPassword: e.target.value }))}
                                    placeholder="access code"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="bambu-mqtt-client">MQTT Client ID</Label>
                                  <Input
                                    id="bambu-mqtt-client"
                                    value={connectionDetails.mqttClientId}
                                    onChange={(e) => setConnectionDetails(prev => ({ ...prev, mqttClientId: e.target.value }))}
                                    placeholder="custom client id"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="bambu-mqtt-prefix">MQTT Topic Prefix</Label>
                                  <Input
                                    id="bambu-mqtt-prefix"
                                    value={connectionDetails.mqttTopicPrefix}
                                    onChange={(e) => setConnectionDetails(prev => ({ ...prev, mqttTopicPrefix: e.target.value }))}
                                    placeholder="device/DEVICE_ID"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="bambu-mqtt-command">MQTT Command Topic</Label>
                                  <Input
                                    id="bambu-mqtt-command"
                                    value={connectionDetails.mqttCommandTopic}
                                    onChange={(e) => setConnectionDetails(prev => ({ ...prev, mqttCommandTopic: e.target.value }))}
                                    placeholder="device/DEVICE_ID/request"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="bambu-mqtt-report">MQTT Report Topic</Label>
                                  <Input
                                    id="bambu-mqtt-report"
                                    value={connectionDetails.mqttReportTopic}
                                    onChange={(e) => setConnectionDetails(prev => ({ ...prev, mqttReportTopic: e.target.value }))}
                                    placeholder="device/DEVICE_ID/report"
                                  />
                                </div>
                                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                                  <Label htmlFor="bambu-mqtt-verify" className="text-sm">Verify MQTT TLS</Label>
                                  <Switch
                                    id="bambu-mqtt-verify"
                                    checked={connectionDetails.mqttRejectUnauthorized}
                                    onCheckedChange={(value) =>
                                      setConnectionDetails(prev => ({ ...prev, mqttRejectUnauthorized: value }))
                                    }
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                  <Label htmlFor="bambu-upload-port">Upload Port (FTPS)</Label>
                                  <Input
                                    id="bambu-upload-port"
                                    value={connectionDetails.uploadPort}
                                    onChange={(e) => setConnectionDetails(prev => ({ ...prev, uploadPort: e.target.value }))}
                                    placeholder="990"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="bambu-upload-path">Upload Path</Label>
                                  <Input
                                    id="bambu-upload-path"
                                    value={connectionDetails.uploadPath}
                                    onChange={(e) => setConnectionDetails(prev => ({ ...prev, uploadPath: e.target.value }))}
                                    placeholder="/sdcard"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="bambu-rtsp-port">RTSP Port</Label>
                                  <Input
                                    id="bambu-rtsp-port"
                                    value={connectionDetails.rtspPort}
                                    onChange={(e) => setConnectionDetails(prev => ({ ...prev, rtspPort: e.target.value }))}
                                    placeholder="554"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="bambu-rtsp-path">RTSP Path</Label>
                                  <Input
                                    id="bambu-rtsp-path"
                                    value={connectionDetails.rtspPath}
                                    onChange={(e) => setConnectionDetails(prev => ({ ...prev, rtspPath: e.target.value }))}
                                    placeholder="/streaming"
                                  />
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}

                  {integrationType === "serial" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="serial-path">Serial Port Path</Label>
                        <Input
                          id="serial-path"
                          value={connectionDetails.serialPath}
                          onChange={(e) => setConnectionDetails(prev => ({ ...prev, serialPath: e.target.value }))}
                          placeholder="COM3 or /dev/ttyUSB0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="serial-baud">Baud Rate</Label>
                        <Input
                          id="serial-baud"
                          value={connectionDetails.baudRate}
                          onChange={(e) => setConnectionDetails(prev => ({ ...prev, baudRate: e.target.value }))}
                          placeholder="115200"
                        />
                      </div>
                    </div>
                  )}

                  <Separator />

                  <div className="space-y-3">
                    <div className="text-sm font-medium">Command Overrides (G-code)</div>
                    <div className="space-y-2">
                      <Label htmlFor="command-home">Home</Label>
                      <Textarea
                        id="command-home"
                        value={connectionDetails.commands.home}
                        onChange={(e) =>
                          setConnectionDetails(prev => ({
                            ...prev,
                            commands: { ...prev.commands, home: e.target.value }
                          }))
                        }
                        placeholder="G28"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="command-preheat">Preheat</Label>
                      <Textarea
                        id="command-preheat"
                        value={connectionDetails.commands.preheat}
                        onChange={(e) =>
                          setConnectionDetails(prev => ({
                            ...prev,
                            commands: { ...prev.commands, preheat: e.target.value }
                          }))
                        }
                        placeholder="M104 S200\nM140 S60"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="command-cooldown">Cooldown</Label>
                      <Textarea
                        id="command-cooldown"
                        value={connectionDetails.commands.cooldown}
                        onChange={(e) =>
                          setConnectionDetails(prev => ({
                            ...prev,
                            commands: { ...prev.commands, cooldown: e.target.value }
                          }))
                        }
                        placeholder="M104 S0\nM140 S0"
                        rows={2}
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor="firmware-code">Firmware Code (Klipper config or notes)</Label>
                    <Textarea
                      id="firmware-code"
                      value={connectionDetails.firmwareCode}
                      onChange={(e) =>
                        setConnectionDetails(prev => ({ ...prev, firmwareCode: e.target.value }))
                      }
                      placeholder="Paste firmware configuration or macros here..."
                      rows={6}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveIntegration}>
                      <Save className="h-4 w-4 mr-1" />
                      Save Firmware
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setIntegrationType(getDefaultIntegrationType(printer));
                        setConnectionDetails({
                          protocol: printer.connectionDetails?.protocol || "http",
                          host: printer.connectionDetails?.host || printer.ipAddress || "",
                          port: printer.connectionDetails?.port ? String(printer.connectionDetails.port) : "",
                          path: printer.connectionDetails?.path || "",
                          apiKey: printer.connectionDetails?.apiKey || "",
                          accessToken: printer.connectionDetails?.accessToken || "",
                          accessCode: printer.connectionDetails?.accessCode || printer.connectionDetails?.accessToken || "",
                          deviceId: printer.connectionDetails?.deviceId || "",
                          mqttPort: printer.connectionDetails?.mqttPort ? String(printer.connectionDetails.mqttPort) : "",
                          mqttUsername: printer.connectionDetails?.mqttUsername || "",
                          mqttPassword: printer.connectionDetails?.mqttPassword || "",
                          mqttClientId: printer.connectionDetails?.mqttClientId || "",
                          mqttTopicPrefix: printer.connectionDetails?.mqttTopicPrefix || "",
                          mqttCommandTopic: printer.connectionDetails?.mqttCommandTopic || "",
                          mqttReportTopic: printer.connectionDetails?.mqttReportTopic || "",
                          mqttRejectUnauthorized: printer.connectionDetails?.mqttRejectUnauthorized ?? false,
                          uploadPort: printer.connectionDetails?.uploadPort ? String(printer.connectionDetails.uploadPort) : "",
                          uploadPath: printer.connectionDetails?.uploadPath || "",
                          rtspPort: printer.connectionDetails?.rtspPort ? String(printer.connectionDetails.rtspPort) : "",
                          rtspPath: printer.connectionDetails?.rtspPath || "",
                          serialPath: printer.connectionDetails?.serialPath || "",
                          baudRate: printer.connectionDetails?.baudRate ? String(printer.connectionDetails.baudRate) : "",
                          commands: {
                            home: printer.connectionDetails?.commands?.home || "",
                            preheat: printer.connectionDetails?.commands?.preheat || "",
                            cooldown: printer.connectionDetails?.commands?.cooldown || "",
                          },
                          firmwareCode: printer.connectionDetails?.firmwareCode || "",
                          macros: printer.connectionDetails?.macros || [],
                        });
                        setIsEditingIntegration(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 p-3 bg-muted rounded-lg">
                  <div className="text-sm font-medium">
                    {printer.integrationType ? printer.integrationType.toUpperCase() : "Not configured"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {printer.integrationType === "serial"
                      ? (printer.connectionDetails?.serialPath || "No serial port configured")
                      : (printer.connectionDetails?.host || printer.ipAddress || "No host configured")}
                  </div>
                  {printer.connectionDetails?.firmwareCode && (
                    <pre className="whitespace-pre-wrap text-xs text-muted-foreground border border-border rounded-md p-2">
                      {printer.connectionDetails.firmwareCode}
                    </pre>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Send G-code */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Send G-code</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                value={gcodeToSend}
                onChange={(e) => setGcodeToSend(e.target.value)}
                placeholder="M105\nM114"
                rows={4}
              />
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => handleSendGcode()} disabled={isSendingGcode}>
                    {isSendingGcode ? "Sending..." : "Send"}
                  </Button>
                  <Input
                    value={macroName}
                    onChange={(e) => setMacroName(e.target.value)}
                    placeholder="Macro name"
                    className="h-9 w-40"
                  />
                  <Button size="sm" variant="outline" onClick={handleSaveMacro}>
                    Save Macro
                  </Button>
                </div>

                {connectionDetails.macros.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Saved Macros</div>
                    <div className="flex flex-col gap-2">
                      {connectionDetails.macros.map((macro) => (
                        <div key={macro.name} className="flex items-center gap-2">
                          <div className="text-sm font-medium flex-1 truncate">{macro.name}</div>
                          <Button size="sm" variant="outline" onClick={() => handleLoadMacro(macro.gcode)}>
                            Load
                          </Button>
                          <Button size="sm" onClick={() => handleSendMacro(macro.gcode)}>
                            Send
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteMacro(macro.name)}>
                            Delete
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {gcodeHistory.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Recent Commands</div>
                      <Button size="sm" variant="ghost" onClick={handleClearHistory}>
                        Clear
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {gcodeHistory.map((entry) => (
                        <div key={entry.id} className="rounded-md border border-border p-2">
                          <div className="text-xs text-muted-foreground">
                            {new Date(entry.sentAt).toLocaleString()}
                          </div>
                          <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
                            {entry.gcode}
                          </pre>
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleLoadMacro(entry.gcode)}>
                              Load
                            </Button>
                            <Button size="sm" onClick={() => handleSendMacro(entry.gcode)}>
                              Send
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Terminal Output */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                Terminal Output
                <Badge variant="outline">
                  {autoRefreshTerminal ? "Auto-refresh on" : "Auto-refresh paused"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={followTail ? "default" : "outline"}
                    onClick={() => setFollowTail((prev) => !prev)}
                  >
                    {followTail ? "Following" : "Follow Tail"}
                  </Button>
                  <Button
                    size="sm"
                    variant={autoRefreshTerminal ? "default" : "outline"}
                    onClick={() => setAutoRefreshTerminal((prev) => !prev)}
                  >
                    {autoRefreshTerminal ? "Auto Refresh" : "Paused"}
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      setIsLoadingTerminal(true);
                      const response = await printersApi.getTerminal(printer.id);
                      const lines = response.data?.terminal || [];
                      const stamped = lines.map((entry: any) => {
                        if (typeof entry === "string") {
                          return { line: entry, timestamp: new Date().toISOString() };
                        }
                        return {
                          line: entry?.line || entry?.message || entry?.content || String(entry),
                          timestamp: entry?.timestamp || entry?.time || new Date().toISOString(),
                        };
                      });
                      setTerminalLines(suppressBusyLines(stamped));
                    } catch (error) {
                      setTerminalLines([]);
                    } finally {
                      setIsLoadingTerminal(false);
                    }
                  }}
                >
                  Refresh
                  {!autoRefreshTerminal && <PauseCircle className="h-4 w-4 ml-2" />}
                </Button>
              </div>
              <div
                ref={terminalRef}
                className="border border-border rounded-md bg-muted p-2 max-h-64 overflow-y-auto"
              >
                {isLoadingTerminal ? (
                  <div className="text-sm text-muted-foreground">Loading terminal output...</div>
                ) : terminalLines.length > 0 ? (
                  <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
                    {terminalLines
                      .map((entry) => {
                        if (!entry.timestamp) {
                          return entry.line;
                        }
                        return `[${new Date(entry.timestamp).toLocaleTimeString()}] ${entry.line}`;
                      })
                      .join('\n')}
                  </pre>
                ) : (
                  <div className="text-sm text-muted-foreground">No terminal output available.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
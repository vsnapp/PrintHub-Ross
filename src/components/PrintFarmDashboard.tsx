import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrinterCard } from "./PrinterCard";
import { PrinterGroup } from "./PrinterGroup";
import { UserMenu } from "./UserMenu";
import { PrinterDetailsDialog } from "./PrinterDetailsDialog";
import { CreatePrinterDialog } from "./CreatePrinterDialog";
import { FilamentInventory } from "./FilamentInventory";
import { SlicerSection } from "./SlicerSection";
import { SchedulePanel } from "./SchedulePanel";
import { Printer, PrinterGroup as PrinterGroupType, BatchCommand, PrinterStatus, FilamentInventoryItem } from "@/types/printer";
import { filesApi, printersApi, slicersApi, workHoursApi, SlicerIdentifier } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { 
  Factory, 
  Users, 
  Activity, 
  AlertTriangle, 
  Printer as PrinterIcon,
  Play,
  Pause,
  Square,
  Home,
  Flame,
  Snowflake,
  Plus,
  Minus,
  Filter,
  Package,
  Layers,
  Calendar,
  Grid3x3
} from "lucide-react";

// Sample data - empty for production
const samplePrinters: Printer[] = [];

const sampleGroups: PrinterGroupType[] = [];

// Sample filament inventory - empty for production
const sampleFilamentInventory: FilamentInventoryItem[] = [];

export function PrintFarmDashboard() {
  const [printers, setPrinters] = useState<Printer[]>(samplePrinters);
  const [groups, setGroups] = useState<PrinterGroupType[]>(sampleGroups);
  const [filamentInventory, setFilamentInventory] = useState<FilamentInventoryItem[]>(sampleFilamentInventory);
  const [selectedPrinters, setSelectedPrinters] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'groups' | 'inventory' | 'slicer' | 'schedule'>('groups');
  const [filteredBy, setFilteredBy] = useState<PrinterStatus | 'all'>('all');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [pauseOnFilamentOut, setPauseOnFilamentOut] = useState(true);
  const [farmWorkHours, setFarmWorkHours] = useState({ start: 8, end: 18 }); // 8am to 6pm default
  const [expandedPrinter, setExpandedPrinter] = useState<string | null>(null);
  const [showCreatePrinter, setShowCreatePrinter] = useState(false);
  const [showAddPrinterDialog, setShowAddPrinterDialog] = useState(false);
  const [selectedGroupForAddPrinter, setSelectedGroupForAddPrinter] = useState<string | null>(null);
  const [showAssignSpoolDialog, setShowAssignSpoolDialog] = useState(false);
  const [selectedPrinterForSpool, setSelectedPrinterForSpool] = useState<string | null>(null);
  const [newSpoolForm, setNewSpoolForm] = useState({
    type: "PLA",
    brand: "Generic",
    color: "White",
    diameter: "1.75",
    totalCapacity: "1000",
  });
  const { toast } = useToast();

  const selectedSpoolPrinter = selectedPrinterForSpool
    ? printers.find(p => p.id === selectedPrinterForSpool)
    : null;

  const isResinType = (materialType: string) => materialType.toLowerCase().includes('resin');

  const mapPrinterFromApi = (printer: any): Printer => {
    let connectionDetails = undefined;
    if (printer.connection_details) {
      try {
        connectionDetails = typeof printer.connection_details === 'string'
          ? JSON.parse(printer.connection_details)
          : printer.connection_details;
      } catch (error) {
        connectionDetails = undefined;
      }
    }

    let slicerDefaults = undefined;
    if (printer.slicer_settings) {
      try {
        slicerDefaults = typeof printer.slicer_settings === 'string'
          ? JSON.parse(printer.slicer_settings)
          : printer.slicer_settings;
      } catch (error) {
        slicerDefaults = undefined;
      }
    }

    return {
      slicerDefaults,
      id: String(printer.id),
      name: printer.name || 'Printer',
      status: printer.status || 'offline',
      type: printer.type || 'fdm',
      temperature: { nozzle: 0, bed: 0 },
      groupIds: [],
      model: printer.model || '',
      connectionType: printer.connection_type,
      integrationType: printer.integration_type,
      connectionDetails,
      ipAddress: printer.ip_address || '',
      webcamUrl: printer.webcam_url || '',
      slicer: printer.slicer || (printer.type === 'resin' ? 'preform' : 'cura'),
      speedMultiplier: printer.speed_multiplier ?? 1.0,
      maxPrintSpeed: printer.max_print_speed ?? undefined,
      buildVolume: printer.build_volume_x
        ? {
            x: printer.build_volume_x,
            y: printer.build_volume_y,
            z: printer.build_volume_z,
          }
        : undefined,
    };
  };

  const fetchPrinters = async () => {
    try {
      const response = await printersApi.list();
      const items = response.data?.printers || [];
      setPrinters(items.map(mapPrinterFromApi));
    } catch (error: any) {
      toast({
        title: 'Failed to load printers',
        description: error.response?.data?.error || 'Unable to fetch printers',
        variant: 'destructive',
      });
    }
  };

  // Apply dark mode
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    fetchPrinters();

    // Load farm worker hours from the backend so the queue optimizer and the
    // UI stay in sync.
    workHoursApi.get()
      .then((response) => {
        setFarmWorkHours({
          start: response.data?.start_hour ?? 8,
          end: response.data?.end_hour ?? 18,
        });
      })
      .catch(() => {
        // Defaults remain if the lookup fails.
      });
  }, []);

  const handleFarmWorkHoursChange = async (hours: { start: number; end: number }) => {
    setFarmWorkHours(hours);
    try {
      await workHoursApi.update({ start_hour: hours.start, end_hour: hours.end });
      toast({
        title: 'Worker hours saved',
        description: 'The queue optimizer will use the new hours.',
      });
    } catch (error: any) {
      toast({
        title: 'Failed to save worker hours',
        description: error.response?.data?.error || 'Unable to update work hours',
        variant: 'destructive',
      });
    }
  };

  const refreshPrinterStatuses = useCallback(async () => {
    if (printers.length === 0) {
      return;
    }

    try {
      const results = await Promise.all(printers.map(async (printer) => {
        try {
          const response = await printersApi.getLiveStatus(printer.id);
          return { id: printer.id, status: response.data?.status?.status || printer.status };
        } catch {
          return null;
        }
      }));

      setPrinters(prev => prev.map((printer) => {
        const updated = results.find((result) => result?.id === printer.id);
        return updated ? { ...printer, status: updated.status } : printer;
      }));
    } catch {
      // Ignore status refresh errors.
    }
  }, [printers]);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshPrinterStatuses();
    }, 10000);

    return () => clearInterval(interval);
  }, [refreshPrinterStatuses]);

  useEffect(() => {
    if (!selectedSpoolPrinter) {
      return;
    }

    if (selectedSpoolPrinter.type === 'resin') {
      setNewSpoolForm(prev => ({
        ...prev,
        type: 'Standard Resin',
        diameter: '0',
        totalCapacity: '1000',
      }));
    } else {
      setNewSpoolForm(prev => ({
        ...prev,
        type: 'PLA',
        diameter: '1.75',
        totalCapacity: '1000',
      }));
    }
  }, [selectedSpoolPrinter?.id]);

  // Simulate filament consumption during printing
  useEffect(() => {
    const interval = setInterval(() => {
      setPrinters(prev => prev.map(printer => {
        if (printer.status === 'printing' && printer.currentJob && printer.filamentSpool) {
          // Simulate filament consumption based on print progress
          const consumptionRate = 0.5; // 0.5g per update interval
          const newUsed = Math.min(
            printer.filamentSpool.used + consumptionRate,
            printer.filamentSpool.totalCapacity
          );
          const newRemaining = printer.filamentSpool.totalCapacity - newUsed;
          
          // Update print progress (simulate)
          const newProgress = Math.min(printer.currentJob.progress + 0.1, 100);
          const newTimeRemaining = Math.max(printer.currentJob.timeRemaining - 30, 0);
          
          // Check for filament runout and auto-pause if enabled
          let newStatus: PrinterStatus = printer.status;
          if (newRemaining <= 0 && pauseOnFilamentOut && printer.status === 'printing') {
            newStatus = 'paused' as PrinterStatus;
          }
          
          return {
            ...printer,
            status: newStatus,
            filamentSpool: {
              ...printer.filamentSpool,
              used: newUsed,
              remaining: newRemaining
            },
            currentJob: {
              ...printer.currentJob,
              progress: newProgress,
              timeRemaining: newTimeRemaining,
              filamentUsed: printer.currentJob.filamentUsed + consumptionRate
            }
          };
        }
        return printer;
      }));
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [pauseOnFilamentOut]);

  const handlePrinterCommand = async (printerId: string, command: string) => {
    const printer = printers.find(p => p.id === printerId);
    try {
      switch (command) {
        case 'pause':
          await printersApi.pausePrint(printerId);
          setPrinters(prev => prev.map(p => p.id === printerId ? { ...p, status: 'paused' } : p));
          break;
        case 'resume':
          await printersApi.resumePrint(printerId);
          setPrinters(prev => prev.map(p => p.id === printerId ? { ...p, status: 'printing' } : p));
          break;
        case 'stop':
          await printersApi.cancelPrint(printerId);
          setPrinters(prev => prev.map(p => p.id === printerId ? { ...p, status: 'online', currentJob: undefined } : p));
          break;
        case 'home':
          await printersApi.sendCommand(printerId, 'home');
          break;
        case 'preheat':
          await printersApi.sendCommand(printerId, 'preheat');
          break;
        case 'cooldown':
          await printersApi.sendCommand(printerId, 'cooldown');
          setPrinters(prev => prev.map(p => p.id === printerId ? { ...p, temperature: { nozzle: 25, bed: 25 } } : p));
          break;
        default:
          toast({
            title: 'Command not wired',
            description: `${command} is not supported by the backend yet`,
          });
          return;
      }

      toast({
        title: `Command sent to ${printer?.name || 'printer'}`,
        description: `${command} command executed successfully`,
      });
    } catch (error: any) {
      toast({
        title: 'Command failed',
        description: error.response?.data?.error || 'Unable to send printer command',
        variant: 'destructive',
      });
    }
  };

  const handleBatchCommand = (groupId: string, command: BatchCommand) => {
    const group = groups.find(g => g.id === groupId);
    const groupPrinters = printers.filter(p => p.groupIds.includes(groupId));
    
    groupPrinters.forEach(printer => {
      handlePrinterCommand(printer.id, command);
    });
    
    toast({
      title: `Batch command sent to ${group?.name}`,
      description: `${command} command sent to ${groupPrinters.length} printers`,
    });
  };

  const handleBatchSelectedCommand = (command: BatchCommand) => {
    selectedPrinters.forEach(printerId => {
      handlePrinterCommand(printerId, command);
    });
    
    toast({
      title: `Batch command sent`,
      description: `${command} command sent to ${selectedPrinters.length} selected printers`,
    });
  };

  const togglePrinterSelection = (printerId: string) => {
    setSelectedPrinters(prev => 
      prev.includes(printerId) 
        ? prev.filter(id => id !== printerId)
        : [...prev, printerId]
    );
  };

  const toggleGroupExpansion = (groupId: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const handleNewSpool = (printerId: string) => {
    setPrinters(prev => prev.map(printer => {
      if (printer.id === printerId && printer.filamentSpool) {
        return {
          ...printer,
          filamentSpool: {
            ...printer.filamentSpool,
            used: 0,
            remaining: printer.filamentSpool.totalCapacity
          }
        };
      }
      return printer;
    }));
    
    const printer = printers.find(p => p.id === printerId);
    toast({
      title: `New spool loaded for ${printer?.name}`,
      description: `Filament usage reset to 0g`,
    });
  };

  const handleAssignSpool = (printerId: string) => {
    setSelectedPrinterForSpool(printerId);
    setShowAssignSpoolDialog(true);
  };

  const handleQuickAddSpool = () => {
    if (!selectedPrinterForSpool) {
      return;
    }

    const capacity = Number(newSpoolForm.totalCapacity);
    const diameter = Number(newSpoolForm.diameter);
    if (!newSpoolForm.type.trim() || !newSpoolForm.brand.trim() || !newSpoolForm.color.trim()) {
      toast({
        title: "Missing spool details",
        description: "Type, brand, and color are required",
        variant: "destructive",
      });
      return;
    }

    const isResinPrinter = selectedSpoolPrinter?.type === 'resin';
    const diameterValue = isResinPrinter ? 0 : diameter;

    if (!Number.isFinite(capacity) || capacity <= 0 || (!isResinPrinter && (!Number.isFinite(diameter) || diameter <= 0))) {
      toast({
        title: "Invalid spool values",
        description: "Capacity and diameter must be positive numbers",
        variant: "destructive",
      });
      return;
    }

    const filamentIsResin = isResinType(newSpoolForm.type.trim());
    if (isResinPrinter && !filamentIsResin) {
      toast({
        title: "Incompatible material",
        description: "Only resin materials can be assigned to resin printers",
        variant: "destructive",
      });
      return;
    }
    if (!isResinPrinter && filamentIsResin) {
      toast({
        title: "Incompatible material",
        description: "Resin materials cannot be assigned to FDM printers",
        variant: "destructive",
      });
      return;
    }

    const newId = `fil-${Date.now()}`;
    const newFilament: FilamentInventoryItem = {
      id: newId,
      type: newSpoolForm.type.trim(),
      brand: newSpoolForm.brand.trim(),
      color: newSpoolForm.color.trim(),
      diameter: diameterValue,
      totalCapacity: capacity,
      used: 0,
      remaining: capacity,
      status: 'new',
    };

    setFilamentInventory(prev => [...prev, newFilament]);

    handleLoadFilamentToPrinter(newId, selectedPrinterForSpool);
    setShowAssignSpoolDialog(false);
    setSelectedPrinterForSpool(null);
    setNewSpoolForm({
      type: "PLA",
      brand: "Generic",
      color: "White",
      diameter: "1.75",
      totalCapacity: "1000",
    });
  };

  const handleCreateGroup = () => {
    const newGroup: PrinterGroupType = {
      id: `group-${Date.now()}`,
      name: `New Group ${groups.length + 1}`,
      printerIds: [],
      color: '#6366f1'
    };
    setGroups(prev => [...prev, newGroup]);
    setExpandedGroups(prev => [...prev, newGroup.id]);
    toast({
      title: "New group created",
      description: `${newGroup.name} has been added`,
    });
  };

  const handleDeleteGroup = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (group && group.printerIds.length > 0) {
      toast({
        title: "Cannot delete group",
        description: "Remove all printers from the group first",
        variant: "destructive",
      });
      return;
    }
    setGroups(prev => prev.filter(g => g.id !== groupId));
    setExpandedGroups(prev => prev.filter(id => id !== groupId));
    toast({
      title: "Group deleted",
      description: `${group?.name} has been removed`,
    });
  };

  const handleAddPrinterToGroup = (groupId: string) => {
    setSelectedGroupForAddPrinter(groupId);
    setShowAddPrinterDialog(true);
  };

  const addSelectedPrinterToGroup = (printerId: string) => {
    if (!selectedGroupForAddPrinter) return;
    
    const group = groups.find(g => g.id === selectedGroupForAddPrinter);
    const printer = printers.find(p => p.id === printerId);
    
    if (!group || !printer) return;
    
    // Check if printer is already in this group
    if (printer.groupIds.includes(selectedGroupForAddPrinter)) {
      toast({
        title: "Printer already in group",
        description: `${printer.name} is already in ${group.name}`,
        variant: "destructive",
      });
      return;
    }
    
    const updatedPrinter = {
      ...printer,
      groupIds: [...printer.groupIds, selectedGroupForAddPrinter]
    };
    
    setPrinters(prev => prev.map(p => p.id === printerId ? updatedPrinter : p));
    setGroups(prev => prev.map(g => 
      g.id === selectedGroupForAddPrinter 
        ? { ...g, printerIds: [...g.printerIds, printerId] }
        : g
    ));
    
    setShowAddPrinterDialog(false);
    setSelectedGroupForAddPrinter(null);
    
    toast({
      title: "Printer added to group",
      description: `${printer.name} added to ${group.name}`,
    });
  };

  const handleRemovePrinterFromGroup = (groupId: string, printerId: string) => {
    const group = groups.find(g => g.id === groupId);
    const printer = printers.find(p => p.id === printerId);
    
    setGroups(prev => prev.map(g => 
      g.id === groupId 
        ? { ...g, printerIds: g.printerIds.filter(id => id !== printerId) }
        : g
    ));
    
    setPrinters(prev => prev.map(p => 
      p.id === printerId 
        ? { ...p, groupIds: p.groupIds.filter(id => id !== groupId) }
        : p
    ));
    
    toast({
      title: "Printer removed from group",
      description: `${printer?.name} removed from ${group?.name}`,
    });
  };

  const handleEditGroup = (groupId: string, newName: string, newColor: string) => {
    setGroups(prev => prev.map(group =>
      group.id === groupId
        ? { ...group, name: newName, color: newColor }
        : group
    ));
    
    toast({
      title: "Group updated",
      description: `Group renamed to ${newName}`,
    });
  };

  const handleEditPrinterName = (printerId: string, newName: string) => {
    handleUpdatePrinter(printerId, { name: newName });
  };

  const handleSetPrinterError = async (printerId: string) => {
    try {
      await printersApi.updateStatus(printerId, 'error');
      setPrinters(prev => prev.map(printer =>
        printer.id === printerId
          ? { ...printer, status: 'error' as PrinterStatus }
          : printer
      ));

      const printer = printers.find(p => p.id === printerId);
      toast({
        title: "Printer status changed",
        description: `${printer?.name} set to error state`,
        variant: "destructive",
      });
    } catch (error: any) {
      toast({
        title: 'Failed to update status',
        description: error.response?.data?.error || 'Unable to set error status',
        variant: 'destructive',
      });
    }
  };

  const handleCreatePrinter = async (printerData?: Omit<Printer, 'id'>) => {
    if (!printerData) {
      setShowCreatePrinter(true);
      return;
    }

    try {
      const response = await printersApi.create({
        name: printerData.name,
        type: printerData.type,
        model: printerData.model,
        slicer: printerData.slicer,
        status: printerData.status,
        ip_address: printerData.ipAddress,
        webcam_url: printerData.webcamUrl,
        connection_type: printerData.connectionType,
        integration_type: printerData.integrationType,
        connection_details: printerData.connectionDetails,
        slicer_settings: printerData.slicerDefaults,
        speed_multiplier: printerData.speedMultiplier,
        max_print_speed: printerData.maxPrintSpeed,
        build_volume_x: printerData.buildVolume?.x,
        build_volume_y: printerData.buildVolume?.y,
        build_volume_z: printerData.buildVolume?.z,
      });

      const created = response.data?.printer;
      if (!created) {
        throw new Error('Printer creation failed');
      }

      const mapped = mapPrinterFromApi(created);
      setPrinters(prev => [...prev, mapped]);
      toast({
        title: "New printer added",
        description: `${mapped.name} has been created`,
      });
    } catch (error: any) {
      toast({
        title: 'Failed to create printer',
        description: error.response?.data?.error || 'Unable to create printer',
        variant: 'destructive',
      });
    }
  };

  const handleClearError = async (printerId: string) => {
    try {
      await printersApi.updateStatus(printerId, 'online');
      setPrinters(prev => prev.map(printer =>
        printer.id === printerId
          ? { ...printer, status: 'online' as PrinterStatus }
          : printer
      ));

      const printer = printers.find(p => p.id === printerId);
      toast({
        title: "Error cleared",
        description: `${printer?.name} is now online`,
      });
    } catch (error: any) {
      toast({
        title: 'Failed to update status',
        description: error.response?.data?.error || 'Unable to clear error status',
        variant: 'destructive',
      });
    }
  };

  const handleUpdatePrinter = async (printerId: string, updates: Partial<Printer>) => {
    const apiUpdates: any = {};
    const localUpdates: Partial<Printer> = { ...updates };

    const detailsHost = typeof updates.connectionDetails?.host === 'string'
      ? updates.connectionDetails.host.trim()
      : '';
    if (detailsHost && updates.ipAddress === undefined) {
      apiUpdates.ip_address = detailsHost;
      localUpdates.ipAddress = detailsHost;
    }

    if (updates.name !== undefined) {
      apiUpdates.name = updates.name;
    }
    if (updates.ipAddress !== undefined) {
      apiUpdates.ip_address = updates.ipAddress;
    }
    if (updates.webcamUrl !== undefined) {
      apiUpdates.webcam_url = updates.webcamUrl;
    }
    if (updates.connectionType !== undefined) {
      apiUpdates.connection_type = updates.connectionType;
    }
    if (updates.integrationType !== undefined) {
      apiUpdates.integration_type = updates.integrationType;
    }
    if (updates.connectionDetails !== undefined) {
      apiUpdates.connection_details = updates.connectionDetails;
    }

    try {
      if (Object.keys(apiUpdates).length > 0) {
        await printersApi.update(printerId, apiUpdates);
      }

      setPrinters(prev => prev.map(printer =>
        printer.id === printerId
          ? { ...printer, ...localUpdates }
          : printer
      ));

      if (updates.name) {
        toast({
          title: 'Printer updated',
          description: `Printer renamed to ${updates.name}`,
        });
      }
    } catch (error: any) {
      toast({
        title: 'Update failed',
        description: error.response?.data?.error || 'Unable to update printer',
        variant: 'destructive',
      });
    }
  };

  // Statistics
  const totalPrinters = printers.length;
  const onlinePrinters = printers.filter(p => p.status !== 'offline').length;
  const printingPrinters = printers.filter(p => p.status === 'printing').length;
  const errorPrinters = printers.filter(p => p.status === 'error').length;

  // Filtered printers for display
  const getFilteredPrinters = () => {
    let filtered = printers;
    
    // Filter by status
    if (filteredBy !== 'all') {
      if (filteredBy === 'online') {
        filtered = filtered.filter(p => p.status !== 'offline');
      } else {
        filtered = filtered.filter(p => p.status === filteredBy);
      }
    }
    
    // Filter by group in grid view
    if (viewMode === 'grid' && selectedGroup !== 'all') {
      filtered = filtered.filter(p => p.groupIds.includes(selectedGroup));
    }
    
    return filtered;
  };

  const filteredPrinters = getFilteredPrinters();

  // Filament inventory handlers
  const handleAddFilament = (filament: Omit<FilamentInventoryItem, 'id'>) => {
    const newFilament: FilamentInventoryItem = {
      ...filament,
      id: `fil-${Date.now()}`
    };
    setFilamentInventory(prev => [...prev, newFilament]);
  };

  const handleUpdateFilament = (id: string, updates: Partial<FilamentInventoryItem>) => {
    setFilamentInventory(prev => prev.map(item =>
      item.id === id ? { ...item, ...updates } : item
    ));
  };

  const handleDeleteFilament = (id: string) => {
    setFilamentInventory(prev => prev.filter(item => item.id !== id));
    toast({
      title: "Filament deleted",
      description: "Filament spool has been removed from inventory",
    });
  };

  const handleLoadFilamentToPrinter = (filamentId: string, printerId: string) => {
    const filament = filamentInventory.find(f => f.id === filamentId);
    const printer = printers.find(p => p.id === printerId);
    
    if (filament && printer) {
      const filamentIsResin = isResinType(filament.type);
      if (printer.type === 'resin' && !filamentIsResin) {
        toast({
          title: "Incompatible material",
          description: "Only resin materials can be assigned to resin printers",
          variant: "destructive",
        });
        return;
      }
      if (printer.type === 'fdm' && filamentIsResin) {
        toast({
          title: "Incompatible material",
          description: "Resin materials cannot be assigned to FDM printers",
          variant: "destructive",
        });
        return;
      }

      // Update printer with new filament
      setPrinters(prev => prev.map(p =>
        p.id === printerId
          ? {
              ...p,
              filamentSpool: {
                id: filament.id,
                type: filament.type,
                color: filament.color,
                brand: filament.brand,
                totalCapacity: filament.totalCapacity,
                used: filament.used,
                remaining: filament.remaining
              }
            }
          : p
      ));

      // Update filament status if it was new
      if (filament.status === 'new' && filament.used === 0) {
        handleUpdateFilament(filamentId, { status: 'partially-used' });
      }
    }
  };

  const fileToBase64 = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
  };

  /**
   * Register sliced gcode with the backend so it can be sent to printers.
   */
  const uploadGcodeContent = async (gcodeContent: string, fileName: string): Promise<number | undefined> => {
    try {
      const gcodeFile = new File([gcodeContent], fileName, { type: 'text/plain' });
      const response = await filesApi.upload(gcodeFile);
      return response.data?.id;
    } catch {
      return undefined;
    }
  };

  const handleSliceFile = async (
    file: File,
    selectedPrinterIds: string[],
    selectedGroupIds: string[],
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
  ) => {
    const selectedSlicer = jobConfig.slicer;

    // Prefer slicing with the locally-installed slicer (desktop app), fall
    // back to the server-side embedded slicing engine.
    let useLocal = false;
    if (window.electron) {
      try {
        const available = await window.electron.getAvailableSlicers();
        const installed = new Set((available.slicers || []).map((slicer) => slicer.name));
        useLocal = installed.has(selectedSlicer);
      } catch {
        useLocal = false;
      }
    }

    toast({
      title: useLocal ? 'Slicing locally' : 'Slicing on server',
      description: `Processing ${file.name} with ${selectedSlicer}...`,
    });

    try {
      if (useLocal && window.electron) {
        const stlBase64 = await fileToBase64(file);
        const result = await window.electron.sliceLocalFile({
          slicer: selectedSlicer,
          stlName: file.name,
          stlBase64,
          overrides: jobConfig.overrides,
        });

        if (!result.success) {
          toast({
            title: 'Local slicing failed',
            description: (result as { error?: string }).error || 'Unknown slicing error',
            variant: 'destructive',
          });
          return null;
        }

        const gcodeFileId = await uploadGcodeContent(result.gcodeContent, result.gcodeFileName);
        return {
          gcodeContent: result.gcodeContent,
          gcodeFileName: result.gcodeFileName,
          estimatedPrintTimeSeconds: result.estimatedPrintTimeSeconds,
          gcodeFileId,
        };
      }

      // Server-side slicing: upload the STL, slice with the embedded engine,
      // then pull the gcode back for preview.
      const uploadResponse = await filesApi.upload(file);
      const stlFileId = uploadResponse.data?.id;
      const sliceResponse = await slicersApi.slice({
        file_id: stlFileId,
        slicer: selectedSlicer,
        printer_id: selectedPrinterIds[0],
        overrides: jobConfig.overrides,
      });

      const data = sliceResponse.data;
      if (data?.method === 'estimate') {
        toast({
          title: 'Estimate only',
          description: data.message || 'This target requires PreForm for final slicing.',
        });
        return null;
      }

      let gcodeContent = '';
      try {
        const download = await filesApi.download(data.gcode_file_id);
        gcodeContent = await (download.data as Blob).text();
      } catch {
        // Preview is optional; printing uses the server-side file id.
      }

      if (data.engine_fallback) {
        toast({
          title: 'Sliced with fallback engine',
          description: `${data.requested_slicer} CLI was unavailable; used ${data.slicer} instead.`,
        });
      }

      return {
        gcodeContent,
        gcodeFileName: data.gcode_file_name,
        estimatedPrintTimeSeconds: (data.estimated_time_minutes || 0) * 60,
        gcodeFileId: data.gcode_file_id,
      };
    } catch (error: any) {
      toast({
        title: 'Slicing failed',
        description: error.response?.data?.error || error?.message || 'Unexpected slicing error',
        variant: 'destructive',
      });
      return null;
    }
  };

  /**
   * Resolve the full target printer list (individual + group members).
   */
  const resolveTargetPrinterIds = (selectedPrinterIds: string[], selectedGroupIds: string[]): string[] => {
    const ids = new Set(selectedPrinterIds);
    for (const groupId of selectedGroupIds) {
      const group = groups.find(g => g.id === groupId);
      group?.printerIds.forEach(id => ids.add(id));
    }
    return Array.from(ids);
  };

  /**
   * Start a print of an already-registered gcode file on the selected printers.
   */
  const handleStartPrints = async (fileId: number, selectedPrinterIds: string[], selectedGroupIds: string[]) => {
    const targetIds = resolveTargetPrinterIds(selectedPrinterIds, selectedGroupIds);
    if (targetIds.length === 0) {
      toast({
        title: 'No printers selected',
        description: 'Select at least one printer or group',
        variant: 'destructive',
      });
      return;
    }

    let started = 0;
    const failures: string[] = [];
    for (const printerId of targetIds) {
      const printer = printers.find(p => p.id === printerId);
      try {
        await printersApi.startPrint(printerId, { file_id: fileId });
        started += 1;
        setPrinters(prev => prev.map(p => p.id === printerId ? { ...p, status: 'printing' } : p));
      } catch (error: any) {
        failures.push(`${printer?.name || printerId}: ${error.response?.data?.error || 'failed'}`);
      }
    }

    if (started > 0) {
      toast({
        title: `Print started on ${started} printer${started === 1 ? '' : 's'}`,
        description: failures.length > 0 ? `Failed: ${failures.join('; ')}` : undefined,
      });
    } else {
      toast({
        title: 'Failed to start prints',
        description: failures.join('; ') || 'No printers accepted the job',
        variant: 'destructive',
      });
    }
  };

  const handleUploadGcode = async (file: File, selectedPrinterIds: string[], selectedGroupIds: string[]) => {
    try {
      const response = await filesApi.upload(file);
      const fileId = response.data?.id;
      if (!fileId) {
        throw new Error('Upload failed');
      }
      await handleStartPrints(fileId, selectedPrinterIds, selectedGroupIds);
    } catch (error: any) {
      toast({
        title: 'Gcode upload failed',
        description: error.response?.data?.error || error?.message || 'Unable to upload gcode',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black">
              Print<span className="text-primary">Hub</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'groups' ? 'default' : 'outline'}
                onClick={() => setViewMode('groups')}
              >
                <Users className="h-4 w-4 mr-2" />
                Groups
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                onClick={() => setViewMode('grid')}
              >
                <PrinterIcon className="h-4 w-4 mr-2" />
                Grid
              </Button>
              <Button
                variant={viewMode === 'inventory' ? 'default' : 'outline'}
                onClick={() => setViewMode('inventory')}
              >
                <Package className="h-4 w-4 mr-2" />
                Inventory
              </Button>
              <Button
                variant={viewMode === 'slicer' ? 'default' : 'outline'}
                onClick={() => setViewMode('slicer')}
              >
                <Layers className="h-4 w-4 mr-2" />
                Slicer
              </Button>
              <Button
                variant={viewMode === 'schedule' ? 'default' : 'outline'}
                onClick={() => setViewMode('schedule')}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Schedule
              </Button>
            </div>
            <UserMenu
              isDarkMode={isDarkMode}
              onThemeChange={setIsDarkMode}
              pauseOnFilamentOut={pauseOnFilamentOut}
              onPauseOnFilamentOutChange={setPauseOnFilamentOut}
              farmWorkHours={farmWorkHours}
              onFarmWorkHoursChange={handleFarmWorkHoursChange}
            />
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${
              filteredBy === 'all' ? 'ring-2 ring-primary' : ''
            }`}
            onClick={() => setFilteredBy('all')}
          >
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Printers</p>
                <p className="text-2xl font-bold">{totalPrinters}</p>
              </div>
              <Factory className="h-8 w-8 text-muted-foreground" />
            </CardContent>
          </Card>
          
          <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${
              filteredBy === 'online' ? 'ring-2 ring-primary' : ''
            }`}
            onClick={() => setFilteredBy('online')}
          >
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm text-muted-foreground">Online</p>
                <p className="text-2xl font-bold text-status-online">{onlinePrinters}</p>
              </div>
              <Activity className="h-8 w-8 text-status-online" />
            </CardContent>
          </Card>
          
          <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${
              filteredBy === 'printing' ? 'ring-2 ring-primary' : ''
            }`}
            onClick={() => setFilteredBy('printing')}
          >
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm text-muted-foreground">Printing</p>
                <p className="text-2xl font-bold text-status-printing">{printingPrinters}</p>
              </div>
              <Play className="h-8 w-8 text-status-printing" />
            </CardContent>
          </Card>
          
          <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${
              filteredBy === 'error' ? 'ring-2 ring-primary' : ''
            }`}
            onClick={() => setFilteredBy('error')}
          >
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm text-muted-foreground">Errors</p>
                <p className="text-2xl font-bold text-status-error">{errorPrinters}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-status-error" />
            </CardContent>
          </Card>
        </div>

        {/* Selected Printers Batch Controls */}
        {selectedPrinters.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Selected Printers ({selectedPrinters.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleBatchSelectedCommand('pause')}
                >
                  <Pause className="h-4 w-4 mr-1" />
                  Pause Selected
                </Button>
                
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleBatchSelectedCommand('resume')}
                >
                  <Play className="h-4 w-4 mr-1" />
                  Resume Selected
                </Button>
                
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleBatchSelectedCommand('stop')}
                >
                  <Square className="h-4 w-4 mr-1" />
                  Stop Selected
                </Button>
                
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleBatchSelectedCommand('home')}
                >
                  <Home className="h-4 w-4 mr-1" />
                  Home Selected
                </Button>
                
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleBatchSelectedCommand('preheat')}
                >
                  <Flame className="h-4 w-4 mr-1" />
                  Preheat Selected
                </Button>
                
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleBatchSelectedCommand('cooldown')}
                >
                  <Snowflake className="h-4 w-4 mr-1" />
                  Cool Selected
                </Button>
                
                <Separator orientation="vertical" className="h-8" />
                
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={() => setSelectedPrinters([])}
                >
                  Clear Selection
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Groups View */}
        {viewMode === 'groups' && (
          <div className="space-y-4">
            {/* Group Management */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Group Management</h3>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleCreatePrinter()}
                      variant="outline"
                      className="flex items-center gap-1"
                    >
                      <Plus className="h-4 w-4" />
                      Create Printer
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleCreateGroup}
                      className="flex items-center gap-1"
                    >
                      <Plus className="h-4 w-4" />
                      Create Group
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {groups.map(group => (
              <PrinterGroup
                key={group.id}
                group={group}
                printers={filteredPrinters}
                onBatchCommand={handleBatchCommand}
                onToggleExpanded={toggleGroupExpansion}
                isExpanded={expandedGroups.includes(group.id)}
                selectedPrinters={selectedPrinters}
                onAddPrinter={handleAddPrinterToGroup}
                onRemovePrinter={handleRemovePrinterFromGroup}
                onDeleteGroup={handleDeleteGroup}
                onEditGroup={handleEditGroup}
              />
            ))}
          </div>
        )}

        {/* Grid View */}
        {viewMode === 'grid' && (
          <div className="space-y-4">
            {/* Grid Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Grid Filters</h3>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleCreatePrinter()}
                      variant="outline"
                      className="flex items-center gap-1"
                    >
                      <Plus className="h-4 w-4" />
                      Create Printer
                    </Button>
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Filter by group" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Groups</SelectItem>
                        {groups.map(group => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPrinters.map(printer => (
                <PrinterCard
                  key={printer.id}
                  printer={printer}
                  onCommand={handlePrinterCommand}
                  onNewSpool={handleNewSpool}
                  onAssignSpool={handleAssignSpool}
                  onSetError={handleSetPrinterError}
                  onEditName={handleEditPrinterName}
                  onClearError={handleClearError}
                  onExpand={setExpandedPrinter}
                  isSelected={selectedPrinters.includes(printer.id)}
                  onSelect={togglePrinterSelection}
                />
              ))}
            </div>
          </div>
        )}

        {/* Filament Inventory View */}
        {viewMode === 'inventory' && (
          <FilamentInventory
            inventory={filamentInventory}
            printers={printers}
            onAddFilament={handleAddFilament}
            onUpdateFilament={handleUpdateFilament}
            onDeleteFilament={handleDeleteFilament}
            onLoadFilamentToPrinter={handleLoadFilamentToPrinter}
          />
        )}

        {/* Slicer View */}
        {viewMode === 'slicer' && (
          <SlicerSection 
            printers={printers} 
            groups={groups} 
            onSliceFile={handleSliceFile} 
            onUploadGcode={handleUploadGcode}
            onStartPrints={handleStartPrints}
          />
        )}

        {/* Schedule View */}
        {viewMode === 'schedule' && (
          <SchedulePanel />
        )}

        {/* Printer Details Dialog */}
        {expandedPrinter && (
          <PrinterDetailsDialog
            printer={printers.find(p => p.id === expandedPrinter)!}
            isOpen={!!expandedPrinter}
            onClose={() => setExpandedPrinter(null)}
            onUpdate={handleUpdatePrinter}
            onClearError={handleClearError}
          />
        )}

        {/* Create Printer Dialog */}
        <CreatePrinterDialog
          isOpen={showCreatePrinter}
          onClose={() => setShowCreatePrinter(false)}
          onCreate={handleCreatePrinter}
        />

        {/* Add Printer to Group Dialog */}
        <Dialog open={showAddPrinterDialog} onOpenChange={setShowAddPrinterDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Printer to Group</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium mb-2">
                  Select a printer to add to "{groups.find(g => g.id === selectedGroupForAddPrinter)?.name}":
                </div>
                <div className="space-y-2">
                  {printers
                    .filter(p => !p.groupIds.includes(selectedGroupForAddPrinter || ''))
                    .map(printer => (
                      <Button
                        key={printer.id}
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => addSelectedPrinterToGroup(printer.id)}
                      >
                        <PrinterIcon className="h-4 w-4 mr-2" />
                        <div className="text-left">
                          <div className="font-medium">{printer.name}</div>
                          <div className="text-sm text-muted-foreground">{printer.model}</div>
                        </div>
                        <Badge variant={printer.status === 'online' ? 'default' : 'secondary'} className="ml-auto">
                          {printer.status}
                        </Badge>
                      </Button>
                    ))}
                  {printers.filter(p => !p.groupIds.includes(selectedGroupForAddPrinter || '')).length === 0 && (
                    <div className="text-center text-muted-foreground py-4">
                      No printers available to add to this group
                    </div>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Assign Spool Dialog */}
        <Dialog open={showAssignSpoolDialog} onOpenChange={setShowAssignSpoolDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign Filament Spool</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {filamentInventory.length > 0 ? (
                filamentInventory
                  .filter((filament) => {
                    if (!selectedSpoolPrinter) {
                      return true;
                    }
                    const filamentIsResin = isResinType(filament.type);
                    return selectedSpoolPrinter.type === 'resin' ? filamentIsResin : !filamentIsResin;
                  })
                  .map((filament) => (
                  <Button
                    key={filament.id}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      if (!selectedPrinterForSpool) {
                        return;
                      }
                      handleLoadFilamentToPrinter(filament.id, selectedPrinterForSpool);
                      setShowAssignSpoolDialog(false);
                      setSelectedPrinterForSpool(null);
                    }}
                  >
                    <Package className="h-4 w-4 mr-2" />
                    <div className="text-left">
                      <div className="font-medium">{filament.brand} {filament.color} {filament.type}</div>
                      <div className="text-xs text-muted-foreground">
                        Remaining: {filament.remaining}{selectedSpoolPrinter?.type === 'resin' ? 'ml' : 'g'}
                      </div>
                    </div>
                  </Button>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">
                  No filament spools available. Add one in the inventory first.
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="text-sm font-medium">Quick Add Spool</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="quick-spool-type">Type</Label>
                  <Input
                    id="quick-spool-type"
                    value={newSpoolForm.type}
                    onChange={(e) => setNewSpoolForm(prev => ({ ...prev, type: e.target.value }))}
                    placeholder={selectedSpoolPrinter?.type === 'resin' ? 'Standard Resin' : 'PLA'}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-spool-brand">Brand</Label>
                  <Input
                    id="quick-spool-brand"
                    value={newSpoolForm.brand}
                    onChange={(e) => setNewSpoolForm(prev => ({ ...prev, brand: e.target.value }))}
                    placeholder="Generic"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-spool-color">Color</Label>
                  <Input
                    id="quick-spool-color"
                    value={newSpoolForm.color}
                    onChange={(e) => setNewSpoolForm(prev => ({ ...prev, color: e.target.value }))}
                    placeholder="White"
                  />
                </div>
                {selectedSpoolPrinter?.type !== 'resin' && (
                  <div className="space-y-2">
                    <Label htmlFor="quick-spool-diameter">Diameter (mm)</Label>
                    <Input
                      id="quick-spool-diameter"
                      value={newSpoolForm.diameter}
                      onChange={(e) => setNewSpoolForm(prev => ({ ...prev, diameter: e.target.value }))}
                      placeholder="1.75"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="quick-spool-capacity">
                    Capacity ({selectedSpoolPrinter?.type === 'resin' ? 'ml' : 'g'})
                  </Label>
                  <Input
                    id="quick-spool-capacity"
                    value={newSpoolForm.totalCapacity}
                    onChange={(e) => setNewSpoolForm(prev => ({ ...prev, totalCapacity: e.target.value }))}
                    placeholder="1000"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={handleQuickAddSpool}>
                  Add & Assign
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
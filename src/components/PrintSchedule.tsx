import { useState, useCallback } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Plus, CheckCircle, XCircle, BarChart3, Edit3, Clock, Sparkles, Settings, Upload } from "lucide-react";
import { DailyPrintQueue } from "./DailyPrintQueue";
import { OptimizedScheduleTimeline } from "./OptimizedScheduleTimeline";
import { formatPrintTime, parseGCodeFile } from "../utils/gcodeParser";
import { useToast } from "@/components/ui/use-toast";
import { optimizeQueue, WorkHours, PrintJob as OptPrintJob, PrinterSchedule as OptPrinterSchedule } from "@/utils/queueOptimizer";
import { scheduleJobs, SchedulerResult } from "@/utils/printScheduler";


interface PrintOrder {
  id: string;
  name: string;
  deadline: Date;
  totalParts: number;
  partsPerPrint: number;
  completedPrints: number;
  failedPrints: number;
  assignedPrinter?: string;
  status: 'pending' | 'in-progress' | 'completed' | 'overdue';
  printTimeMinutes: number; // default print time per job in minutes
  printerSpecificTimes: { [printerId: string]: number }; // printer-specific print times
  scheduledStartTime?: Date; // When the job is scheduled to start
  scheduledEndTime?: Date; // When the job is scheduled to end
  isScheduled?: boolean; // Whether this job has been scheduled
  hasConflict?: boolean; // Whether this job conflicts with another
}

interface SimplePrinter {
  id: string;
  name: string;
  type: 'fdm' | 'resin';
  slicer?: 'cura' | 'orca' | 'prusa' | 'bambu' | 'preform';
  speedMultiplier?: number;
  dailyOperatingHours: number; // how many hours per day this printer operates
}

interface PrinterGroup {
  id: string;
  name: string;
  printerIds: string[];
  color: string;
}

interface PrintScheduleProps {
  printers: SimplePrinter[];
  groups: PrinterGroup[];
  initialWorkHours?: WorkHours;
  onWorkHoursChange?: (hours: WorkHours) => void;
}

export function PrintSchedule({ printers, groups, initialWorkHours, onWorkHoursChange }: PrintScheduleProps) {
  // Constants
  const OVERNIGHT_PRINT_THRESHOLD_MINUTES = 720; // 12 hours
  
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  
  // Sample orders - empty for production
  const [orders, setOrders] = useState<PrintOrder[]>([]);
  const [isAddOrderOpen, setIsAddOrderOpen] = useState(false);
  const [newOrder, setNewOrder] = useState({
    name: '',
    deadline: new Date(),
    totalParts: 1,
    partsPerPrint: 1,
    assignedGroup: 'none',
    assignedPrinter: 'none',
    printTimeMinutes: 60 // 1 hour default
  });
  const [editingOrder, setEditingOrder] = useState<string | null>(null);
  
  // Queue optimization settings
  const [farmWorkHours, setFarmWorkHours] = useState<WorkHours>(initialWorkHours || { start: 8, end: 18 }); // 8am to 6pm default
  const [showOptimizedSchedule, setShowOptimizedSchedule] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<ReturnType<typeof optimizeQueue> | null>(null);
  const [isWorkHoursDialogOpen, setIsWorkHoursDialogOpen] = useState(false);
  const [autoOptimize, setAutoOptimize] = useState(true); // Auto-optimize on new jobs
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  
  // Print scheduling state
  const [schedulerResult, setSchedulerResult] = useState<SchedulerResult | null>(null);
  const [unschedulableJobs, setUnschedulableJobs] = useState<SchedulerResult['unschedulable']>([]);
  const [showUnschedulableAlerts, setShowUnschedulableAlerts] = useState(false);

  const { toast} = useToast();

  const addOrder = () => {
    const order: PrintOrder = {
      id: Date.now().toString(),
      ...newOrder,
      completedPrints: 0,
      failedPrints: 0,
      status: 'pending',
      printerSpecificTimes: {}
    };
    setOrders([...orders, order]);
    setNewOrder({
      name: '',
      deadline: new Date(),
      totalParts: 1,
      partsPerPrint: 1,
      assignedGroup: 'none',
      assignedPrinter: 'none',
      printTimeMinutes: 60
    });
    setIsAddOrderOpen(false);
    
    // Auto-optimize if enabled
    if (autoOptimize) {
      setTimeout(() => handleOptimizeQueue(), 500);
    }
  };

  // Handle gcode file upload and parsing
  const handleGcodeUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.gcode')) {
      toast({
        title: "Invalid file",
        description: "Please upload a valid .gcode file",
        variant: "destructive",
      });
      return;
    }

    setUploadingFile(true);
    try {
      const gcodeInfo = await parseGCodeFile(file);
      
      // Create a new order from the gcode file
      const newOrderFromGcode: PrintOrder = {
        id: Date.now().toString(),
        name: gcodeInfo.fileName.replace('.gcode', ''),
        deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days default
        totalParts: 1,
        partsPerPrint: 1,
        completedPrints: 0,
        failedPrints: 0,
        status: 'pending',
        printTimeMinutes: gcodeInfo.estimatedPrintTime,
        printerSpecificTimes: {}
      };

      setOrders(prev => [...prev, newOrderFromGcode]);
      setIsUploadDialogOpen(false);
      
      toast({
        title: "Gcode uploaded successfully",
        description: `${gcodeInfo.fileName} - Estimated time: ${formatPrintTime(gcodeInfo.estimatedPrintTime)}`,
      });

      // Auto-optimize if enabled
      if (autoOptimize) {
        setTimeout(() => handleOptimizeQueue(), 500);
      }
    } catch (error) {
      toast({
        title: "Error parsing gcode",
        description: error instanceof Error ? error.message : "Failed to parse gcode file",
        variant: "destructive",
      });
    } finally {
      setUploadingFile(false);
      // Reset the input
      event.target.value = '';
    }
  }, [autoOptimize, toast]);

  // Handle STL file upload (simulated slicing)
  const handleSTLUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.stl')) {
      toast({
        title: "Invalid file",
        description: "Please upload a valid .stl file",
        variant: "destructive",
      });
      return;
    }

    setUploadingFile(true);
    try {
      // Slice using each printer's configured slicer
      const compatiblePrinters = printers.filter(p => p.slicer);
      
      if (compatiblePrinters.length === 0) {
        toast({
          title: "No slicer configured",
          description: "Set a slicer on at least one printer to auto-slice STL files.",
          variant: "destructive",
        });
        setUploadingFile(false);
        event.target.value = '';
        return;
      }
      
      // Simulate slicing process - in a real implementation, this would call
      // the external slicer (Cura, OrcaSlicer, PrusaSlicer, Bambu Studio, or Preform) API
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Estimate print time based on file size (rough approximation)
      const fileSizeMB = file.size / (1024 * 1024);
      
      // Create printer-specific times based on printer type and speed characteristics
      const printerSpecificTimes: { [printerId: string]: number } = {};
      compatiblePrinters.forEach(printer => {
        const baseMinutes = Math.max(60, Math.round(fileSizeMB * (printer.type === 'resin' ? 60 : 30)));
        const speedMultiplier = printer.speedMultiplier || 1.0;
        const printerTime = Math.round(baseMinutes / speedMultiplier);
        printerSpecificTimes[printer.id] = printerTime;
      });

      // Calculate average time across compatible printers
      const avgTime = Math.round(
        Object.values(printerSpecificTimes).reduce((sum, time) => sum + time, 0) / compatiblePrinters.length
      );

      const newOrderFromSTL: PrintOrder = {
        id: Date.now().toString(),
        name: file.name.replace('.stl', ''),
        deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days default
        totalParts: 1,
        partsPerPrint: 1,
        completedPrints: 0,
        failedPrints: 0,
        status: 'pending',
        printTimeMinutes: avgTime,
        printerSpecificTimes
      };

      setOrders(prev => [...prev, newOrderFromSTL]);
      setIsUploadDialogOpen(false);
      
      const slicerCounts = compatiblePrinters.reduce((acc, printer) => {
        const slicer = printer.slicer || 'unknown';
        acc[slicer] = (acc[slicer] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const slicerSummary = Object.entries(slicerCounts)
        .map(([slicer, count]) => `${slicer}: ${count}`)
        .join(', ');

      const typeCounts = Array.from(new Set(compatiblePrinters.map(p => p.type)));
      const typeSummary = typeCounts.length === 1 ? typeCounts[0].toUpperCase() : 'MIXED';
      
      toast({
        title: "STL sliced for printers",
        description: `${file.name} - ${typeSummary} printers - Avg time: ${formatPrintTime(avgTime)} (${compatiblePrinters.length} printers). Slicers: ${slicerSummary}`,
      });

      // Auto-optimize if enabled
      if (autoOptimize) {
        setTimeout(() => handleOptimizeQueue(), 500);
      }
    } catch (error) {
      toast({
        title: "Error slicing STL",
        description: error instanceof Error ? error.message : "Failed to slice STL file",
        variant: "destructive",
      });
    } finally {
      setUploadingFile(false);
      // Reset the input
      event.target.value = '';
    }
  }, [printers, autoOptimize, toast]);

  const updatePrinterSpecificTime = (orderId: string, printerId: string, minutes: number) => {
    setOrders(orders.map(order => {
      if (order.id === orderId) {
        return {
          ...order,
          printerSpecificTimes: {
            ...order.printerSpecificTimes,
            [printerId]: Math.max(1, minutes)
          }
        };
      }
      return order;
    }));
  };

  const getPrintTimeForPrinter = (order: PrintOrder, printerId: string): number => {
    return order.printerSpecificTimes[printerId] || order.printTimeMinutes;
  };

  const updatePrintTime = (orderId: string, minutes: number) => {
    setOrders(orders.map(order => {
      if (order.id === orderId) {
        return { ...order, printTimeMinutes: Math.max(1, minutes) };
      }
      return order;
    }));
  };

  const updateProgress = (orderId: string, field: 'completedPrints' | 'failedPrints', value: number) => {
    setOrders(orders.map(order => {
      if (order.id === orderId) {
        const updated = { ...order, [field]: Math.max(0, value) };
        const totalNeeded = Math.ceil(updated.totalParts / updated.partsPerPrint);
        const totalCompleted = updated.completedPrints * updated.partsPerPrint;
        
        if (totalCompleted >= updated.totalParts) {
          updated.status = 'completed';
        } else if (updated.deadline < new Date()) {
          updated.status = 'overdue';
        } else if (updated.completedPrints > 0 || updated.failedPrints > 0) {
          updated.status = 'in-progress';
        } else {
          updated.status = 'pending';
        }
        
        return updated;
      }
      return order;
    }));
  };

  const getStatusColor = (status: PrintOrder['status']) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'in-progress': return 'bg-blue-500';
      case 'overdue': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getOrdersForDate = (date: Date) => {
    return orders.filter(order => 
      order.deadline.toDateString() === date.toDateString()
    );
  };

  const getProgress = (order: PrintOrder) => {
    const totalNeeded = Math.ceil(order.totalParts / order.partsPerPrint);
    const completedParts = order.completedPrints * order.partsPerPrint;
    const actualCompleted = Math.min(completedParts, order.totalParts);
    return {
      completed: actualCompleted,
      total: order.totalParts,
      percentage: (actualCompleted / order.totalParts) * 100
    };
  };

  // Optimize the queue based on current orders
  const handleOptimizeQueue = useCallback(() => {
    // Convert orders to print jobs (only incomplete orders)
    const printJobs: OptPrintJob[] = [];
    orders.forEach(order => {
      const remainingPrints = Math.ceil(order.totalParts / order.partsPerPrint) - order.completedPrints;
      for (let i = 0; i < remainingPrints; i++) {
        printJobs.push({
          id: `${order.id}-print-${i}`,
          name: `${order.name} (${i + 1}/${remainingPrints})`,
          printTimeMinutes: order.printTimeMinutes,
          deadline: order.deadline,
          priority: order.status === 'overdue' ? 'high' : 
                   (order.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24) < 3 ? 'high' :
                   (order.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24) < 7 ? 'medium' : 'low',
          printerSpecificTimes: order.printerSpecificTimes
        });
      }
    });

    // Convert printers to scheduler format
    const printerSchedules: OptPrinterSchedule[] = printers.map(p => ({
      printerId: p.id,
      printerName: p.name
    }));

    // Set scheduling window (from now to furthest deadline + 7 days)
    const now = new Date();
    const furthestDeadline = orders.length > 0 
      ? new Date(Math.max(...orders.map(o => o.deadline.getTime())))
      : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(furthestDeadline.getTime() + 7 * 24 * 60 * 60 * 1000);

    const result = optimizeQueue(printJobs, printerSchedules, farmWorkHours, {
      start: now,
      end: windowEnd
    });

    setOptimizationResult(result);
    setShowOptimizedSchedule(true);

    // Run the new intelligent scheduler
    runPrintScheduler(orders);

    toast({
      title: "Queue Optimized",
      description: `Scheduled ${result.totalPrintsScheduled} prints, ${result.totalPrintsUnscheduled} couldn't be scheduled`,
    });
  }, [orders, printers, farmWorkHours, toast]);

  // New intelligent print scheduler
  const runPrintScheduler = useCallback((ordersToSchedule: PrintOrder[]) => {
    const jobsToSchedule = ordersToSchedule
      .filter(order => order.status === 'pending' && !order.isScheduled)
      .map(order => ({
        id: order.id,
        name: order.name,
        printTimeMinutes: order.printTimeMinutes,
        dueDate: order.deadline,
        printerId: order.assignedPrinter,
        priority: order.status === 'overdue' ? 'high' as const : 
                 (order.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24) < 3 ? 'high' as const :
                 (order.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24) < 7 ? 'medium' as const : 'low' as const
      }));

    const result = scheduleJobs(
      jobsToSchedule,
      printers.map(p => p.id),
      farmWorkHours
    );

    setSchedulerResult(result);
    setUnschedulableJobs(result.unschedulable);

    // Update orders with scheduling info
    setOrders(prev => prev.map(order => {
      const scheduledSlot = result.scheduled.find(s => s.jobId === order.id);
      if (scheduledSlot) {
        return {
          ...order,
          isScheduled: true,
          scheduledStartTime: scheduledSlot.startTime,
          scheduledEndTime: scheduledSlot.endTime
        };
      }
      return order;
    }));

    if (result.unschedulable.length > 0) {
      setShowUnschedulableAlerts(true);
      toast({
        title: "Scheduling Warning",
        description: `${result.unschedulable.length} job(s) could not be scheduled`,
        variant: "destructive",
      });
    }
  }, [printers, farmWorkHours, toast]);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Print Schedule & Orders
          </CardTitle>
          <div className="flex items-center gap-2">
            <Dialog open={isWorkHoursDialogOpen} onOpenChange={setIsWorkHoursDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Settings className="h-4 w-4 mr-2" />
                  Worker Hours
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Configure Worker Hours</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Set the hours when workers are present at the print farm to handle print removal and setup.
                  </div>
                  <div>
                    <Label htmlFor="workStart">Workers Arrive At</Label>
                    <Select 
                      value={farmWorkHours.start.toString()} 
                      onValueChange={(value) => {
                        const newHours = { ...farmWorkHours, start: parseInt(value) };
                        setFarmWorkHours(newHours);
                        onWorkHoursChange?.(newHours);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, i) => (
                          <SelectItem key={i} value={i.toString()}>
                            {i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="workEnd">Workers Leave At</Label>
                    <Select 
                      value={farmWorkHours.end.toString()} 
                      onValueChange={(value) => {
                        const newHours = { ...farmWorkHours, end: parseInt(value) };
                        setFarmWorkHours(newHours);
                        onWorkHoursChange?.(newHours);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, i) => (
                          <SelectItem key={i} value={i.toString()}>
                            {i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="bg-muted p-3 rounded-md">
                    <div className="text-sm font-medium">Current Schedule:</div>
                    <div className="text-sm text-muted-foreground">
                      Workers: {farmWorkHours.start === 0 ? '12 AM' : farmWorkHours.start < 12 ? `${farmWorkHours.start} AM` : farmWorkHours.start === 12 ? '12 PM' : `${farmWorkHours.start - 12} PM`}
                      {' - '}
                      {farmWorkHours.end === 0 ? '12 AM' : farmWorkHours.end < 12 ? `${farmWorkHours.end} AM` : farmWorkHours.end === 12 ? '12 PM' : `${farmWorkHours.end - 12} PM`}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Printers: 24/7 Operation
                    </div>
                  </div>
                  <Button onClick={() => setIsWorkHoursDialogOpen(false)} className="w-full">
                    Save
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            
            <Button size="sm" variant="outline" onClick={handleOptimizeQueue}>
              <Sparkles className="h-4 w-4 mr-2" />
              Optimize Queue
            </Button>
            
            <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload File
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload STL or Gcode File</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Upload a file to automatically add it to the print queue. STL files will be sliced with estimated times for each printer. Gcode files will be parsed for print time.
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="gcodeUpload" className="cursor-pointer">
                        <div className="border-2 border-dashed border-border rounded-lg p-6 hover:border-primary transition-colors text-center">
                          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                          <div className="font-medium">Upload Gcode File</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            .gcode files with embedded print time estimates
                          </div>
                        </div>
                        <input
                          id="gcodeUpload"
                          type="file"
                          accept=".gcode"
                          className="hidden"
                          onChange={handleGcodeUpload}
                          disabled={uploadingFile}
                        />
                      </Label>
                    </div>
                    
                    <div className="text-center text-sm text-muted-foreground">— OR —</div>
                    
                    <div>
                      <Label htmlFor="stlUpload" className="cursor-pointer">
                        <div className="border-2 border-dashed border-border rounded-lg p-6 hover:border-primary transition-colors text-center">
                          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                          <div className="font-medium">Upload STL File</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            .stl files will be sliced with printer-specific times
                          </div>
                        </div>
                        <input
                          id="stlUpload"
                          type="file"
                          accept=".stl"
                          className="hidden"
                          onChange={handleSTLUpload}
                          disabled={uploadingFile}
                        />
                      </Label>
                    </div>
                  </div>
                  
                  {uploadingFile && (
                    <div className="text-center text-sm text-muted-foreground">
                      Processing file...
                    </div>
                  )}
                  
                  <div className="border-t border-border pt-3">
                    <div className="text-sm font-medium">Slicer Configuration</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Each printer uses its configured slicer. Set per-printer slicers in printer settings.
                    </div>
                  </div>
                  
                  <div className="bg-muted p-3 rounded-md text-xs">
                    <div className="font-medium mb-1">Auto-Optimization: {autoOptimize ? 'Enabled' : 'Disabled'}</div>
                    <div className="text-muted-foreground">
                      {autoOptimize 
                        ? 'Queue will be automatically optimized after file upload'
                        : 'Manually click "Optimize Queue" after uploads'}
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="mt-2 h-7"
                      onClick={() => setAutoOptimize(!autoOptimize)}
                    >
                      {autoOptimize ? 'Disable' : 'Enable'} Auto-Optimization
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            
            <Dialog open={isAddOrderOpen} onValueChange={setIsAddOrderOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Order
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Print Order</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="orderName">Order Name</Label>
                  <Input
                    id="orderName"
                    value={newOrder.name}
                    onChange={(e) => setNewOrder({ ...newOrder, name: e.target.value })}
                    placeholder="e.g., Product Prototype v3"
                  />
                </div>
                <div>
                  <Label htmlFor="totalParts">Total Parts Needed</Label>
                  <Input
                    id="totalParts"
                    type="number"
                    min="1"
                    value={newOrder.totalParts}
                    onChange={(e) => setNewOrder({ ...newOrder, totalParts: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div>
                  <Label htmlFor="partsPerPrint">Parts Per Print</Label>
                  <Input
                    id="partsPerPrint"
                    type="number"
                    min="1"
                    value={newOrder.partsPerPrint}
                    onChange={(e) => setNewOrder({ ...newOrder, partsPerPrint: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div>
                  <Label htmlFor="printTime">Print Time per Job (minutes)</Label>
                  <Input
                    id="printTime"
                    type="number"
                    min="1"
                    value={newOrder.printTimeMinutes}
                    onChange={(e) => setNewOrder({ ...newOrder, printTimeMinutes: parseInt(e.target.value) || 60 })}
                  />
                  <div className="text-xs text-muted-foreground mt-1">
                    Estimated: {formatPrintTime(newOrder.printTimeMinutes)}
                  </div>
                </div>
                <div>
                  <Label htmlFor="deadline">Deadline</Label>
                  <Calendar
                    mode="single"
                    selected={newOrder.deadline}
                    onSelect={(date) => date && setNewOrder({ ...newOrder, deadline: date })}
                    className="pointer-events-auto"
                  />
                </div>
                <div>
                  <Label htmlFor="assignedGroup">Assign to Group (Optional)</Label>
                  <Select value={newOrder.assignedGroup} onValueChange={(value) => setNewOrder({ ...newOrder, assignedGroup: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific group</SelectItem>
                      {groups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="assignedPrinter">Assign to Printer (Optional)</Label>
                  <Select value={newOrder.assignedPrinter} onValueChange={(value) => setNewOrder({ ...newOrder, assignedPrinter: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select printer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific printer</SelectItem>
                      {printers.map((printer) => (
                        <SelectItem key={printer.id} value={printer.id}>
                          {printer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={addOrder} className="w-full" disabled={!newOrder.name}>
                  Add Order
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Unschedulable Jobs Alerts */}
          {showUnschedulableAlerts && unschedulableJobs.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-destructive">Unable to Schedule {unschedulableJobs.length} Job(s)</h3>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowUnschedulableAlerts(false)}
                >
                  ✕
                </Button>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {unschedulableJobs.map((job, index) => (
                  <div key={index} className="bg-background/50 p-2 rounded text-sm">
                    <div className="font-medium">{job.jobName}</div>
                    <div className="text-muted-foreground text-xs">
                      {job.printTimeMinutes}min | Due: {job.dueDate.toLocaleDateString()} | Reason: {job.reason}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1"
                      onClick={() => {
                        // Move to manual queue
                        setOrders(prev => prev.map(o => 
                          o.id === job.jobId ? { ...o, status: 'pending' } : o
                        ));
                        setUnschedulableJobs(prev => prev.filter(j => j.jobId !== job.jobId));
                        toast({
                          title: "Job moved to manual queue",
                          description: "You can now manually start this print job",
                        });
                      }}
                    >
                      Move to Manual Queue
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Calendar and Capacity Analysis */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Calendar */}
            <div>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                className="pointer-events-auto"
                modifiers={{
                  hasOrders: (date) => getOrdersForDate(date).length > 0,
                  deadline: (date) => orders.some(order => 
                    order.deadline.toDateString() === date.toDateString()
                  )
                }}
                modifiersStyles={{
                  hasOrders: { backgroundColor: 'hsl(var(--primary) / 0.2)' },
                  deadline: { backgroundColor: 'hsl(var(--destructive) / 0.2)' }
                }}
              />
            </div>

            {/* Print Capacity Analysis */}
            <div className="col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Daily Capacity</h3>
                <Badge variant="outline">
                  {selectedDate ? selectedDate.toLocaleDateString() : 'Today'}
                </Badge>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Available Hours */}
                <Card className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Available Hours</span>
                      <span className="text-lg font-bold text-primary">
                        {printers.length * 24}h
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {printers.length} printers × 24h/day
                    </div>
                  </div>
                </Card>

                {/* Required Hours */}
                <Card className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Required Hours</span>
                      <span className="text-lg font-bold text-warning">
                        {Math.round((selectedDate ? 
                          getOrdersForDate(selectedDate).reduce((total, order) => {
                            const printsNeeded = Math.ceil(order.totalParts / order.partsPerPrint) - order.completedPrints;
                            return total + (printsNeeded * (order.printTimeMinutes / 60));
                          }, 0) : 
                          orders.reduce((total, order) => {
                            const printsNeeded = Math.ceil(order.totalParts / order.partsPerPrint) - order.completedPrints;
                            return total + (printsNeeded * (order.printTimeMinutes / 60));
                          }, 0)) * 10) / 10
                        }h
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Based on configured print times
                    </div>
                  </div>
                </Card>

                {/* Capacity Utilization */}
                <Card className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Utilization</span>
                      <span className={`text-lg font-bold ${
                        (() => {
                          const availableHours = printers.length * 24;
                          const requiredHours = selectedDate ? 
                            getOrdersForDate(selectedDate).reduce((total, order) => {
                              const printsNeeded = Math.ceil(order.totalParts / order.partsPerPrint) - order.completedPrints;
                              return total + (printsNeeded * (order.printTimeMinutes / 60));
                            }, 0) : 
                            orders.reduce((total, order) => {
                              const printsNeeded = Math.ceil(order.totalParts / order.partsPerPrint) - order.completedPrints;
                              return total + (printsNeeded * (order.printTimeMinutes / 60));
                            }, 0);
                          const utilization = (requiredHours / availableHours) * 100;
                          return utilization > 90 ? 'text-destructive' : utilization > 70 ? 'text-warning' : 'text-primary';
                        })()
                      }`}>
                        {(() => {
                          const availableHours = printers.length * 24;
                          const requiredHours = selectedDate ? 
                            getOrdersForDate(selectedDate).reduce((total, order) => {
                              const printsNeeded = Math.ceil(order.totalParts / order.partsPerPrint) - order.completedPrints;
                              return total + (printsNeeded * (order.printTimeMinutes / 60));
                            }, 0) : 
                            orders.reduce((total, order) => {
                              const printsNeeded = Math.ceil(order.totalParts / order.partsPerPrint) - order.completedPrints;
                              return total + (printsNeeded * (order.printTimeMinutes / 60));
                            }, 0);
                          return Math.round((requiredHours / availableHours) * 100);
                        })()}%
                      </span>
                    </div>
                    <div className="w-full bg-muted h-2 rounded">
                      <div 
                        className={`h-full rounded transition-all ${
                          (() => {
                            const availableHours = printers.length * 24;
                            const requiredHours = selectedDate ? 
                              getOrdersForDate(selectedDate).reduce((total, order) => {
                                const printsNeeded = Math.ceil(order.totalParts / order.partsPerPrint) - order.completedPrints;
                                return total + (printsNeeded * (order.printTimeMinutes / 60));
                              }, 0) : 
                              orders.reduce((total, order) => {
                                const printsNeeded = Math.ceil(order.totalParts / order.partsPerPrint) - order.completedPrints;
                                return total + (printsNeeded * (order.printTimeMinutes / 60));
                              }, 0);
                            const utilization = (requiredHours / availableHours) * 100;
                            return utilization > 90 ? 'bg-destructive' : utilization > 70 ? 'bg-warning' : 'bg-primary';
                          })()
                        }`}
                        style={{ 
                          width: `${Math.min(100, (() => {
                            const availableHours = printers.length * 24;
                            const requiredHours = selectedDate ? 
                              getOrdersForDate(selectedDate).reduce((total, order) => {
                                const printsNeeded = Math.ceil(order.totalParts / order.partsPerPrint) - order.completedPrints;
                                return total + (printsNeeded * (order.printTimeMinutes / 60));
                              }, 0) : 
                              orders.reduce((total, order) => {
                                const printsNeeded = Math.ceil(order.totalParts / order.partsPerPrint) - order.completedPrints;
                                return total + (printsNeeded * (order.printTimeMinutes / 60));
                              }, 0);
                            return (requiredHours / availableHours) * 100;
                          })())}%` 
                        }}
                      />
                    </div>
                  </div>
                </Card>
              </div>

              {/* Printer Status */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Printer Status by Group</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {groups.map((group) => (
                    <Card key={group.id} className="p-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{group.name}</span>
                          <Badge variant="outline" style={{ backgroundColor: group.color + '20', borderColor: group.color }}>
                            {group.printerIds.length}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-1 text-xs">
                          <div className="text-center">
                            <div className="text-primary font-medium">
                              {Math.floor(group.printerIds.length * 0.6)}
                            </div>
                            <div className="text-muted-foreground">Free</div>
                          </div>
                          <div className="text-center">
                            <div className="text-warning font-medium">
                              {Math.floor(group.printerIds.length * 0.3)}
                            </div>
                            <div className="text-muted-foreground">Queued</div>
                          </div>
                          <div className="text-center">
                            <div className="text-destructive font-medium">
                              {Math.floor(group.printerIds.length * 0.1)}
                            </div>
                            <div className="text-muted-foreground">Busy</div>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground text-center">
                          24h/day available per printer
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Orders Section - Now below the calendar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Priority Orders */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Priority Orders</h3>
                <Badge variant="destructive">Due ≤ 7 days</Badge>
              </div>
              <div className="space-y-3">
                {orders
                  .filter(order => {
                    const daysUntilDeadline = Math.ceil((order.deadline.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                    return daysUntilDeadline <= 7 && order.status !== 'completed';
                  })
                  .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
                  .map((order) => {
                    const progress = getProgress(order);
                    const daysUntilDeadline = Math.ceil((order.deadline.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                    const remainingPrints = Math.ceil(order.totalParts / order.partsPerPrint) - order.completedPrints;
                    
                    return (
                      <Card key={order.id} className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{order.name}</h4>
                                <Badge className="bg-blue-100 text-blue-800 border-blue-200">3D</Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Due: {order.deadline.toLocaleDateString()}
                                {daysUntilDeadline <= 0 && <span className="text-destructive font-medium"> (OVERDUE)</span>}
                                {daysUntilDeadline > 0 && <span> ({daysUntilDeadline} days)</span>}
                              </div>
                            </div>
                            <Badge className={getStatusColor(order.status)}>
                              {order.status}
                            </Badge>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Progress: {progress.completed}/{progress.total} parts</span>
                              <span>{Math.round(progress.percentage)}%</span>
                            </div>
                            <div className="w-full bg-muted h-2 rounded">
                              <div 
                                className="bg-primary h-full rounded transition-all"
                                style={{ width: `${progress.percentage}%` }}
                              />
                            </div>
                          </div>
                          
                          {/* Print Time and GCode Section */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium">Print Time per Job</span>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min="1"
                                  value={order.printTimeMinutes}
                                  onChange={(e) => updatePrintTime(order.id, parseInt(e.target.value) || 60)}
                                  className="h-8 w-20"
                                />
                                <span className="text-xs text-muted-foreground">min</span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 w-8 p-0"
                                  title="Edit print time"
                                >
                                  <Edit3 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">
                                {formatPrintTime(order.printTimeMinutes)} per print
                              </span>
                              <Dialog open={editingOrder === order.id} onOpenChange={(open) => setEditingOrder(open ? order.id : null)}>
                                <DialogTrigger asChild>
                                  <Button size="sm" variant="outline" className="h-6 text-xs">
                                    <Edit3 className="h-3 w-3 mr-1" />
                                    Edit Times
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-md">
                                  <DialogHeader>
                                    <DialogTitle>Edit Print Times - {order.name}</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div>
                                      <Label>Default Print Time</Label>
                                      <div className="flex items-center gap-2 mt-1">
                                        <Input
                                          type="number"
                                          min="1"
                                          value={order.printTimeMinutes}
                                          onChange={(e) => updatePrintTime(order.id, parseInt(e.target.value) || 1)}
                                          className="flex-1"
                                        />
                                        <span className="text-sm text-muted-foreground">min</span>
                                      </div>
                                    </div>
                                    
                                    <div className="space-y-3">
                                      <Label>Printer-Specific Times</Label>
                                      {printers.map((printer) => (
                                        <div key={printer.id} className="flex items-center gap-2">
                                          <span className="text-sm flex-1">{printer.name}</span>
                                          <Input
                                            type="number"
                                            min="1"
                                            value={getPrintTimeForPrinter(order, printer.id)}
                                            onChange={(e) => updatePrinterSpecificTime(order.id, printer.id, parseInt(e.target.value) || 1)}
                                            className="w-20"
                                            placeholder={order.printTimeMinutes.toString()}
                                          />
                                          <span className="text-xs text-muted-foreground w-8">min</span>
                                        </div>
                                      ))}
                                    </div>
                                    
                                    <div className="text-xs text-muted-foreground">
                                      Leave blank to use default time. Different printers may have varying speeds.
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <div className="text-muted-foreground">Prints Done</div>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min="0"
                                  value={order.completedPrints}
                                  onChange={(e) => updateProgress(order.id, 'completedPrints', parseInt(e.target.value) || 0)}
                                  className="h-8 w-16"
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateProgress(order.id, 'completedPrints', order.completedPrints + 1)}
                                >
                                  <CheckCircle className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Failed</div>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min="0"
                                  value={order.failedPrints}
                                  onChange={(e) => updateProgress(order.id, 'failedPrints', parseInt(e.target.value) || 0)}
                                  className="h-8 w-16"
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateProgress(order.id, 'failedPrints', order.failedPrints + 1)}
                                >
                                  <XCircle className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Remaining</div>
                              <div className="font-medium text-warning">
                                {remainingPrints} prints
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                {orders.filter(order => {
                  const daysUntilDeadline = Math.ceil((order.deadline.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                  return daysUntilDeadline <= 7 && order.status !== 'completed';
                }).length === 0 && (
                  <Card className="p-4">
                    <div className="text-center text-muted-foreground">
                      No priority orders
                    </div>
                  </Card>
                )}
              </div>
            </div>

            {/* Upcoming Orders */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Upcoming Orders</h3>
                <Badge variant="outline">Due &gt; 7 days</Badge>
              </div>
              <div className="space-y-3">
                {orders
                  .filter(order => {
                    const daysUntilDeadline = Math.ceil((order.deadline.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                    return daysUntilDeadline > 7 && order.status !== 'completed';
                  })
                  .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
                  .map((order) => {
                    const progress = getProgress(order);
                    const daysUntilDeadline = Math.ceil((order.deadline.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                    const remainingPrints = Math.ceil(order.totalParts / order.partsPerPrint) - order.completedPrints;
                    
                    return (
                      <Card key={order.id} className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{order.name}</h4>
                                <Badge className="bg-blue-100 text-blue-800 border-blue-200">3D</Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Due: {order.deadline.toLocaleDateString()} ({daysUntilDeadline} days)
                              </div>
                            </div>
                            <Badge className={getStatusColor(order.status)}>
                              {order.status}
                            </Badge>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Progress: {progress.completed}/{progress.total} parts</span>
                              <span>{Math.round(progress.percentage)}%</span>
                            </div>
                            <div className="w-full bg-muted h-2 rounded">
                              <div 
                                className="bg-primary h-full rounded transition-all"
                                style={{ width: `${progress.percentage}%` }}
                              />
                            </div>
                          </div>
                          
                          {/* Print Time and GCode Section */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium">Print Time per Job</span>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min="1"
                                  value={order.printTimeMinutes}
                                  onChange={(e) => updatePrintTime(order.id, parseInt(e.target.value) || 60)}
                                  className="h-8 w-20"
                                />
                                <span className="text-xs text-muted-foreground">min</span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 w-8 p-0"
                                  title="Edit print time"
                                >
                                  <Edit3 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">
                                {formatPrintTime(order.printTimeMinutes)} per print
                              </span>
                              <Dialog open={editingOrder === order.id} onOpenChange={(open) => setEditingOrder(open ? order.id : null)}>
                                <DialogTrigger asChild>
                                  <Button size="sm" variant="outline" className="h-6 text-xs">
                                    <Edit3 className="h-3 w-3 mr-1" />
                                    Edit Times
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-md">
                                  <DialogHeader>
                                    <DialogTitle>Edit Print Times - {order.name}</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div>
                                      <Label>Default Print Time</Label>
                                      <div className="flex items-center gap-2 mt-1">
                                        <Input
                                          type="number"
                                          min="1"
                                          value={order.printTimeMinutes}
                                          onChange={(e) => updatePrintTime(order.id, parseInt(e.target.value) || 1)}
                                          className="flex-1"
                                        />
                                        <span className="text-sm text-muted-foreground">min</span>
                                      </div>
                                    </div>
                                    
                                    <div className="space-y-3">
                                      <Label>Printer-Specific Times</Label>
                                      {printers.map((printer) => (
                                        <div key={printer.id} className="flex items-center gap-2">
                                          <span className="text-sm flex-1">{printer.name}</span>
                                          <Input
                                            type="number"
                                            min="1"
                                            value={getPrintTimeForPrinter(order, printer.id)}
                                            onChange={(e) => updatePrinterSpecificTime(order.id, printer.id, parseInt(e.target.value) || 1)}
                                            className="w-20"
                                            placeholder={order.printTimeMinutes.toString()}
                                          />
                                          <span className="text-xs text-muted-foreground w-8">min</span>
                                        </div>
                                      ))}
                                    </div>
                                    
                                    <div className="text-xs text-muted-foreground">
                                      Leave blank to use default time. Different printers may have varying speeds.
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <div className="text-muted-foreground">Prints Done</div>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min="0"
                                  value={order.completedPrints}
                                  onChange={(e) => updateProgress(order.id, 'completedPrints', parseInt(e.target.value) || 0)}
                                  className="h-8 w-16"
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateProgress(order.id, 'completedPrints', order.completedPrints + 1)}
                                >
                                  <CheckCircle className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Failed</div>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min="0"
                                  value={order.failedPrints}
                                  onChange={(e) => updateProgress(order.id, 'failedPrints', parseInt(e.target.value) || 0)}
                                  className="h-8 w-16"
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateProgress(order.id, 'failedPrints', order.failedPrints + 1)}
                                >
                                  <XCircle className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Remaining</div>
                              <div className="font-medium text-warning">
                                {remainingPrints} prints
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                {orders.filter(order => {
                  const daysUntilDeadline = Math.ceil((order.deadline.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                  return daysUntilDeadline > 7 && order.status !== 'completed';
                }).length === 0 && (
                  <Card className="p-4">
                    <div className="text-center text-muted-foreground">
                      No upcoming orders
                    </div>
                  </Card>
                )}
              </div>
            </div>
          </div>

          {/* Daily Print Queue */}
          {selectedDate && !showOptimizedSchedule && (
            <div>
              <DailyPrintQueue 
                selectedDate={selectedDate}
                printers={printers}
              />
            </div>
          )}

          {/* Optimized Schedule Timeline */}
          {showOptimizedSchedule && optimizationResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-lg">Optimized Print Schedule</h3>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {optimizationResult.totalPrintsScheduled} scheduled
                  </Badge>
                  {optimizationResult.totalPrintsUnscheduled > 0 && (
                    <Badge variant="destructive">
                      {optimizationResult.totalPrintsUnscheduled} unscheduled
                    </Badge>
                  )}
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => setShowOptimizedSchedule(false)}
                  >
                    Back to Calendar
                  </Button>
                </div>
              </div>
              
              <OptimizedScheduleTimeline
                scheduledPrints={optimizationResult.scheduledPrints}
                printers={printers.map(p => ({ id: p.id, name: p.name }))}
                farmWorkHours={optimizationResult.workHours}
                timeRange={{
                  start: new Date(),
                  end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days from now
                }}
                onPrintClick={(print) => {
                  toast({
                    title: print.jobName,
                    description: `${print.printerName}: ${new Date(print.startTime).toLocaleString()} - ${new Date(print.endTime).toLocaleString()}`
                  });
                }}
              />
              
              {/* Unscheduled jobs warning */}
              {optimizationResult.totalPrintsUnscheduled > 0 && (
                <Card className="border-destructive">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <XCircle className="h-5 w-5 text-destructive mt-0.5" />
                      <div className="space-y-2">
                        <h4 className="font-medium">Unscheduled Prints</h4>
                        <p className="text-sm text-muted-foreground">
                          {optimizationResult.totalPrintsUnscheduled} prints could not be scheduled within their deadlines.
                          Consider:
                        </p>
                        <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                          <li>Extending deadlines for some orders</li>
                          <li>Reducing the number of parts per order</li>
                          <li>Adding more printers to the farm</li>
                          <li>Extending worker hours for critical orders</li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Utilization summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Printer Utilization</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {Object.entries(optimizationResult.utilizationByPrinter).map(([printerId, utilization]) => {
                      const printer = printers.find(p => p.id === printerId);
                      return (
                        <Card key={printerId} className="p-3">
                          <div className="space-y-2">
                            <div className="text-sm font-medium truncate">{printer?.name || printerId}</div>
                            <div className="flex items-baseline gap-1">
                              <span className="text-2xl font-bold">{Math.round(utilization)}%</span>
                              <span className="text-xs text-muted-foreground">utilized</span>
                            </div>
                            <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all ${
                                  utilization > 90 ? 'bg-green-500' :
                                  utilization > 70 ? 'bg-yellow-500' :
                                  utilization > 50 ? 'bg-orange-500' :
                                  'bg-red-500'
                                }`}
                                style={{ width: `${Math.min(100, utilization)}%` }}
                              />
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
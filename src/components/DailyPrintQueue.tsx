import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, Play, Clock, CheckCircle, AlertCircle, Trash2 } from "lucide-react";

interface QueuedPrint {
  id: string;
  name: string;
  fileType: 'gcode' | 'stl';
  fileName: string;
  assignedPrinter?: string;
  estimatedTime?: number;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'ready' | 'printing' | 'completed' | 'failed';
  notes?: string;
  addedAt: Date;
}

interface SimplePrinter {
  id: string;
  name: string;
  slicer?: 'cura' | 'orca';
}

interface DailyPrintQueueProps {
  selectedDate: Date;
  printers: SimplePrinter[];
}

export function DailyPrintQueue({ selectedDate, printers }: DailyPrintQueueProps) {
  const [queue, setQueue] = useState<QueuedPrint[]>([]);
  const [isAddPrintOpen, setIsAddPrintOpen] = useState(false);
  const [newPrint, setNewPrint] = useState({
    name: '',
    fileType: 'gcode' as 'gcode' | 'stl',
    fileName: '',
    assignedPrinter: 'any',
    estimatedTime: 0,
    priority: 'medium' as 'low' | 'medium' | 'high',
    notes: ''
  });

  const addPrintToQueue = () => {
    const print: QueuedPrint = {
      id: Date.now().toString(),
      ...newPrint,
      status: newPrint.fileType === 'gcode' ? 'ready' : 'pending',
      addedAt: new Date()
    };
    setQueue([...queue, print]);
    setNewPrint({
      name: '',
      fileType: 'gcode',
      fileName: '',
      assignedPrinter: 'any',
      estimatedTime: 0,
      priority: 'medium',
      notes: ''
    });
    setIsAddPrintOpen(false);
  };

  const updatePrintStatus = (printId: string, status: QueuedPrint['status']) => {
    setQueue(prev => prev.map(print => 
      print.id === printId ? { ...print, status } : print
    ));
  };

  const removePrint = (printId: string) => {
    setQueue(prev => prev.filter(print => print.id !== printId));
  };

  const getPriorityColor = (priority: QueuedPrint['priority']) => {
    switch (priority) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: QueuedPrint['status']) => {
    switch (status) {
      case 'ready': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'printing': return <Play className="h-4 w-4 text-blue-500" />;
      case 'pending': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed': return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>
            Print Queue - {selectedDate.toDateString()}
          </CardTitle>
          <Dialog open={isAddPrintOpen} onOpenChange={setIsAddPrintOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Upload className="h-4 w-4 mr-2" />
                Add Print
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Print to Queue</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="printName">Print Name</Label>
                  <Input
                    id="printName"
                    value={newPrint.name}
                    onChange={(e) => setNewPrint({ ...newPrint, name: e.target.value })}
                    placeholder="e.g., Phone Case v2"
                  />
                </div>

                <div>
                  <Label htmlFor="fileType">File Type</Label>
                  <Select value={newPrint.fileType} onValueChange={(value: 'gcode' | 'stl') => setNewPrint({ ...newPrint, fileType: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gcode">G-code (Ready to print)</SelectItem>
                      <SelectItem value="stl">STL (Needs slicing)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="fileName">File Name</Label>
                  <Input
                    id="fileName"
                    value={newPrint.fileName}
                    onChange={(e) => setNewPrint({ ...newPrint, fileName: e.target.value })}
                    placeholder="file.gcode or file.stl"
                  />
                </div>

                <div>
                  <Label htmlFor="assignedPrinter">Assign to Printer</Label>
                  <Select value={newPrint.assignedPrinter} onValueChange={(value) => setNewPrint({ ...newPrint, assignedPrinter: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select printer (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any available printer</SelectItem>
                      {printers.map((printer) => (
                        <SelectItem key={printer.id} value={printer.id}>
                          {printer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="estimatedTime">Estimated Print Time (minutes)</Label>
                  <Input
                    id="estimatedTime"
                    type="number"
                    min="0"
                    value={newPrint.estimatedTime}
                    onChange={(e) => setNewPrint({ ...newPrint, estimatedTime: parseInt(e.target.value) || 0 })}
                  />
                </div>

                <div>
                  <Label htmlFor="priority">Priority</Label>
                  <Select value={newPrint.priority} onValueChange={(value: 'low' | 'medium' | 'high') => setNewPrint({ ...newPrint, priority: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High Priority</SelectItem>
                      <SelectItem value="medium">Medium Priority</SelectItem>
                      <SelectItem value="low">Low Priority</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    value={newPrint.notes}
                    onChange={(e) => setNewPrint({ ...newPrint, notes: e.target.value })}
                    placeholder="Special instructions or notes..."
                    rows={3}
                  />
                </div>

                <Button onClick={addPrintToQueue} className="w-full" disabled={!newPrint.name || !newPrint.fileName}>
                  Add to Queue
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {queue.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <FileText className="h-8 w-8 mx-auto mb-2" />
              <p>No prints queued for this date</p>
              <p className="text-sm">Add prints to get started</p>
            </div>
          ) : (
            queue
              .sort((a, b) => {
                // Sort by priority first, then by status
                const priorityOrder = { high: 3, medium: 2, low: 1 };
                const statusOrder = { ready: 4, printing: 3, pending: 2, completed: 1, failed: 0 };
                
                if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
                  return priorityOrder[b.priority] - priorityOrder[a.priority];
                }
                return statusOrder[b.status] - statusOrder[a.status];
              })
              .map((print) => (
                <Card key={print.id} className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(print.status)}
                        <h4 className="font-medium">{print.name}</h4>
                        <Badge variant="outline" className={`${getPriorityColor(print.priority)} text-white text-xs`}>
                          {print.priority}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select 
                          value={print.status} 
                          onValueChange={(value: QueuedPrint['status']) => updatePrintStatus(print.id, value)}
                        >
                          <SelectTrigger className="w-32 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="ready">Ready</SelectItem>
                            <SelectItem value="printing">Printing</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => removePrint(print.id)}
                          className="h-8 w-8 p-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <Label className="text-xs text-muted-foreground">File</Label>
                        <div className="flex items-center gap-1">
                          <Badge variant={print.fileType === 'gcode' ? 'default' : 'secondary'}>
                            {print.fileType.toUpperCase()}
                          </Badge>
                          <span className="truncate">{print.fileName}</span>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Printer</Label>
                        <div>
                          {print.assignedPrinter && print.assignedPrinter !== 'any'
                            ? printers.find(p => p.id === print.assignedPrinter)?.name || 'Unknown'
                            : 'Any available'
                          }
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Est. Time</Label>
                        <div>{print.estimatedTime ? formatTime(print.estimatedTime) : 'Unknown'}</div>
                      </div>
                    </div>

                    {print.notes && (
                      <div className="text-sm">
                        <Label className="text-xs text-muted-foreground">Notes</Label>
                        <p className="text-muted-foreground">{print.notes}</p>
                      </div>
                    )}
                  </div>
                </Card>
              ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
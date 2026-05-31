import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, Printer, Moon, Sun, Calendar } from "lucide-react";
import { ScheduledPrint, WorkHours, formatScheduleTime, formatWorkHours } from "@/utils/queueOptimizer";

interface OptimizedScheduleTimelineProps {
  scheduledPrints: ScheduledPrint[];
  printers: Array<{ id: string; name: string }>;
  farmWorkHours: WorkHours;
  timeRange: { start: Date; end: Date };
  onPrintClick?: (print: ScheduledPrint) => void;
}

export function OptimizedScheduleTimeline({
  scheduledPrints,
  printers,
  farmWorkHours,
  timeRange,
  onPrintClick
}: OptimizedScheduleTimelineProps) {
  // Calculate time scale
  const totalHours = (timeRange.end.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60);
  const hoursPerDay = 24;
  const days = Math.ceil(totalHours / hoursPerDay);
  
  // Helper to convert time to pixel position
  const timeToPosition = (time: Date): number => {
    const elapsed = time.getTime() - timeRange.start.getTime();
    const totalDuration = timeRange.end.getTime() - timeRange.start.getTime();
    return (elapsed / totalDuration) * 100;
  };
  
  // Helper to get width percentage
  const durationToWidth = (startTime: Date, endTime: Date): number => {
    const duration = endTime.getTime() - startTime.getTime();
    const totalDuration = timeRange.end.getTime() - timeRange.start.getTime();
    return (duration / totalDuration) * 100;
  };
  
  // Get priority color
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500 border-red-600';
      case 'medium': return 'bg-yellow-500 border-yellow-600';
      case 'low': return 'bg-green-500 border-green-600';
      default: return 'bg-gray-500 border-gray-600';
    }
  };
  
  // Group prints by printer
  const printsByPrinter = printers.map(printer => ({
    printer,
    prints: scheduledPrints.filter(p => p.printerId === printer.id)
  }));
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Optimized Print Timeline
          </CardTitle>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Workers: {formatWorkHours(farmWorkHours)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Sun className="h-4 w-4 text-yellow-500" />
              <span className="text-muted-foreground">Worker Hours</span>
            </div>
            <div className="flex items-center gap-2">
              <Moon className="h-4 w-4 text-blue-500" />
              <span className="text-muted-foreground">Overnight</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px] pr-4">
          <div className="space-y-6">
            {/* Legend */}
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 rounded"></div>
                <span>High Priority</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                <span>Medium Priority</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded"></div>
                <span>Low Priority</span>
              </div>
            </div>
            
            {/* Timeline for each printer */}
            {printsByPrinter.map(({ printer, prints }) => (
              <div key={printer.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Printer className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-medium">{printer.name}</h3>
                    <Badge variant="outline" className="text-xs">
                      {prints.length} prints
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    24/7 Operation
                  </div>
                </div>
                
                {/* Timeline bar */}
                <div className="relative h-16 bg-muted rounded-lg border border-border overflow-visible">
                  {/* Day markers */}
                  {Array.from({ length: days + 1 }).map((_, dayIndex) => {
                    const dayStart = new Date(timeRange.start);
                    dayStart.setDate(dayStart.getDate() + dayIndex);
                    dayStart.setHours(0, 0, 0, 0);
                    
                    if (dayStart > timeRange.end) return null;
                    
                    const position = timeToPosition(dayStart);
                    
                    return (
                      <div
                        key={dayIndex}
                        className="absolute h-full border-l border-border/50"
                        style={{ left: `${position}%` }}
                      >
                        <span className="absolute -top-6 -translate-x-1/2 text-xs text-muted-foreground">
                          {dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    );
                  })}
                  
                  {/* Work hours shading (global for the farm) */}
                  {Array.from({ length: days }).map((_, dayIndex) => {
                    const dayStart = new Date(timeRange.start);
                    dayStart.setDate(dayStart.getDate() + dayIndex);
                    dayStart.setHours(farmWorkHours.start, 0, 0, 0);
                    
                    const workStart = new Date(dayStart);
                    const workEnd = new Date(dayStart);
                    
                    if (farmWorkHours.start < farmWorkHours.end) {
                      // Normal work hours (e.g., 8am to 6pm)
                      workEnd.setHours(farmWorkHours.end, 0, 0, 0);
                    } else {
                      // Overnight work hours (e.g., 6pm to 6am next day)
                      workEnd.setDate(workEnd.getDate() + 1);
                      workEnd.setHours(farmWorkHours.end, 0, 0, 0);
                    }
                    
                    if (workStart < timeRange.end && workEnd > timeRange.start) {
                      const clampedStart = new Date(Math.max(workStart.getTime(), timeRange.start.getTime()));
                      const clampedEnd = new Date(Math.min(workEnd.getTime(), timeRange.end.getTime()));
                      
                      const left = timeToPosition(clampedStart);
                      const width = durationToWidth(clampedStart, clampedEnd);
                      
                      return (
                        <div
                          key={dayIndex}
                          className="absolute h-full bg-yellow-500/10"
                          style={{ left: `${left}%`, width: `${width}%` }}
                        />
                      );
                    }
                    return null;
                  })}
                  
                  {/* Scheduled prints */}
                  {prints.map((print) => {
                    const left = timeToPosition(print.startTime);
                    const width = durationToWidth(print.startTime, print.endTime);
                    const priorityColor = getPriorityColor(print.priority);
                    
                    return (
                      <div
                        key={print.jobId}
                        className={`absolute h-12 rounded border-2 ${priorityColor} cursor-pointer transition-all hover:scale-105 hover:z-10 flex items-center justify-center px-2 text-white text-xs font-medium overflow-hidden group`}
                        style={{ 
                          left: `${left}%`, 
                          width: `${width}%`,
                          top: '50%',
                          transform: 'translateY(-50%)'
                        }}
                        onClick={() => onPrintClick?.(print)}
                        title={`${print.jobName}\n${formatScheduleTime(print.startTime)} - ${formatScheduleTime(print.endTime)}\n${print.printTimeMinutes} min`}
                      >
                        {print.isOvernight && (
                          <Moon className="h-3 w-3 mr-1 flex-shrink-0" />
                        )}
                        <span className="truncate">{print.jobName}</span>
                        
                        {/* Tooltip on hover */}
                        <div className="absolute hidden group-hover:block bottom-full mb-2 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground border border-border rounded-md shadow-lg p-2 text-xs whitespace-nowrap z-50">
                          <div className="font-semibold">{print.jobName}</div>
                          <div className="text-muted-foreground">
                            {formatScheduleTime(print.startTime)} - {formatScheduleTime(print.endTime)}
                          </div>
                          <div className="text-muted-foreground">
                            Duration: {Math.round(print.printTimeMinutes / 60)}h {print.printTimeMinutes % 60}m
                          </div>
                          <div>
                            <Badge variant={print.isOvernight ? 'secondary' : 'default'} className="text-xs mt-1">
                              {print.isOvernight ? 'Overnight' : 'Work Hours'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Empty state */}
                  {prints.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
                      No prints scheduled
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {/* Summary statistics */}
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Total Scheduled</div>
                    <div className="text-2xl font-bold">{scheduledPrints.length}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Overnight Prints</div>
                    <div className="text-2xl font-bold text-blue-500">
                      {scheduledPrints.filter(p => p.isOvernight).length}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">High Priority</div>
                    <div className="text-2xl font-bold text-red-500">
                      {scheduledPrints.filter(p => p.priority === 'high').length}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Total Time</div>
                    <div className="text-2xl font-bold">
                      {Math.round(scheduledPrints.reduce((sum, p) => sum + p.printTimeMinutes, 0) / 60)}h
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// Queue optimization system that schedules prints based on worker availability and deadlines
// to maximize the number of prints that can be completed
//
// Work hours represent when human workers are present at the print farm to handle prints.
// Printers can operate 24/7, but workers need to be available to remove completed prints.

export interface WorkHours {
  start: number; // hour of day when workers arrive (0-23)
  end: number; // hour of day when workers leave (0-23)
}

export interface PrintJob {
  id: string;
  name: string;
  printTimeMinutes: number;
  deadline: Date;
  priority: 'low' | 'medium' | 'high';
  printerSpecificTimes?: { [printerId: string]: number }; // printer-specific print times in minutes
}

export interface PrinterSchedule {
  printerId: string;
  printerName: string;
}

export interface ScheduledPrint {
  jobId: string;
  jobName: string;
  printerId: string;
  printerName: string;
  startTime: Date;
  endTime: Date;
  printTimeMinutes: number;
  isOvernight: boolean;
  priority: 'low' | 'medium' | 'high';
}

export interface OptimizationResult {
  scheduledPrints: ScheduledPrint[];
  unscheduledJobs: PrintJob[];
  utilizationByPrinter: { [printerId: string]: number }; // percentage of time range
  totalPrintsScheduled: number;
  totalPrintsUnscheduled: number;
  workHours: WorkHours; // Global work hours for the print farm
}

/**
 * Calculate the print time for a specific printer, considering printer-specific times
 */
function getPrintTimeForPrinter(job: PrintJob, printerId: string): number {
  if (job.printerSpecificTimes && job.printerSpecificTimes[printerId]) {
    return job.printerSpecificTimes[printerId];
  }
  return job.printTimeMinutes;
}

/**
 * Check if a time slot is within worker hours (when staff are present)
 */
function isWithinWorkerHours(time: Date, workHours: WorkHours): boolean {
  const hour = time.getHours();
  const minute = time.getMinutes();
  const timeInMinutes = hour * 60 + minute;
  const startInMinutes = workHours.start * 60;
  const endInMinutes = workHours.end * 60;

  if (workHours.start < workHours.end) {
    // Normal range (e.g., 8am to 6pm)
    return timeInMinutes >= startInMinutes && timeInMinutes < endInMinutes;
  } else {
    // Overnight range (e.g., 6pm to 6am) - rare but supported
    return timeInMinutes >= startInMinutes || timeInMinutes < endInMinutes;
  }
}

/**
 * Calculate how many hours a print overlaps with worker hours
 */
function calculateWorkerHoursOverlap(
  startTime: Date,
  endTime: Date,
  workHours: WorkHours
): number {
  let overlapMinutes = 0;
  const currentTime = new Date(startTime);
  
  while (currentTime < endTime) {
    if (isWithinWorkerHours(currentTime, workHours)) {
      overlapMinutes++;
    }
    currentTime.setMinutes(currentTime.getMinutes() + 1);
  }
  
  return overlapMinutes / 60;
}

/**
 * Score a print placement based on multiple factors:
 * - Prints that complete when workers are present get bonus (can be removed immediately)
 * - Long prints that run overnight (finish in morning) get bonus (maximize 24/7 usage)
 * - High priority prints get bonus points
 * - Prints closer to deadline get bonus points
 * - Starting prints just before workers leave allows overnight completion
 */
function scorePlacement(
  job: PrintJob,
  startTime: Date,
  endTime: Date,
  farmWorkHours: WorkHours
): number {
  let score = 0;
  
  // Base score from priority
  const priorityScores = { high: 100, medium: 50, low: 25 };
  score += priorityScores[job.priority];
  
  // Deadline urgency (more urgent = higher score)
  const daysUntilDeadline = (job.deadline.getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24);
  if (daysUntilDeadline < 1) {
    score += 200; // Very urgent
  } else if (daysUntilDeadline < 3) {
    score += 100; // Urgent
  } else if (daysUntilDeadline < 7) {
    score += 50; // Moderately urgent
  }
  
  // Check if print completes when workers are present (ideal for print removal)
  const completesWithWorkers = isWithinWorkerHours(endTime, farmWorkHours);
  if (completesWithWorkers) {
    score += 80; // Bonus for completing during worker hours (can be removed immediately)
  }
  
  // Calculate how much of the print runs during worker hours vs non-worker hours
  const workerHoursOverlap = calculateWorkerHoursOverlap(startTime, endTime, farmWorkHours);
  const printDurationHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
  const nonWorkerHours = printDurationHours - workerHoursOverlap;
  
  // Maximize overnight/non-worker-hours printing (uses printer time when workers aren't needed)
  if (nonWorkerHours > workerHoursOverlap) {
    // More than half the print runs when workers are gone - excellent use of time
    score += 150;
  } else if (nonWorkerHours > 0) {
    // Some overnight printing
    score += 75;
  }
  
  // Long prints that start near end of worker shift get bonus (ideal for overnight completion)
  const startHour = startTime.getHours();
  const endHour = endTime.getHours();
  if (printDurationHours >= 8 && Math.abs(startHour - farmWorkHours.end) <= 2 && 
      Math.abs(endHour - farmWorkHours.start) <= 2) {
    // Perfect overnight print: starts near closing, finishes near opening
    score += 120;
  }
  
  // Short prints during worker hours also valuable (workers can immediately start next print)
  if (printDurationHours < 4 && workerHoursOverlap === printDurationHours) {
    score += 60;
  }
  
  return score;
}

/**
 * Find available time slots for a printer
 */
function findAvailableSlots(
  printer: PrinterSchedule,
  existingSchedule: ScheduledPrint[],
  startDate: Date,
  endDate: Date
): Array<{ start: Date; end: Date }> {
  const slots: Array<{ start: Date; end: Date }> = [];
  const printerSchedule = existingSchedule.filter(s => s.printerId === printer.printerId);
  
  let currentTime = new Date(startDate);
  const finalTime = new Date(endDate);
  
  while (currentTime < finalTime) {
    // Check if this time is occupied
    const isOccupied = printerSchedule.some(
      s => currentTime >= s.startTime && currentTime < s.endTime
    );
    
    if (!isOccupied) {
      // Find the end of this available slot
      let slotEnd = new Date(currentTime);
      while (slotEnd < finalTime) {
        const nextMinute = new Date(slotEnd.getTime() + 60 * 1000);
        const stillAvailable = !printerSchedule.some(
          s => nextMinute >= s.startTime && nextMinute < s.endTime
        );
        if (!stillAvailable) break;
        slotEnd = nextMinute;
      }
      
      slots.push({ start: new Date(currentTime), end: slotEnd });
      currentTime = slotEnd;
    } else {
      currentTime = new Date(currentTime.getTime() + 60 * 1000);
    }
  }
  
  return slots;
}

/**
 * Optimize print queue to maximize throughput considering worker availability and deadlines
 * 
 * Printers run 24/7 continuously. Workers are present during specified hours to remove prints.
 * 
 * Strategy:
 * 1. Sort jobs by priority and deadline urgency
 * 2. For each job, find the best printer and time slot
 * 3. Prefer scheduling long prints to finish when workers arrive (e.g., 12hr print 6pm-6am)
 * 4. Schedule shorter prints during worker hours so they can be removed and next started
 * 5. Maximize overall printer utilization across 24/7 operation
 * 6. Ensure prints complete when workers are available to remove them
 * 7. Keep all printers running as much as possible
 */
export function optimizeQueue(
  jobs: PrintJob[],
  printers: PrinterSchedule[],
  farmWorkHours: WorkHours,
  schedulingWindow: { start: Date; end: Date }
): OptimizationResult {
  const scheduledPrints: ScheduledPrint[] = [];
  const unscheduledJobs: PrintJob[] = [];
  
  // Sort jobs by deadline and priority
  const sortedJobs = [...jobs].sort((a, b) => {
    // First by deadline
    if (a.deadline.getTime() !== b.deadline.getTime()) {
      return a.deadline.getTime() - b.deadline.getTime();
    }
    // Then by priority
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  });
  
  // Try to schedule each job
  for (const job of sortedJobs) {
    let bestPlacement: {
      printer: PrinterSchedule;
      startTime: Date;
      endTime: Date;
      score: number;
    } | null = null;
    
    // Try each printer
    for (const printer of printers) {
      const printTime = getPrintTimeForPrinter(job, printer.printerId);
      const availableSlots = findAvailableSlots(
        printer,
        scheduledPrints,
        schedulingWindow.start,
        schedulingWindow.end
      );
      
      // Try each available slot
      for (const slot of availableSlots) {
        const slotDuration = (slot.end.getTime() - slot.start.getTime()) / (1000 * 60);
        
        // Check if print fits in this slot
        if (slotDuration >= printTime) {
          const startTime = slot.start;
          const endTime = new Date(startTime.getTime() + printTime * 60 * 1000);
          
          // Check if it meets deadline
          if (endTime <= job.deadline) {
            const score = scorePlacement(job, startTime, endTime, farmWorkHours);
            
            if (!bestPlacement || score > bestPlacement.score) {
              bestPlacement = {
                printer,
                startTime,
                endTime,
                score
              };
            }
          }
        }
      }
    }
    
    // Schedule the job if we found a placement
    if (bestPlacement) {
      const printTime = getPrintTimeForPrinter(job, bestPlacement.printer.printerId);
      const workerHoursOverlap = calculateWorkerHoursOverlap(
        bestPlacement.startTime,
        bestPlacement.endTime,
        farmWorkHours
      );
      const printDurationHours = printTime / 60;
      
      scheduledPrints.push({
        jobId: job.id,
        jobName: job.name,
        printerId: bestPlacement.printer.printerId,
        printerName: bestPlacement.printer.printerName,
        startTime: bestPlacement.startTime,
        endTime: bestPlacement.endTime,
        printTimeMinutes: printTime,
        isOvernight: workerHoursOverlap < printDurationHours * 0.5, // More than half runs when workers are gone
        priority: job.priority
      });
    } else {
      unscheduledJobs.push(job);
    }
  }
  
  // Calculate utilization for each printer (percentage of scheduling window used)
  const utilizationByPrinter: { [printerId: string]: number } = {};
  const totalAvailableMinutes = (schedulingWindow.end.getTime() - schedulingWindow.start.getTime()) / (1000 * 60);
  for (const printer of printers) {
    const printerPrints = scheduledPrints.filter(p => p.printerId === printer.printerId);
    const totalPrintTime = printerPrints.reduce((sum, p) => sum + p.printTimeMinutes, 0);
    utilizationByPrinter[printer.printerId] = (totalPrintTime / totalAvailableMinutes) * 100;
  }
  
  return {
    scheduledPrints,
    unscheduledJobs,
    utilizationByPrinter,
    totalPrintsScheduled: scheduledPrints.length,
    totalPrintsUnscheduled: unscheduledJobs.length,
    workHours: farmWorkHours
  };
}

/**
 * Format time for display
 */
export function formatScheduleTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Get a human-readable description of the worker hours (when staff are present)
 */
export function formatWorkHours(workHours: WorkHours): string {
  const formatHour = (hour: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}${period}`;
  };
  
  return `${formatHour(workHours.start)} - ${formatHour(workHours.end)}`;
}

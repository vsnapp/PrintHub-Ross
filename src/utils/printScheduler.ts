/**
 * Intelligent print scheduling system
 * 
 * Schedules prints across multiple printers considering:
 * - Work hours constraints
 * - Due dates/deadlines
 * - Print duration optimization (small jobs during day, large jobs overnight)
 * - Printer availability
 */

export interface WorkHours {
  start: number; // 0-23
  end: number; // 0-23
}

export interface PrintJobToSchedule {
  id: string;
  name: string;
  printTimeMinutes: number;
  dueDate: Date;
  printerId?: string; // Optional: specific printer assignment
  priority: 'low' | 'medium' | 'high';
}

export interface ScheduledSlot {
  jobId: string;
  jobName: string;
  printerId: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  isOvernight: boolean;
}

export interface SchedulerResult {
  scheduled: ScheduledSlot[];
  unschedulable: Array<{
    jobId: string;
    jobName: string;
    reason: string;
    printTimeMinutes: number;
    dueDate: Date;
  }>;
}

/**
 * Check if a time falls within work hours on any day
 */
function isWithinWorkHours(time: Date, workHours: WorkHours): boolean {
  const hour = time.getHours();
  if (workHours.start < workHours.end) {
    return hour >= workHours.start && hour < workHours.end;
  } else {
    // Overnight shift (e.g., 6pm to 6am)
    return hour >= workHours.start || hour < workHours.end;
  }
}

/**
 * Get the end of work hours for a given date
 */
function getWorkHoursEnd(date: Date, workHours: WorkHours): Date {
  const end = new Date(date);
  end.setHours(workHours.end, 0, 0, 0);
  return end;
}

/**
 * Get the start of work hours for a given date
 */
function getWorkHoursStart(date: Date, workHours: WorkHours): Date {
  const start = new Date(date);
  start.setHours(workHours.start, 0, 0, 0);
  return start;
}

/**
 * Check if a job can fit within work hours on a given day
 * Returns the start time if it can fit, null otherwise
 */
function canFitInWorkHours(
  date: Date,
  durationMinutes: number,
  workHours: WorkHours
): Date | null {
  const dayStart = getWorkHoursStart(date, workHours);
  const dayEnd = getWorkHoursEnd(date, workHours);
  const availableMinutes = (dayEnd.getTime() - dayStart.getTime()) / 60000;

  if (durationMinutes <= availableMinutes) {
    return dayStart;
  }
  return null;
}

/**
 * Check if deadline is reachable if we start a job now
 * Considers that overnight prints finish the next morning
 */
function isDeadlineReachable(
  currentDate: Date,
  durationMinutes: number,
  dueDate: Date,
  workHours: WorkHours
): boolean {
  // If printing within work hours, it finishes same day
  const availableMinutes =
    ((workHours.end - workHours.start) * 60);
  
  // If job starts during work hours and finishes during work hours, same day
  if (durationMinutes <= availableMinutes) {
    return currentDate < dueDate;
  }

  // Large job: will be overnight, finishes next morning
  const nextMorning = new Date(currentDate);
  nextMorning.setDate(nextMorning.getDate() + 1);
  nextMorning.setHours(workHours.end, 0, 0, 0);

  return nextMorning < dueDate;
}

/**
 * Determine optimal start time for a print job
 * Logic:
 * - Small jobs (< 2 hours): start during work hours
 * - Medium jobs (2-6 hours): start mid-work hours
 * - Large jobs (> 6 hours): start at end of work hours to avoid blocking capacity
 */
function getOptimalStartTime(
  baseDate: Date,
  durationMinutes: number,
  workHours: WorkHours,
  dueDate: Date
): Date | null {
  const SMALL_JOB_THRESHOLD = 120; // 2 hours
  const MEDIUM_JOB_THRESHOLD = 360; // 6 hours

  const dayStart = getWorkHoursStart(baseDate, workHours);
  const dayEnd = getWorkHoursEnd(baseDate, workHours);
  const workMinutes = (dayEnd.getTime() - dayStart.getTime()) / 60000;

  // Check if deadline is tomorrow
  const tomorrowStart = new Date(baseDate);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const isDeadlineTomorrow = 
    dueDate.toDateString() === tomorrowStart.toDateString();

  // Small job: fits during day
  if (durationMinutes <= SMALL_JOB_THRESHOLD) {
    if (durationMinutes <= workMinutes) {
      // Start at beginning of work day
      return dayStart;
    }
  }

  // Medium job: start mid-shift
  if (durationMinutes <= MEDIUM_JOB_THRESHOLD) {
    if (durationMinutes <= workMinutes) {
      // Start in middle of work hours
      const midStart = new Date(dayStart);
      midStart.setHours(
        workHours.start + Math.floor((workHours.end - workHours.start) / 2)
      );
      return midStart;
    }
  }

  // Large job: start at end of work hours
  // This way it finishes next morning without blocking daytime capacity
  if (isDeadlineTomorrow) {
    // Deadline is tomorrow, MUST start today before end of work hours
    return dayEnd; // Start at end of work hours
  } else {
    // Deadline is later, can start overnight
    return dayEnd;
  }

  return null;
}

/**
 * Main scheduling algorithm
 * Assigns print jobs to printers considering all constraints
 */
export function scheduleJobs(
  jobs: PrintJobToSchedule[],
  printerIds: string[],
  workHours: WorkHours,
  startDate: Date = new Date()
): SchedulerResult {
  const scheduled: ScheduledSlot[] = [];
  const unschedulable: SchedulerResult['unschedulable'] = [];

  // Sort jobs by due date (earliest first)
  const sortedJobs = [...jobs].sort(
    (a, b) => a.dueDate.getTime() - b.dueDate.getTime()
  );

  // Track occupied time slots per printer
  const printerSchedules: Map<string, ScheduledSlot[]> = new Map();
  printerIds.forEach(id => printerSchedules.set(id, []));

  for (const job of sortedJobs) {
    const printerId = job.printerId || printerIds[0]; // Use specified printer or first available
    
    if (!printerIds.includes(printerId)) {
      unschedulable.push({
        jobId: job.id,
        jobName: job.name,
        reason: 'Specified printer not found',
        printTimeMinutes: job.printTimeMinutes,
        dueDate: job.dueDate
      });
      continue;
    }

    // Check if deadline is reachable
    if (!isDeadlineReachable(startDate, job.printTimeMinutes, job.dueDate, workHours)) {
      unschedulable.push({
        jobId: job.id,
        jobName: job.name,
        reason: 'Deadline cannot be met',
        printTimeMinutes: job.printTimeMinutes,
        dueDate: job.dueDate
      });
      continue;
    }

    // Find an available time slot
    let scheduled_Successfully = false;
    let checkDate = new Date(startDate);

    // Try to find a slot within the next 30 days
    for (let daysAhead = 0; daysAhead < 30; daysAhead++) {
      checkDate.setDate(startDate.getDate() + daysAhead);

      // Skip if past due date
      if (checkDate > job.dueDate) break;

      const optimalStart = getOptimalStartTime(
        checkDate,
        job.printTimeMinutes,
        workHours,
        job.dueDate
      );

      if (!optimalStart) continue;

      const endTime = new Date(optimalStart);
      endTime.setMinutes(endTime.getMinutes() + job.printTimeMinutes);

      // Check if this slot conflicts with existing prints on this printer
      const printerSlots = printerSchedules.get(printerId) || [];
      const hasConflict = printerSlots.some(
        slot =>
          (optimalStart >= slot.startTime && optimalStart < slot.endTime) ||
          (endTime > slot.startTime && endTime <= slot.endTime) ||
          (optimalStart <= slot.startTime && endTime >= slot.endTime)
      );

      if (!hasConflict) {
        // Found a slot!
        const slot: ScheduledSlot = {
          jobId: job.id,
          jobName: job.name,
          printerId,
          startTime: optimalStart,
          endTime,
          durationMinutes: job.printTimeMinutes,
          isOvernight:
            optimalStart.getHours() >= workHours.end && endTime.getHours() < workHours.start
        };

        scheduled.push(slot);
        printerSlots.push(slot);
        scheduled_Successfully = true;
        break;
      }
    }

    if (!scheduled_Successfully) {
      unschedulable.push({
        jobId: job.id,
        jobName: job.name,
        reason: 'No available time slot on assigned printer',
        printTimeMinutes: job.printTimeMinutes,
        dueDate: job.dueDate
      });
    }
  }

  return { scheduled, unschedulable };
}

/**
 * Calculate printer utilization percentage
 */
export function calculateUtilization(
  printerSchedules: Map<string, ScheduledSlot[]>,
  timeRange: { start: Date; end: Date }
): Map<string, number> {
  const utilization = new Map<string, number>();

  for (const [printerId, slots] of printerSchedules.entries()) {
    const totalMinutes = (timeRange.end.getTime() - timeRange.start.getTime()) / 60000;
    const usedMinutes = slots.reduce((sum, slot) => sum + slot.durationMinutes, 0);
    const percentage = (usedMinutes / totalMinutes) * 100;
    utilization.set(printerId, Math.round(percentage));
  }

  return utilization;
}

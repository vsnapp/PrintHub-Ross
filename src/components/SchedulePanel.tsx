import { useCallback, useEffect, useState } from 'react';
import { jobsApi, queueApi, workHoursApi } from '@/lib/api';
import { subscribeToEvent } from '@/lib/websocket';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  CalendarClock,
  Loader2,
  Moon,
  RefreshCw,
  Trash2,
  Wand2,
} from 'lucide-react';

interface ScheduleRow {
  id: number;
  job_id: number;
  printer_id: string;
  job_name: string;
  printer_name: string;
  printer_type: string;
  priority: string;
  username: string;
  start_time: string;
  end_time: string;
  is_overnight: number;
}

interface OptimizeSummary {
  scheduled: number;
  unscheduled: number;
  unscheduledJobs: Array<{ id: string; name: string; deadline: string }>;
  utilizationByPrinter: Record<string, number>;
}

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

export function SchedulePanel() {
  const { toast } = useToast();
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [workHours, setWorkHours] = useState({ start: 8, end: 18 });
  const [pendingCount, setPendingCount] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [summary, setSummary] = useState<OptimizeSummary | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [scheduleResponse, workHoursResponse, pendingResponse, approvedResponse] = await Promise.all([
        queueApi.getSchedule(),
        workHoursApi.get(),
        jobsApi.list({ status: 'pending' }),
        jobsApi.list({ status: 'approved' }),
      ]);
      setSchedule(scheduleResponse.data || []);
      setWorkHours({
        start: workHoursResponse.data?.start_hour ?? 8,
        end: workHoursResponse.data?.end_hour ?? 18,
      });
      setPendingCount((pendingResponse.data || []).length);
      setApprovedCount((approvedResponse.data || []).length);
    } catch (error: any) {
      toast({
        title: 'Failed to load schedule',
        description: error.response?.data?.error || 'Unable to fetch schedule data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const refresh = () => fetchData();
    const unsubscribers = [
      subscribeToEvent('queue:optimized', refresh),
      subscribeToEvent('job:created', refresh),
      subscribeToEvent('job:updated', refresh),
      subscribeToEvent('job:completed', refresh),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [fetchData]);

  const handleWorkHoursChange = async (field: 'start' | 'end', value: number) => {
    const next = { ...workHours, [field]: value };
    setWorkHours(next);
    try {
      await workHoursApi.update({ start_hour: next.start, end_hour: next.end });
      toast({
        title: 'Worker hours updated',
        description: `Staff present ${formatHour(next.start)} - ${formatHour(next.end)}. Used by the queue optimizer.`,
      });
    } catch (error: any) {
      toast({
        title: 'Failed to save worker hours',
        description: error.response?.data?.error || 'Unable to update work hours',
        variant: 'destructive',
      });
    }
  };

  const handleOptimize = async () => {
    setOptimizing(true);
    try {
      const response = await queueApi.optimize();
      setSummary(response.data);
      toast({
        title: 'Queue optimized',
        description: `${response.data.scheduled} prints scheduled, ${response.data.unscheduled} could not fit before their deadlines.`,
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Optimization failed',
        description: error.response?.data?.error || 'Unable to optimize queue',
        variant: 'destructive',
      });
    } finally {
      setOptimizing(false);
    }
  };

  const handleRemove = async (scheduleId: number) => {
    try {
      await queueApi.removeFromSchedule(scheduleId);
      toast({ title: 'Removed from schedule', description: 'Job returned to the approved queue.' });
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Failed to remove',
        description: error.response?.data?.error || 'Unable to remove from schedule',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5" />
                Print Queue Optimizer
              </CardTitle>
              <CardDescription>
                Schedules approved prints across online printers, using per-printer print times and your worker hours.
                Long prints are placed overnight; short prints run while staff can swap them.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={fetchData}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button onClick={handleOptimize} disabled={optimizing}>
                {optimizing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4 mr-2" />
                )}
                Optimize Queue
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-6">
            <div className="space-y-1">
              <Label className="text-xs">Worker hours start</Label>
              <Select
                value={String(workHours.start)}
                onValueChange={(value) => handleWorkHoursChange('start', Number.parseInt(value, 10))}
              >
                <SelectTrigger className="w-28 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>{formatHour(i)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Worker hours end</Label>
              <Select
                value={String(workHours.end)}
                onValueChange={(value) => handleWorkHoursChange('end', Number.parseInt(value, 10))}
              >
                <SelectTrigger className="w-28 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>{formatHour(i)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 text-sm">
              <Badge variant="secondary">{pendingCount} awaiting approval</Badge>
              <Badge variant="default">{approvedCount} approved, ready to schedule</Badge>
              <Badge variant="outline">{schedule.length} scheduled</Badge>
            </div>
          </div>

          {summary && summary.unscheduledJobs.length > 0 && (
            <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <div className="font-medium text-destructive mb-1">
                {summary.unscheduledJobs.length} job(s) could not be scheduled before their deadline:
              </div>
              <ul className="list-disc list-inside text-muted-foreground">
                {summary.unscheduledJobs.map((job) => (
                  <li key={job.id}>
                    {job.name} (due {new Date(job.deadline).toLocaleString()})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schedule table */}
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Schedule</CardTitle>
          <CardDescription>
            Run "Optimize Queue" after approving jobs to (re)build this schedule.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {schedule.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nothing scheduled. Approve jobs in Manage Jobs, then optimize the queue.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Printer</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Expected Done</TableHead>
                  <TableHead></TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.job_name}</TableCell>
                    <TableCell>{row.username}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.printer_name}</Badge>
                    </TableCell>
                    <TableCell>{new Date(row.start_time).toLocaleString()}</TableCell>
                    <TableCell>{new Date(row.end_time).toLocaleString()}</TableCell>
                    <TableCell>
                      {row.is_overnight ? (
                        <Badge variant="secondary" className="gap-1">
                          <Moon className="h-3 w-3" />
                          Overnight
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleRemove(row.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

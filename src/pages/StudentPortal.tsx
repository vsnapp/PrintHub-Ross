import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { filesApi, jobsApi, queueApi } from '@/lib/api';
import { subscribeToEvent } from '@/lib/websocket';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Clock,
  FileUp,
  Loader2,
  LogOut,
  Printer as PrinterIcon,
  RefreshCw,
  Timer,
  Trash2,
  Upload,
} from 'lucide-react';

interface StudentJob {
  id: number;
  name: string;
  status: string;
  priority: string;
  printer_type: string;
  deadline: string;
  estimated_time_minutes?: number | null;
  notes?: string;
  created_at: string;
}

interface ScheduleEntry {
  job_id: number;
  printer_name: string;
  start_time: string;
  end_time: string;
}

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Waiting for approval', variant: 'secondary' },
  approved: { label: 'Approved', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  scheduled: { label: 'Scheduled', variant: 'default' },
  printing: { label: 'Printing', variant: 'default' },
  completed: { label: 'Completed - ready for pickup', variant: 'default' },
  failed: { label: 'Failed', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'secondary' },
};

function formatMinutes(minutes?: number | null): string {
  if (!minutes || minutes <= 0) {
    return 'Pending slicing';
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours === 0) {
    return `${mins} min`;
  }
  return `${hours}h ${mins}m`;
}

function defaultDeadline(): string {
  const date = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

const StudentPortal = () => {
  const { user, logout } = useAuth();
  const { toast } = useToast();

  const [stlFile, setStlFile] = useState<File | null>(null);
  const [jobName, setJobName] = useState('');
  const [deadline, setDeadline] = useState(defaultDeadline());
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [printerType, setPrinterType] = useState<'fdm' | 'resin'>('fdm');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<{ minutes: number; grams: number | null } | null>(null);
  const [uploadedFileId, setUploadedFileId] = useState<number | null>(null);

  const [jobs, setJobs] = useState<StudentJob[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  const fetchJobs = useCallback(async () => {
    try {
      const [jobsResponse, scheduleResponse] = await Promise.all([
        jobsApi.list(),
        queueApi.getSchedule().catch(() => ({ data: [] })),
      ]);
      setJobs(jobsResponse.data || []);
      setSchedule(scheduleResponse.data || []);
    } catch (error: any) {
      toast({
        title: 'Failed to load your prints',
        description: error.response?.data?.error || 'Unable to fetch jobs',
        variant: 'destructive',
      });
    } finally {
      setLoadingJobs(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Live refresh when this user's jobs change.
  useEffect(() => {
    const refresh = () => fetchJobs();
    const unsubscribers = [
      subscribeToEvent('job:updated', refresh),
      subscribeToEvent('job:completed', refresh),
      subscribeToEvent('job:approved', refresh),
      subscribeToEvent('queue:optimized', refresh),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [fetchJobs]);

  const scheduleByJob = useMemo(() => {
    const map = new Map<number, ScheduleEntry>();
    for (const entry of schedule) {
      map.set(entry.job_id, entry);
    }
    return map;
  }, [schedule]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!file.name.toLowerCase().endsWith('.stl')) {
      toast({
        title: 'Invalid file',
        description: 'Please upload an STL file',
        variant: 'destructive',
      });
      return;
    }

    setStlFile(file);
    setEstimate(null);
    setUploadedFileId(null);
    if (!jobName) {
      setJobName(file.name.replace(/\.stl$/i, ''));
    }

    // Upload immediately so we can give an instant time estimate.
    setEstimating(true);
    try {
      const uploadResponse = await filesApi.upload(file);
      const fileId = uploadResponse.data?.id;
      setUploadedFileId(fileId);

      const estimateResponse = await filesApi.estimate(fileId, { printer_type: printerType });
      setEstimate({
        minutes: estimateResponse.data?.estimated_time_minutes || 0,
        grams: estimateResponse.data?.estimated_filament_grams ?? null,
      });
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.response?.data?.error || 'Unable to upload STL file',
        variant: 'destructive',
      });
      setStlFile(null);
    } finally {
      setEstimating(false);
    }
  };

  const handlePrinterTypeChange = async (value: 'fdm' | 'resin') => {
    setPrinterType(value);
    if (uploadedFileId) {
      try {
        const estimateResponse = await filesApi.estimate(uploadedFileId, { printer_type: value });
        setEstimate({
          minutes: estimateResponse.data?.estimated_time_minutes || 0,
          grams: estimateResponse.data?.estimated_filament_grams ?? null,
        });
      } catch {
        // Keep prior estimate if the re-estimate fails.
      }
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!uploadedFileId) {
      toast({
        title: 'No file uploaded',
        description: 'Please upload an STL file first',
        variant: 'destructive',
      });
      return;
    }
    if (!jobName.trim() || !deadline) {
      toast({
        title: 'Missing details',
        description: 'Job name and deadline are required',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      await jobsApi.create({
        name: jobName.trim(),
        file_id: uploadedFileId,
        deadline: new Date(deadline).toISOString(),
        priority,
        printer_type: printerType,
        estimated_time_minutes: estimate?.minutes || undefined,
        notes: notes.trim() || undefined,
      });

      toast({
        title: 'Print submitted',
        description: 'Your print job is waiting for operator approval. You will be notified when it is done.',
      });

      setStlFile(null);
      setJobName('');
      setNotes('');
      setEstimate(null);
      setUploadedFileId(null);
      setDeadline(defaultDeadline());
      const input = document.getElementById('student-stl-upload') as HTMLInputElement | null;
      if (input) {
        input.value = '';
      }
      fetchJobs();
    } catch (error: any) {
      toast({
        title: 'Submission failed',
        description: error.response?.data?.error || 'Unable to create print job',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (jobId: number) => {
    try {
      await jobsApi.delete(jobId);
      toast({ title: 'Print removed', description: 'Your pending print was deleted.' });
      fetchJobs();
    } catch (error: any) {
      toast({
        title: 'Failed to delete',
        description: error.response?.data?.error || 'Only pending prints can be deleted',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black">
              Print<span className="text-primary">Hub</span>
            </h1>
            <p className="text-muted-foreground">
              Welcome, {user?.username}. Upload a model and we'll print it for you.
            </p>
          </div>
          <Button variant="outline" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Submit a print */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Submit a Print
              </CardTitle>
              <CardDescription>
                Upload an STL file, set your deadline, and submit it to the print farm.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="student-stl-upload">STL File</Label>
                  <Input
                    id="student-stl-upload"
                    type="file"
                    accept=".stl"
                    onChange={handleFileChange}
                    disabled={estimating || submitting}
                  />
                  {stlFile && (
                    <Badge variant="outline" className="text-xs">
                      <FileUp className="h-3 w-3 mr-1" />
                      {stlFile.name}
                    </Badge>
                  )}
                </div>

                {estimating && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading and estimating print time...
                  </div>
                )}

                {estimate && !estimating && (
                  <div className="rounded-md border border-border bg-muted/50 p-3 text-sm space-y-1">
                    <div className="flex items-center gap-2 font-medium">
                      <Timer className="h-4 w-4" />
                      Estimated print time: {formatMinutes(estimate.minutes)}
                    </div>
                    {estimate.grams !== null && (
                      <div className="text-muted-foreground">
                        Estimated material: ~{estimate.grams}g
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Initial estimate from model geometry; refined automatically once an operator slices your file.
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="job-name">Print Name</Label>
                  <Input
                    id="job-name"
                    value={jobName}
                    onChange={(event) => setJobName(event.target.value)}
                    placeholder="e.g., Robotics bracket v2"
                    disabled={submitting}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="deadline">Needed By</Label>
                    <Input
                      id="deadline"
                      type="datetime-local"
                      value={deadline}
                      onChange={(event) => setDeadline(event.target.value)}
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select value={priority} onValueChange={(value: 'low' | 'medium' | 'high') => setPriority(value)}>
                      <SelectTrigger id="priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="printer-type">Printer Type</Label>
                  <Select value={printerType} onValueChange={handlePrinterTypeChange}>
                    <SelectTrigger id="printer-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fdm">FDM (plastic filament)</SelectItem>
                      <SelectItem value="resin">Resin (high detail)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="job-notes">Notes (optional)</Label>
                  <Input
                    id="job-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Color preference, class period, etc."
                    disabled={submitting}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={submitting || estimating || !uploadedFileId}>
                  {submitting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <PrinterIcon className="h-4 w-4 mr-2" />
                  )}
                  Submit Print Job
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* My prints */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    My Prints
                  </CardTitle>
                  <CardDescription>
                    Track your jobs. You'll be notified here and by email when a print finishes.
                  </CardDescription>
                </div>
                <Button variant="outline" size="icon" onClick={fetchJobs}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingJobs ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No prints yet. Upload an STL to get started!
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {jobs.map((job) => {
                    const statusConfig = STATUS_LABELS[job.status] || { label: job.status, variant: 'secondary' as const };
                    const scheduled = scheduleByJob.get(job.id);
                    return (
                      <div key={job.id} className="rounded-md border border-border p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium truncate">{job.name}</div>
                          <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <div>Estimated time: {formatMinutes(job.estimated_time_minutes)}</div>
                          <div>Needed by: {new Date(job.deadline).toLocaleString()}</div>
                          {scheduled && (
                            <>
                              <div>
                                Printer: {scheduled.printer_name}
                              </div>
                              <div className="font-medium text-foreground">
                                Expected done: {new Date(scheduled.end_time).toLocaleString()}
                              </div>
                            </>
                          )}
                          {job.status === 'rejected' && job.notes && (
                            <div className="col-span-2 text-destructive">Reason: {job.notes}</div>
                          )}
                        </div>
                        {job.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => handleDelete(job.id)}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Cancel request
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default StudentPortal;

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { jobsApi, emailApi } from '@/lib/api';
import { subscribeToEvent } from '@/lib/websocket';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { JobSliceDialog } from './JobSliceDialog';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Mail,
  Loader2,
  RefreshCw,
  Scissors
} from 'lucide-react';

interface Job {
  id: number;
  user_id: number;
  username: string;
  name: string;
  status: string;
  priority: string;
  printer_type: string;
  deadline: string;
  created_at: string;
  updated_at: string;
  notes?: string;
  file_id?: number | null;
  gcode_file_id?: number | null;
  estimated_time_minutes?: number | null;
}

function formatMinutes(minutes?: number | null): string {
  if (!minutes || minutes <= 0) {
    return '—';
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hours === 0 ? `${mins}m` : `${hours}h ${mins}m`;
}

export function JobManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingEmail, setSendingEmail] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [jobToSlice, setJobToSlice] = useState<Job | null>(null);

  const isAdminOrOperator = user?.role === 'admin' || user?.role === 'operator' || (user as any)?.isOrgAdmin;

  useEffect(() => {
    fetchJobs();
  }, [filterStatus]);

  useEffect(() => {
    const refresh = () => fetchJobs();
    const unsubscribers = [
      subscribeToEvent('job:created', refresh),
      subscribeToEvent('job:updated', refresh),
      subscribeToEvent('job:completed', refresh),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [filterStatus]);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const params = filterStatus !== 'all' ? { status: filterStatus } : {};
      const response = await jobsApi.list(params);
      setJobs(response.data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to load jobs',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (jobId: number, newStatus: string) => {
    try {
      // Use the dedicated approve/reject endpoints so notifications fire.
      if (newStatus === 'approved') {
        await jobsApi.approve(jobId);
      } else if (newStatus === 'rejected') {
        const reason = window.prompt('Reason for rejection (shown to the student):') || 'Rejected by operator';
        await jobsApi.reject(jobId, reason);
      } else {
        await jobsApi.update(jobId, { status: newStatus });
      }
      toast({
        title: 'Success',
        description: 'Job status updated successfully',
      });
      fetchJobs();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to update job status',
        variant: 'destructive',
      });
    }
  };

  const handleSendEmail = async (jobId: number) => {
    setSendingEmail(jobId);
    try {
      await emailApi.sendJobEmail(jobId);
      toast({
        title: 'Success',
        description: 'Email notification sent successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to send email',
        variant: 'destructive',
      });
    } finally {
      setSendingEmail(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: any; label: string }> = {
      pending: { variant: 'secondary', label: 'Pending' },
      approved: { variant: 'default', label: 'Approved' },
      rejected: { variant: 'destructive', label: 'Rejected' },
      scheduled: { variant: 'default', label: 'Scheduled' },
      printing: { variant: 'default', label: 'Printing' },
      completed: { variant: 'default', label: 'Completed' },
      failed: { variant: 'destructive', label: 'Failed' },
      cancelled: { variant: 'secondary', label: 'Cancelled' },
    };

    const config = statusConfig[status] || { variant: 'secondary', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      high: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      low: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    };

    return (
      <Badge className={colors[priority] || ''}>
        {priority.charAt(0).toUpperCase() + priority.slice(1)}
      </Badge>
    );
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Job Management</CardTitle>
            <CardDescription>
              Manage print jobs and send completion notifications
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="printing">Printing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={fetchJobs}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No jobs found
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job Name</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Est. Time</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">{job.name}</TableCell>
                  <TableCell>{job.username}</TableCell>
                  <TableCell>{getStatusBadge(job.status)}</TableCell>
                  <TableCell>{getPriorityBadge(job.priority)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {job.printer_type.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      {formatMinutes(job.estimated_time_minutes)}
                      {job.gcode_file_id ? (
                        <Badge variant="outline" className="ml-1 text-[10px]">sliced</Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell>
                    {new Date(job.deadline).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {isAdminOrOperator && (
                        <>
                          {job.file_id && !['completed', 'cancelled', 'rejected'].includes(job.status) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setJobToSlice(job)}
                            >
                              <Scissors className="h-4 w-4 mr-1" />
                              Slice
                            </Button>
                          )}
                          {job.status === 'pending' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleStatusChange(job.id, 'approved')}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleStatusChange(job.id, 'rejected')}
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </>
                          )}
                          {(job.status === 'printing' || job.status === 'approved' || job.status === 'scheduled') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleStatusChange(job.id, 'completed')}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Complete
                            </Button>
                          )}
                          {job.status === 'completed' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSendEmail(job.id)}
                              disabled={sendingEmail === job.id}
                            >
                              {sendingEmail === job.id ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Mail className="h-4 w-4 mr-1" />
                              )}
                              Send Email
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <JobSliceDialog
        job={jobToSlice}
        onClose={() => setJobToSlice(null)}
        onSliced={fetchJobs}
      />
    </Card>
  );
}

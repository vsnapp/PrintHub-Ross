import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  DollarSign, 
  Users, 
  TrendingUp, 
  Building2, 
  Activity, 
  Download,
  Printer,
  Shield,
  Zap,
  BarChart3,
  UserCheck,
  UserX,
  Plus
} from 'lucide-react';

interface PlatformStats {
  revenue: {
    monthlyRecurringRevenue: number;
    totalRevenueAllTime: number;
    revenueThisMonth: number;
    totalOrganizations: number;
    totalPrinters: number;
    totalBillableUsers: number;
    averageRevenuePerOrg: string;
  };
  users: {
    totalUsers: number;
    activeUsers: number;
    totalAdmins: number;
    verifiedUsers: number;
    ssoUsers: number;
    inactiveUsers: number;
  };
  organizations: {
    breakdown: Array<{
      subscription_status: string;
      subscription_plan: string;
      count: number;
    }>;
    topOrganizations: Array<{
      id: number;
      name: string;
      domain: string;
      subscription_plan: string;
      num_printers: number;
      num_additional_users: number;
      total_users: number;
      monthly_revenue: number;
    }>;
  };
  growth: {
    currentMonth: {
      newUsers: number;
      newOrgsWithUsers: number;
    };
    previousMonth: {
      newUsers: number;
      newOrgsWithUsers: number;
    };
    userGrowthPercentage: string;
    recentSignups: Array<{
      date: string;
      count: number;
    }>;
  };
  saml: {
    enabledOrganizations: number;
    samlOrgRevenue: number;
  };
  transactions: {
    total: number;
    thisMonth: number;
  };
  activity: {
    recentAuditActions: Array<{
      action: string;
      count: number;
    }>;
  };
  generatedAt: string;
}

interface RealTimeStats {
  activeUsers: {
    last15Minutes: number;
    today: number;
  };
  recentTransactions: {
    lastHour: number;
    revenueLastHour: number;
  };
  timestamp: string;
}

const SuperAdminDashboard = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [realTimeStats, setRealTimeStats] = useState<RealTimeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Whitelist management state
  const [whitelistUsers, setWhitelistUsers] = useState<any[]>([]);
  const [newWhitelistEmail, setNewWhitelistEmail] = useState('');
  const [whitelistLoading, setWhitelistLoading] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      toast({
        title: 'Access Denied',
        description: 'You must be a system admin to access this page',
        variant: 'destructive',
      });
      navigate('/');
      return;
    }

    fetchStats();
    const interval = setInterval(fetchRealTimeStats, 30000); // Update real-time stats every 30 seconds
    
    return () => clearInterval(interval);
  }, [isAdmin]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [statsRes, realTimeRes] = await Promise.all([
        api.get('/analytics/platform-stats'),
        api.get('/analytics/real-time'),
      ]);

      setStats(statsRes.data);
      setRealTimeStats(realTimeRes.data);
    } catch (error: any) {
      toast({
        title: 'Error loading data',
        description: error.response?.data?.error || 'Failed to load platform statistics',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchRealTimeStats = async () => {
    try {
      const res = await api.get('/analytics/real-time');
      setRealTimeStats(res.data);
    } catch (error) {
      console.error('Error fetching real-time stats:', error);
    }
  };

  const downloadRevenueReport = async () => {
    try {
      const response = await api.get('/analytics/revenue-report', {
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `revenue-report-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast({
        title: 'Report Downloaded',
        description: 'Revenue report has been downloaded successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Download Failed',
        description: error.response?.data?.error || 'Failed to download revenue report',
        variant: 'destructive',
      });
    }
  };

  const fetchWhitelistUsers = async () => {
    setWhitelistLoading(true);
    try {
      const res = await api.get('/whitelist');
      setWhitelistUsers(res.data.users || []);
    } catch (error: any) {
      toast({
        title: 'Error loading whitelist',
        description: error.response?.data?.error || 'Failed to load whitelisted users',
        variant: 'destructive',
      });
    } finally {
      setWhitelistLoading(false);
    }
  };

  const addToWhitelist = async () => {
    if (!newWhitelistEmail.trim()) {
      toast({
        title: 'Email Required',
        description: 'Please enter an email address',
        variant: 'destructive',
      });
      return;
    }

    try {
      await api.post('/whitelist/add', { email: newWhitelistEmail.toLowerCase().trim() });
      toast({
        title: 'User Whitelisted',
        description: `${newWhitelistEmail} has been added to the whitelist`,
      });
      setNewWhitelistEmail('');
      fetchWhitelistUsers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to add user to whitelist',
        variant: 'destructive',
      });
    }
  };

  const removeFromWhitelist = async (email: string) => {
    if (!confirm(`Are you sure you want to remove ${email} from the whitelist? They will start being billed.`)) {
      return;
    }

    try {
      await api.post('/whitelist/remove', { email });
      toast({
        title: 'User Removed',
        description: `${email} has been removed from the whitelist`,
      });
      fetchWhitelistUsers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to remove user from whitelist',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (activeTab === 'whitelist') {
      fetchWhitelistUsers();
    }
  }, [activeTab]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading platform analytics...</p>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-2">Platform Analytics</h1>
              <p className="text-muted-foreground">Super admin dashboard - Platform-wide insights & metrics</p>
            </div>
            <Button onClick={downloadRevenueReport} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export Revenue Report
            </Button>
          </div>
        </div>

        {/* Real-time Stats Banner */}
        {realTimeStats && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <p className="font-medium text-blue-900 dark:text-blue-100">Live Activity</p>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    {realTimeStats.activeUsers.last15Minutes} users active in last 15 min • {realTimeStats.activeUsers.today} users active today
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                Live
              </Badge>
            </div>
          </div>
        )}

        {/* Key Metrics Overview */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Recurring Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.revenue.monthlyRecurringRevenue.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                ${stats.revenue.averageRevenuePerOrg}/org average
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.users.totalUsers}</div>
              <p className="text-xs text-muted-foreground">
                {stats.users.activeUsers} active ({((stats.users.activeUsers / stats.users.totalUsers) * 100).toFixed(1)}%)
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Organizations</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.revenue.totalOrganizations}</div>
              <p className="text-xs text-muted-foreground">
                {stats.saml.enabledOrganizations} with SSO
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">User Growth</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.growth.userGrowthPercentage}%</div>
              <p className="text-xs text-muted-foreground">
                {stats.growth.currentMonth.newUsers} new this month
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="organizations">Organizations</TabsTrigger>
            <TabsTrigger value="growth">Growth</TabsTrigger>
            <TabsTrigger value="whitelist">Whitelist</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Revenue Breakdown</CardTitle>
                  <CardDescription>Platform-wide revenue statistics</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Monthly Recurring Revenue</span>
                    <span className="font-bold">${stats.revenue.monthlyRecurringRevenue.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Revenue This Month</span>
                    <span className="font-bold">${stats.revenue.revenueThisMonth.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Revenue (All Time)</span>
                    <span className="font-bold">${stats.revenue.totalRevenueAllTime.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center border-t pt-2">
                    <span className="text-sm text-muted-foreground">Total Printers</span>
                    <span className="font-bold">{stats.revenue.totalPrinters}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Billable Users</span>
                    <span className="font-bold">{stats.revenue.totalBillableUsers}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>User Statistics</CardTitle>
                  <CardDescription>Platform user metrics</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Users</span>
                    <span className="font-bold">{stats.users.totalUsers}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Active Users</span>
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      {stats.users.activeUsers}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Inactive Users</span>
                    <Badge variant="secondary">{stats.users.inactiveUsers}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Verified Users</span>
                    <span className="font-bold">{stats.users.verifiedUsers}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">SSO Users</span>
                    <span className="font-bold">{stats.users.ssoUsers}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Organization Admins</span>
                    <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                      {stats.users.totalAdmins}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Top audit actions in the last 7 days</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.activity.recentAuditActions.map((action: any, index: number) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{action.action}</TableCell>
                        <TableCell className="text-right">{action.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="revenue" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Top Organizations by Revenue</CardTitle>
                <CardDescription>Highest paying customers</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organization</TableHead>
                      <TableHead>Domain</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead className="text-right">Printers</TableHead>
                      <TableHead className="text-right">Users</TableHead>
                      <TableHead className="text-right">Monthly Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.organizations.topOrganizations.map((org) => (
                      <TableRow key={org.id}>
                        <TableCell className="font-medium">{org.name}</TableCell>
                        <TableCell>{org.domain || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {org.subscription_plan === 'custom' ? 'Custom' : 'Standard'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{org.num_printers}</TableCell>
                        <TableCell className="text-right">{org.total_users}</TableCell>
                        <TableCell className="text-right font-bold">
                          ${org.monthly_revenue.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">SSO Organizations</CardTitle>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.saml.enabledOrganizations}</div>
                  <p className="text-xs text-muted-foreground">
                    ${stats.saml.samlOrgRevenue.toFixed(2)}/month revenue
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Printers</CardTitle>
                  <Printer className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.revenue.totalPrinters}</div>
                  <p className="text-xs text-muted-foreground">
                    ${(stats.revenue.totalPrinters * 10).toFixed(2)}/month from printers
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Transactions</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.transactions.total}</div>
                  <p className="text-xs text-muted-foreground">
                    {stats.transactions.thisMonth} this month
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="organizations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Organization Breakdown</CardTitle>
                <CardDescription>Organizations by status and plan</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.organizations.breakdown.map((item: any, index: number) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Badge 
                            className={
                              item.subscription_status === 'active' 
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                : item.subscription_status === 'trial'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                            }
                          >
                            {item.subscription_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {item.subscription_plan ? (
                            <Badge variant="outline">{item.subscription_plan}</Badge>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="text-right font-bold">{item.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="growth" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Monthly Growth</CardTitle>
                  <CardDescription>Current vs previous month</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Current Month</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">New Users</span>
                        <span className="font-bold">{stats.growth.currentMonth.newUsers}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">New Organizations</span>
                        <span className="font-bold">{stats.growth.currentMonth.newOrgsWithUsers}</span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-semibold mb-2">Previous Month</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">New Users</span>
                        <span className="font-bold">{stats.growth.previousMonth.newUsers}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">New Organizations</span>
                        <span className="font-bold">{stats.growth.previousMonth.newOrgsWithUsers}</span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Growth Rate</span>
                      <Badge className={
                        parseFloat(stats.growth.userGrowthPercentage) > 0
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      }>
                        {stats.growth.userGrowthPercentage}%
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Sign-ups</CardTitle>
                  <CardDescription>New users in the last 30 days</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {stats.growth.recentSignups.slice(0, 15).map((signup: any, index: number) => (
                      <div key={index} className="flex justify-between items-center py-2 border-b last:border-0">
                        <span className="text-sm">{signup.date}</span>
                        <Badge variant="outline">{signup.count} users</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="whitelist" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Whitelisted Users
                </CardTitle>
                <CardDescription>
                  Manage users who don't get billed for their usage. Whitelist yourself and trusted team members to avoid charges.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Add User to Whitelist */}
                <div className="space-y-2">
                  <Label htmlFor="whitelist-email">Add User to Whitelist</Label>
                  <div className="flex gap-2">
                    <Input
                      id="whitelist-email"
                      type="email"
                      placeholder="email@example.com"
                      value={newWhitelistEmail}
                      onChange={(e) => setNewWhitelistEmail(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addToWhitelist()}
                    />
                    <Button onClick={addToWhitelist} disabled={whitelistLoading}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Enter the email address of an existing user. They will not be counted in billing calculations.
                  </p>
                </div>

                {/* Whitelist Table */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium">
                      Whitelisted Users ({whitelistUsers.length})
                    </h3>
                    {whitelistLoading && (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                    )}
                  </div>
                  
                  {whitelistUsers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <UserCheck className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No whitelisted users yet</p>
                      <p className="text-sm mt-1">Add users above to exclude them from billing</p>
                    </div>
                  ) : (
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Username</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Added On</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {whitelistUsers.map((whitelistUser) => (
                            <TableRow key={whitelistUser.id}>
                              <TableCell className="font-medium">{whitelistUser.username}</TableCell>
                              <TableCell>{whitelistUser.email}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{whitelistUser.role}</Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {new Date(whitelistUser.created_at).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => removeFromWhitelist(whitelistUser.email)}
                                >
                                  <UserX className="h-4 w-4 mr-1" />
                                  Remove
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Info Box */}
                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="flex gap-3">
                    <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-medium text-blue-900 dark:text-blue-100">About Whitelist</p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        Whitelisted users are excluded from all billing calculations. They can use printers and access the system without incurring any charges to their organization. This is useful for platform administrators, team members, or beta testers.
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-300 mt-2">
                        <strong>Note:</strong> Add yourself (viktorsnapp@gmail.com) to avoid being billed for your own usage.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="mt-8 flex justify-between items-center">
          <Button variant="outline" onClick={() => navigate('/')}>
            Back to Dashboard
          </Button>
          <p className="text-xs text-muted-foreground">
            Last updated: {new Date(stats.generatedAt).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;

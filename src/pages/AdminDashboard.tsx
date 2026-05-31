import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, DollarSign, Printer, Shield, AlertCircle, Mail } from 'lucide-react';

interface OrganizationUser {
  id: number;
  username: string;
  email: string;
  role: string;
  is_org_admin: boolean;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
}

interface UsageData {
  organizationId: number;
  numPrinters: number;
  numRegularUsers: number;
  numAdmins: number;
  numBillableUsers: number;
  note: string;
}

interface CostData {
  organizationId: number;
  pricingModel: string;
  numPrinters: number;
  numAdditionalUsers: number;
  pricePerPrinter: number;
  pricePerAdditionalUser: number;
  printerCost: number;
  userCost: number;
  monthlyFee: number;
  currency: string;
  breakdown?: Array<{
    item: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
}

const AdminDashboard = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [cost, setCost] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('users');

  const organizationId = (user as any)?.organizationId;
  const isOrgAdmin = (user as any)?.isOrgAdmin || isAdmin;

  useEffect(() => {
    if (!isOrgAdmin) {
      toast({
        title: 'Access Denied',
        description: 'You must be an organization admin to access this page',
        variant: 'destructive',
      });
      navigate('/');
      return;
    }

    if (!organizationId) {
      toast({
        title: 'No Organization',
        description: 'You must belong to an organization to access this page',
        variant: 'destructive',
      });
      navigate('/');
      return;
    }

    fetchData();
  }, [organizationId, isOrgAdmin]);

  const fetchData = async () => {
    if (!organizationId) return;
    
    setLoading(true);
    try {
      const [usersRes, usageRes, costRes] = await Promise.all([
        api.get(`/organizations/${organizationId}/users`),
        api.get(`/subscriptions/usage/${organizationId}`),
        api.get(`/subscriptions/calculate-cost/${organizationId}`),
      ]);

      setUsers(usersRes.data);
      setUsage(usageRes.data);
      setCost(costRes.data);
    } catch (error: any) {
      toast({
        title: 'Error loading data',
        description: error.response?.data?.error || 'Failed to load dashboard data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAdmin = async (userId: number, currentStatus: boolean) => {
    try {
      await api.patch(`/organizations/${organizationId}/users/${userId}`, {
        isOrgAdmin: !currentStatus,
      });

      toast({
        title: 'Success',
        description: `Admin status ${!currentStatus ? 'granted' : 'removed'}`,
      });

      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to update admin status',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (userId: number, currentStatus: boolean) => {
    try {
      await api.patch(`/organizations/${organizationId}/users/${userId}`, {
        isActive: !currentStatus,
      });

      toast({
        title: 'Success',
        description: `User ${!currentStatus ? 'activated' : 'deactivated'}`,
      });

      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to update user status',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Organization Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage users, admins, and view usage & costs</p>
        </div>

        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{usage?.numRegularUsers || 0}</div>
              <p className="text-xs text-muted-foreground">Regular users</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Admins</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{usage?.numAdmins || 0}</div>
              <p className="text-xs text-muted-foreground">
                {usage?.numAdmins === 1 ? '1 free' : `1 free, ${(usage?.numAdmins || 0) - 1} billed`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Printers</CardTitle>
              <Printer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{usage?.numPrinters || 0}</div>
              <p className="text-xs text-muted-foreground">Active printers</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monthly Cost</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${cost?.monthlyFee?.toFixed(2) || '0.00'}
              </div>
              <p className="text-xs text-muted-foreground">
                {cost?.pricingModel === 'custom' ? 'Custom pricing' : 'Usage-based'}
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="users">Users & Admins</TabsTrigger>
            <TabsTrigger value="costs">Usage & Costs</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Manage Users</CardTitle>
                <CardDescription>
                  Add or remove admin privileges and manage user access
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-blue-900 dark:text-blue-100">Billing Note</p>
                      <p className="text-blue-700 dark:text-blue-300">
                        First admin is free. Additional admins are billed at $0.25/month each.
                      </p>
                    </div>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Admin</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((orgUser) => (
                      <TableRow key={orgUser.id}>
                        <TableCell className="font-medium">{orgUser.username}</TableCell>
                        <TableCell>{orgUser.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{orgUser.role}</Badge>
                        </TableCell>
                        <TableCell>
                          {orgUser.is_org_admin ? (
                            <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                              Admin
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {orgUser.is_active ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">Admin:</span>
                              <Switch
                                checked={orgUser.is_org_admin}
                                onCheckedChange={() => handleToggleAdmin(orgUser.id, orgUser.is_org_admin)}
                                disabled={orgUser.id === user?.id}
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">Active:</span>
                              <Switch
                                checked={orgUser.is_active}
                                onCheckedChange={() => handleToggleActive(orgUser.id, orgUser.is_active)}
                                disabled={orgUser.id === user?.id}
                              />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="costs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Current Usage</CardTitle>
                <CardDescription>
                  Real-time usage statistics for your organization
                </CardDescription>
              </CardHeader>
              <CardContent>
                {usage && (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="border rounded-lg p-4">
                        <div className="text-sm text-muted-foreground mb-1">Printers</div>
                        <div className="text-2xl font-bold">{usage.numPrinters}</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          ${cost?.pricePerPrinter || 10}/month each
                        </div>
                      </div>

                      <div className="border rounded-lg p-4">
                        <div className="text-sm text-muted-foreground mb-1">Regular Users</div>
                        <div className="text-2xl font-bold">{usage.numRegularUsers}</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          ${cost?.pricePerAdditionalUser || 0.25}/month each
                        </div>
                      </div>

                      <div className="border rounded-lg p-4">
                        <div className="text-sm text-muted-foreground mb-1">Total Admins</div>
                        <div className="text-2xl font-bold">{usage.numAdmins}</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          First admin free, additional ${cost?.pricePerAdditionalUser || 0.25}/month
                        </div>
                      </div>

                      <div className="border rounded-lg p-4">
                        <div className="text-sm text-muted-foreground mb-1">Billable Users</div>
                        <div className="text-2xl font-bold">{usage.numBillableUsers}</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {usage.numRegularUsers} users + {Math.max(0, usage.numAdmins - 1)} admins
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">{usage.note}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cost Breakdown</CardTitle>
                <CardDescription>
                  Monthly billing details for your organization
                </CardDescription>
              </CardHeader>
              <CardContent>
                {cost && (
                  <div className="space-y-4">
                    {cost.breakdown && cost.breakdown.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead className="text-right">Quantity</TableHead>
                            <TableHead className="text-right">Unit Price</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cost.breakdown.map((item, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium">{item.item}</TableCell>
                              <TableCell className="text-right">{item.quantity}</TableCell>
                              <TableCell className="text-right">
                                ${item.unitPrice.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right">
                                ${item.total.toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="font-bold border-t-2">
                            <TableCell colSpan={3}>Total Monthly Cost</TableCell>
                            <TableCell className="text-right">
                              ${cost.monthlyFee.toFixed(2)} {cost.currency}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-lg font-bold mb-2">
                          Monthly Cost: ${cost.monthlyFee.toFixed(2)} {cost.currency}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {cost.pricingModel === 'custom' ? 'Custom institutional pricing' : 'Usage-based pricing'}
                        </p>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button variant="outline" onClick={() => window.open(process.env.EXTERNAL_BILLING_URL || '#', '_blank')}>
                        Manage Billing
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="mt-8 flex gap-4">
          <Button variant="outline" onClick={() => navigate('/')}>
            Back to Dashboard
          </Button>
          <Button variant="outline" onClick={() => navigate('/email-settings')}>
            <Mail className="h-4 w-4 mr-2" />
            Email Settings
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;

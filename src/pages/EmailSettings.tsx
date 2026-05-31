import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { emailApi, type EmailSettings } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, Send, ArrowLeft, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const EmailSettingsPage = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [settings, setSettings] = useState<EmailSettings>({
    enabled: false,
    autoSendOnCompletion: false,
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPassword: '',
    fromEmail: '',
    fromName: 'PrintHub',
    subjectTemplate: '',
    messageTemplate: '',
  });

  const [testEmail, setTestEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [defaultTemplates, setDefaultTemplates] = useState<any>(null);

  const isOrgAdmin = (user as any)?.isOrgAdmin || isAdmin || user?.role === 'operator';

  useEffect(() => {
    if (!isOrgAdmin) {
      toast({
        title: 'Access Denied',
        description: 'You must be an admin to access email settings',
        variant: 'destructive',
      });
      navigate('/');
      return;
    }

    fetchSettings();
    fetchTemplates();
  }, [isOrgAdmin]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await emailApi.getSettings();
      setSettings(response.data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to load email settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await emailApi.getTemplates();
      setDefaultTemplates(response.data);
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await emailApi.updateSettings(settings);
      toast({
        title: 'Success',
        description: 'Email settings saved successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to save settings',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) {
      toast({
        title: 'Error',
        description: 'Please enter a test email address',
        variant: 'destructive',
      });
      return;
    }

    setTesting(true);
    try {
      await emailApi.testEmail(testEmail);
      toast({
        title: 'Success',
        description: `Test email sent to ${testEmail}`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to send test email',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleResetTemplates = () => {
    if (defaultTemplates) {
      setSettings({
        ...settings,
        subjectTemplate: defaultTemplates.subject,
        messageTemplate: defaultTemplates.message,
      });
      toast({
        title: 'Templates Reset',
        description: 'Email templates have been reset to defaults',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading email settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-2">
              <Mail className="h-8 w-8" />
              Email Notification Settings
            </h1>
            <p className="text-muted-foreground">
              Configure email notifications for print job completion
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>

        <Tabs defaultValue="settings" className="space-y-6">
          <TabsList>
            <TabsTrigger value="settings">SMTP Settings</TabsTrigger>
            <TabsTrigger value="templates">Email Templates</TabsTrigger>
            <TabsTrigger value="test">Test Email</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Email Configuration</CardTitle>
                <CardDescription>
                  Configure SMTP server settings for sending email notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="enabled">Enable Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Turn on email notification system
                    </p>
                  </div>
                  <Switch
                    id="enabled"
                    checked={settings.enabled}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, enabled: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="autoSend">Automatic Sending</Label>
                    <p className="text-sm text-muted-foreground">
                      Send emails automatically when jobs complete
                    </p>
                  </div>
                  <Switch
                    id="autoSend"
                    checked={settings.autoSendOnCompletion}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, autoSendOnCompletion: checked })
                    }
                  />
                </div>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    If automatic sending is disabled, admins can manually send completion 
                    emails using the "Send Email" button in the job list.
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="smtpHost">SMTP Host *</Label>
                    <Input
                      id="smtpHost"
                      placeholder="smtp.gmail.com"
                      value={settings.smtpHost}
                      onChange={(e) =>
                        setSettings({ ...settings, smtpHost: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtpPort">SMTP Port *</Label>
                    <Input
                      id="smtpPort"
                      type="number"
                      placeholder="587"
                      value={settings.smtpPort}
                      onChange={(e) =>
                        setSettings({ ...settings, smtpPort: parseInt(e.target.value) || 587 })
                      }
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="smtpSecure">Use SSL/TLS</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable for port 465 (SSL)
                    </p>
                  </div>
                  <Switch
                    id="smtpSecure"
                    checked={settings.smtpSecure}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, smtpSecure: checked })
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="smtpUser">SMTP Username *</Label>
                    <Input
                      id="smtpUser"
                      placeholder="user@example.com"
                      value={settings.smtpUser}
                      onChange={(e) =>
                        setSettings({ ...settings, smtpUser: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtpPassword">SMTP Password *</Label>
                    <Input
                      id="smtpPassword"
                      type="password"
                      placeholder="Enter password"
                      value={settings.smtpPassword}
                      onChange={(e) =>
                        setSettings({ ...settings, smtpPassword: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fromEmail">From Email</Label>
                    <Input
                      id="fromEmail"
                      placeholder="noreply@printhub.com"
                      value={settings.fromEmail}
                      onChange={(e) =>
                        setSettings({ ...settings, fromEmail: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave empty to use SMTP username
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fromName">From Name</Label>
                    <Input
                      id="fromName"
                      placeholder="PrintHub"
                      value={settings.fromName}
                      onChange={(e) =>
                        setSettings({ ...settings, fromName: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={fetchSettings}>
                    Reset
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Settings'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Email Templates</CardTitle>
                <CardDescription>
                  Customize the email subject and message sent to students
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Available variables: <code className="text-xs">{'{{jobName}}'}</code>,{' '}
                    <code className="text-xs">{'{{username}}'}</code>,{' '}
                    <code className="text-xs">{'{{createdAt}}'}</code>,{' '}
                    <code className="text-xs">{'{{completedAt}}'}</code>,{' '}
                    <code className="text-xs">{'{{printerType}}'}</code>
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label htmlFor="subjectTemplate">Email Subject</Label>
                  <Input
                    id="subjectTemplate"
                    placeholder="Your 3D Print is Ready - {{jobName}}"
                    value={settings.subjectTemplate}
                    onChange={(e) =>
                      setSettings({ ...settings, subjectTemplate: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="messageTemplate">Email Message</Label>
                  <Textarea
                    id="messageTemplate"
                    placeholder="Enter your email template..."
                    value={settings.messageTemplate}
                    onChange={(e) =>
                      setSettings({ ...settings, messageTemplate: e.target.value })
                    }
                    rows={12}
                    className="font-mono text-sm"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={handleResetTemplates}>
                    Reset to Default
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Templates'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="test" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Test Email Configuration</CardTitle>
                <CardDescription>
                  Send a test email to verify your SMTP settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {!settings.enabled && (
                  <Alert variant="destructive">
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Email notifications are currently disabled. Enable them in the SMTP Settings tab.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="testEmail">Test Email Address</Label>
                  <Input
                    id="testEmail"
                    type="email"
                    placeholder="your.email@example.com"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                </div>

                <Button
                  onClick={handleTestEmail}
                  disabled={testing || !settings.enabled}
                  className="w-full"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {testing ? 'Sending...' : 'Send Test Email'}
                </Button>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    A test email will be sent to verify your SMTP configuration.
                    Make sure you've saved your settings first.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default EmailSettingsPage;

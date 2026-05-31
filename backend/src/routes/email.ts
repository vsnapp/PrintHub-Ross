import { Router } from 'express';
import { authenticateToken, AuthRequest, requireRole } from '../middleware/auth';
import { db } from '../database';
import { emailService, EmailSettings, DEFAULT_EMAIL_TEMPLATES } from '../utils/emailService';

const router = Router();

/**
 * Get email settings for organization (org admin or admin only)
 */
router.get('/settings', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    
    // Only admins and org admins can access email settings
    if (user.role !== 'admin' && user.role !== 'operator' && !user.isOrgAdmin) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    const organizationId = user.organizationId || 1; // Default to 1 for global admin

    const org = db.prepare('SELECT settings FROM organizations WHERE id = ?').get(organizationId) as any;
    
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    let emailSettings: EmailSettings;
    
    if (org.settings) {
      try {
        const settings = JSON.parse(org.settings);
        emailSettings = settings.email || getDefaultEmailSettings();
      } catch (error) {
        emailSettings = getDefaultEmailSettings();
      }
    } else {
      emailSettings = getDefaultEmailSettings();
    }

    // Don't send password to client
    const sanitizedSettings = { ...emailSettings };
    if (sanitizedSettings.smtpPassword) {
      sanitizedSettings.smtpPassword = '********';
    }

    res.json(sanitizedSettings);
  } catch (error) {
    console.error('Get email settings error:', error);
    res.status(500).json({ error: 'Failed to retrieve email settings' });
  }
});

/**
 * Update email settings for organization (org admin or admin only)
 */
router.patch('/settings', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    
    // Only admins and org admins can update email settings
    if (user.role !== 'admin' && user.role !== 'operator' && !user.isOrgAdmin) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    const organizationId = user.organizationId || 1;
    const newEmailSettings: Partial<EmailSettings> = req.body;

    // Get current settings
    const org = db.prepare('SELECT settings FROM organizations WHERE id = ?').get(organizationId) as any;
    
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    let currentSettings: any = {};
    if (org.settings) {
      try {
        currentSettings = JSON.parse(org.settings);
      } catch (error) {
        currentSettings = {};
      }
    }

    // Merge email settings
    const currentEmailSettings = currentSettings.email || getDefaultEmailSettings();
    
    // Don't update password if it's empty or the masked placeholder
    // This prevents users from accidentally clearing the password or setting it to the placeholder
    if (!newEmailSettings.smtpPassword || newEmailSettings.smtpPassword === '********') {
      delete newEmailSettings.smtpPassword;
    }

    const updatedEmailSettings = {
      ...currentEmailSettings,
      ...newEmailSettings,
    };

    // Update settings in database
    const updatedSettings = {
      ...currentSettings,
      email: updatedEmailSettings,
    };

    db.prepare('UPDATE organizations SET settings = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(JSON.stringify(updatedSettings), organizationId);

    // Reinitialize email service with new settings
    emailService.initialize(updatedEmailSettings);

    // Return sanitized settings
    const sanitizedSettings = { ...updatedEmailSettings };
    if (sanitizedSettings.smtpPassword) {
      sanitizedSettings.smtpPassword = '********';
    }

    res.json({
      message: 'Email settings updated successfully',
      settings: sanitizedSettings,
    });
  } catch (error) {
    console.error('Update email settings error:', error);
    res.status(500).json({ error: 'Failed to update email settings' });
  }
});

/**
 * Test email configuration (org admin or admin only)
 */
router.post('/test', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    
    // Only admins and org admins can test email
    if (user.role !== 'admin' && user.role !== 'operator' && !user.isOrgAdmin) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    const { testEmail } = req.body;
    
    if (!testEmail) {
      return res.status(400).json({ error: 'Test email address required' });
    }

    if (!emailService.isReady()) {
      return res.status(400).json({ error: 'Email service not configured. Please configure SMTP settings first.' });
    }

    // Test connection
    const connectionOk = await emailService.testConnection();
    
    if (!connectionOk) {
      return res.status(500).json({ error: 'Failed to connect to SMTP server. Please check your settings.' });
    }

    // Send test email
    const success = await emailService.sendEmail({
      to: testEmail,
      subject: 'PrintHub - Test Email',
      text: `This is a test email from PrintHub.\n\nYour email configuration is working correctly!\n\nSent at: ${new Date().toISOString()}`,
    });

    if (success) {
      res.json({ message: 'Test email sent successfully', success: true });
    } else {
      res.status(500).json({ error: 'Failed to send test email', success: false });
    }
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

/**
 * Send job completion email manually (admin or operator only)
 */
router.post('/send/:jobId', authenticateToken, requireRole(['admin', 'operator']), async (req: AuthRequest, res) => {
  try {
    const jobId = parseInt(req.params.jobId);

    // Get job and user details
    const job = db.prepare(`
      SELECT pj.*, u.email, u.username 
      FROM print_jobs pj
      JOIN users u ON pj.user_id = u.id
      WHERE pj.id = ?
    `).get(jobId) as any;

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!emailService.isReady()) {
      return res.status(400).json({ error: 'Email service not configured' });
    }

    // Send email
    const success = await emailService.sendJobCompletionEmail(job.email, {
      jobName: job.name,
      username: job.username,
      createdAt: new Date(job.created_at).toLocaleString(),
      completedAt: job.updated_at ? new Date(job.updated_at).toLocaleString() : new Date().toLocaleString(),
      printerType: job.printer_type.toUpperCase(),
    });

    if (success) {
      res.json({ message: 'Email sent successfully', success: true });
    } else {
      res.status(500).json({ error: 'Failed to send email', success: false });
    }
  } catch (error) {
    console.error('Send job email error:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

/**
 * Get default email templates
 */
router.get('/templates', authenticateToken, (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    
    // Only admins and org admins can access templates
    if (user.role !== 'admin' && user.role !== 'operator' && !user.isOrgAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(DEFAULT_EMAIL_TEMPLATES);
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Failed to get templates' });
  }
});

/**
 * Helper function to get default email settings
 */
function getDefaultEmailSettings(): EmailSettings {
  return {
    enabled: false,
    autoSendOnCompletion: false,
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPassword: '',
    fromEmail: '',
    fromName: 'PrintHub',
    subjectTemplate: DEFAULT_EMAIL_TEMPLATES.subject,
    messageTemplate: DEFAULT_EMAIL_TEMPLATES.message,
  };
}

export default router;

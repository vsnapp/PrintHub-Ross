import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface EmailSettings {
  enabled: boolean;
  autoSendOnCompletion: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPassword?: string;
  fromEmail?: string;
  fromName?: string;
  subjectTemplate?: string;
  messageTemplate?: string;
}

export interface EmailData {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

// Default email templates
export const DEFAULT_EMAIL_TEMPLATES = {
  subject: 'Your 3D Print is Ready - {{jobName}}',
  message: `Hello {{username}},

Your 3D print job "{{jobName}}" has been completed and is ready for pickup!

Job Details:
- Job Name: {{jobName}}
- Submitted: {{createdAt}}
- Completed: {{completedAt}}
- Printer Type: {{printerType}}

Please pick up your print at your earliest convenience.

Thank you,
PrintHub Team`
};

class EmailService {
  private transporter: Transporter | null = null;
  private settings: EmailSettings | null = null;

  /**
   * Initialize email service with settings
   */
  initialize(settings: EmailSettings) {
    this.settings = settings;

    if (!settings.enabled || !settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
      console.log('Email service not initialized: incomplete settings');
      this.transporter = null;
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: settings.smtpHost,
        port: settings.smtpPort || 587,
        secure: settings.smtpSecure || false,
        auth: {
          user: settings.smtpUser,
          pass: settings.smtpPassword,
        },
      });

      console.log('Email service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize email service:', error);
      this.transporter = null;
    }
  }

  /**
   * Check if email service is ready
   */
  isReady(): boolean {
    return this.transporter !== null && this.settings?.enabled === true;
  }

  /**
   * Sanitize email display name to prevent header injection
   */
  private sanitizeDisplayName(name: string): string {
    // Remove newlines, carriage returns, and other potentially dangerous characters
    return name.replace(/[\r\n\x00]/g, '').trim();
  }

  /**
   * Escape HTML in template values to prevent injection
   */
  private escapeHtml(text: string): string {
    const htmlEscapes: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
    };
    return text.replace(/[&<>"'/]/g, (char) => htmlEscapes[char] || char);
  }

  /**
   * Send email
   */
  async sendEmail(data: EmailData): Promise<boolean> {
    if (!this.isReady() || !this.transporter || !this.settings) {
      console.log('Email service not ready, skipping email send');
      return false;
    }

    try {
      const sanitizedFromName = this.settings.fromName ? this.sanitizeDisplayName(this.settings.fromName) : '';
      
      const mailOptions = {
        from: sanitizedFromName
          ? `"${sanitizedFromName}" <${this.settings.fromEmail || this.settings.smtpUser}>`
          : this.settings.fromEmail || this.settings.smtpUser,
        to: data.to,
        subject: data.subject,
        text: data.text,
        html: data.html || data.text.replace(/\n/g, '<br>'),
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', info.messageId);
      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  }

  /**
   * Send job completion notification
   */
  async sendJobCompletionEmail(
    userEmail: string,
    jobData: {
      jobName: string;
      username: string;
      createdAt: string;
      completedAt: string;
      printerType: string;
    }
  ): Promise<boolean> {
    if (!this.isReady() || !this.settings) {
      return false;
    }

    // Get templates or use defaults
    const subjectTemplate = this.settings.subjectTemplate || DEFAULT_EMAIL_TEMPLATES.subject;
    const messageTemplate = this.settings.messageTemplate || DEFAULT_EMAIL_TEMPLATES.message;

    // Replace template variables
    const subject = this.replaceTemplateVariables(subjectTemplate, jobData);
    const message = this.replaceTemplateVariables(messageTemplate, jobData);

    return await this.sendEmail({
      to: userEmail,
      subject,
      text: message,
    });
  }

  /**
   * Replace template variables in string with escaped values
   */
  private replaceTemplateVariables(template: string, data: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(data)) {
      // Escape HTML entities to prevent injection
      const escapedValue = this.escapeHtml(value);
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, escapedValue);
    }
    return result;
  }

  /**
   * Test email configuration
   */
  async testConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Email connection test failed:', error);
      return false;
    }
  }

  /**
   * Get current settings
   */
  getSettings(): EmailSettings | null {
    return this.settings;
  }

  /**
   * Check if auto-send is enabled
   */
  isAutoSendEnabled(): boolean {
    return this.settings?.autoSendOnCompletion === true && this.isReady();
  }
}

// Export singleton instance
export const emailService = new EmailService();

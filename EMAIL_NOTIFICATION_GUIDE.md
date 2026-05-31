# Email Notification System for Print Completion

This feature enables administrators and operators to send email notifications to students when their 3D prints are completed.

## Features

### 1. Email Configuration Settings
- **SMTP Configuration**: Configure your email server settings (host, port, credentials)
- **Auto/Manual Mode**: Choose between automatic emails on job completion or manual sending
- **Customizable Templates**: Customize email subject and message templates with variable substitution
- **Test Email**: Send test emails to verify SMTP configuration

### 2. Email Templates
Email templates support the following variables:
- `{{jobName}}` - Name of the print job
- `{{username}}` - Student's username
- `{{createdAt}}` - When the job was created
- `{{completedAt}}` - When the job was completed
- `{{printerType}}` - Type of printer (FDM/Resin)

**Default Template:**
```
Subject: Your 3D Print is Ready - {{jobName}}

Body:
Hello {{username}},

Your 3D print job "{{jobName}}" has been completed and is ready for pickup!

Job Details:
- Job Name: {{jobName}}
- Submitted: {{createdAt}}
- Completed: {{completedAt}}
- Printer Type: {{printerType}}

Please pick up your print at your earliest convenience.

Thank you,
PrintHub Team
```

### 3. Sending Modes

#### Automatic Mode
When enabled, emails are automatically sent when a job status changes to 'completed'.

#### Manual Mode
Admins can manually send emails for completed jobs using the "Send Email" button in the Job Management interface.

## API Endpoints

### Get Email Settings
```
GET /api/email/settings
Authorization: Bearer <token>
```

### Update Email Settings
```
PATCH /api/email/settings
Authorization: Bearer <token>
Content-Type: application/json

{
  "enabled": true,
  "autoSendOnCompletion": true,
  "smtpHost": "smtp.gmail.com",
  "smtpPort": 587,
  "smtpUser": "your-email@example.com",
  "smtpPassword": "your-password",
  "fromName": "PrintHub",
  "subjectTemplate": "Your 3D Print is Ready - {{jobName}}",
  "messageTemplate": "..."
}
```

### Test Email Configuration
```
POST /api/email/test
Authorization: Bearer <token>
Content-Type: application/json

{
  "testEmail": "test@example.com"
}
```

### Send Job Completion Email (Manual)
```
POST /api/email/send/:jobId
Authorization: Bearer <token>
```

### Get Default Templates
```
GET /api/email/templates
Authorization: Bearer <token>
```

## User Interface

### Email Settings Page
Access: `/email-settings`
- Configure SMTP settings
- Enable/disable email notifications
- Toggle automatic vs manual sending
- Customize email templates
- Test email configuration

### Job Management Page
Access: `/jobs`
- View all print jobs
- Approve/reject pending jobs
- Mark jobs as completed
- Send completion emails manually (for completed jobs)

### Navigation
Email settings can be accessed from:
1. Admin Dashboard - "Email Settings" button
2. User Menu (for admins/operators) - "Email Settings" option

## Setup Instructions

### 1. Configure SMTP Settings
1. Navigate to `/email-settings`
2. Fill in your SMTP server details:
   - SMTP Host (e.g., smtp.gmail.com)
   - SMTP Port (typically 587 for TLS, 465 for SSL)
   - SMTP Username
   - SMTP Password
   - From Email (optional)
   - From Name (optional)

### 2. Choose Sending Mode
- Enable "Email Notifications" toggle
- Enable "Automatic Sending" for automatic emails when jobs complete
- Or leave it disabled to manually send emails via the Jobs page

### 3. Customize Templates (Optional)
- Navigate to the "Email Templates" tab
- Customize the subject and message templates
- Use available variables for personalization

### 4. Test Configuration
- Navigate to the "Test Email" tab
- Enter a test email address
- Click "Send Test Email" to verify settings

## For Gmail Users

If using Gmail SMTP, you'll need to:
1. Enable 2-factor authentication on your Google account
2. Generate an "App Password" for PrintHub
3. Use the app password instead of your regular password

**Gmail SMTP Settings:**
- Host: smtp.gmail.com
- Port: 587
- Secure: No (uses STARTTLS)
- User: your-email@gmail.com
- Password: your-app-password

## Security

- Email settings are stored encrypted in the database
- Passwords are never returned in API responses (masked as `********`)
- Access restricted to admins, operators, and organization admins
- Email service validates SMTP connection before sending

## Troubleshooting

### Emails Not Sending
1. Verify SMTP settings are correct
2. Test connection using the "Test Email" feature
3. Check that "Email Notifications" is enabled
4. Ensure firewall allows outbound connections to SMTP server
5. Check backend logs for error messages

### Gmail Issues
- Enable "Less secure app access" or use App Passwords
- Ensure 2FA is enabled and app password is generated
- Check Google account activity for blocked sign-in attempts

### Template Variables Not Replaced
- Ensure variables are wrapped in double curly braces: `{{variableName}}`
- Check that variable names match exactly (case-sensitive)

## Database Schema

Email settings are stored in the `organizations.settings` JSON field:
```json
{
  "email": {
    "enabled": true,
    "autoSendOnCompletion": true,
    "smtpHost": "smtp.gmail.com",
    "smtpPort": 587,
    "smtpSecure": false,
    "smtpUser": "user@example.com",
    "smtpPassword": "encrypted_password",
    "fromEmail": "noreply@printhub.com",
    "fromName": "PrintHub",
    "subjectTemplate": "...",
    "messageTemplate": "..."
  }
}
```

# Licensing and Institutional Authentication Guide

## Overview

The Print Farm Orchestrator now supports production-ready licensing with monthly subscriptions and institutional SSO/SAML authentication. This enables organizations (like universities) to manage their print farms with proper access control and billing.

## Features

### 1. **Multi-Tenant Organization Support**
- Organizations can be created with unique domains (e.g., `gatech.edu`)
- Users with matching email domains are automatically associated with their organization
- Organization admins can manage users within their organization

### 2. **Subscription Management**
- Three subscription tiers: Basic, Professional, Enterprise
- Monthly billing through Stripe integration
- Trial period support
- Automatic subscription status checking
- Payment failure handling

### 3. **Institutional SSO/SAML Authentication**
- Support for SAML-based single sign-on
- Domain-based authentication routing
- Automatic user provisioning from SSO
- Georgia Tech example: Users with `@gatech.edu` can authenticate through GT's SSO

### 4. **Access Control**
- Role-based access control: student, operator, admin, org_admin
- Organization-level permissions
- Subscription-based feature gating
- Audit logging for compliance

## Setup Instructions

### Backend Configuration

1. **Environment Variables** (see `backend/.env.example`):

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Frontend URL for redirects
FRONTEND_URL=https://your-domain.com

# SAML Configuration (for institutional SSO)
SAML_ENTRY_POINT=https://idp.gatech.edu/saml/sso
SAML_ISSUER=print-farm-orchestrator
SAML_CALLBACK_URL=https://your-domain.com/api/saml/callback
```

2. **Database Migration**:
The new schema includes:
- `organizations` table
- `subscription_transactions` table
- `audit_logs` table
- Updated `users` table with organization linkage

3. **Start the Backend**:
```bash
cd backend
npm install
npm run build
npm start
```

### Stripe Setup

1. **Create Stripe Account**: Sign up at https://stripe.com

2. **Create Products and Prices**:
   - Basic Plan: $29/month
   - Professional Plan: $79/month
   - Enterprise Plan: $199/month

3. **Configure Webhook**:
   - URL: `https://your-domain.com/api/subscriptions/webhook`
   - Events to listen for:
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`

4. **Get API Keys**:
   - Copy Secret Key and Publishable Key to `.env`
   - Copy Webhook Secret after creating webhook

### SAML/SSO Setup (Example: Georgia Tech)

1. **Register Application with IdP**:
   - Contact Georgia Tech IT to register your app
   - Provide metadata URL: `https://your-domain.com/api/saml/metadata?organizationId=1`

2. **Create Organization**:
```bash
curl -X POST https://your-domain.com/api/organizations \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Georgia Tech",
    "domain": "gatech.edu",
    "subscriptionPlan": "enterprise"
  }'
```

3. **Configure SAML Settings**:
```bash
curl -X PATCH https://your-domain.com/api/organizations/1/saml \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "entityId": "print-farm-gatech",
    "ssoUrl": "https://login.gatech.edu/saml/sso",
    "certificate": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
  }'
```

4. **User Flow**:
   - User visits login page
   - Enters email: `student@gatech.edu`
   - System detects domain and redirects to GT SSO
   - User authenticates with GT credentials
   - System creates/updates user account and logs them in

## API Endpoints

### Organizations

```typescript
GET    /api/organizations           // List all organizations (admin only)
POST   /api/organizations           // Create organization (admin only)
GET    /api/organizations/:id       // Get organization details
PATCH  /api/organizations/:id/subscription  // Update subscription
PATCH  /api/organizations/:id/saml  // Configure SAML settings
GET    /api/organizations/:id/users // List organization users
PATCH  /api/organizations/:id/users/:userId  // Update user in org
GET    /api/organizations/:id/subscription/status  // Check subscription
GET    /api/organizations/:id/audit-logs     // Get audit logs
```

### Subscriptions

```typescript
GET    /api/subscriptions/plans     // Get available subscription plans
POST   /api/subscriptions/create-checkout-session  // Start subscription
POST   /api/subscriptions/create-portal-session    // Manage subscription
POST   /api/subscriptions/webhook   // Stripe webhook handler
```

### SAML Authentication

```typescript
GET    /api/saml/login              // Initiate SAML login
POST   /api/saml/callback           // SAML callback (ACS)
GET    /api/saml/metadata           // Get SAML metadata
GET    /api/saml/check-domain       // Check if domain supports SSO
```

### Authentication

```typescript
POST   /api/auth/login              // Standard login
POST   /api/auth/register           // Register new user
GET    /api/auth/me                 // Get current user
POST   /api/auth/logout             // Logout
```

## User Roles

### Student
- Submit print jobs
- View own jobs
- Upload files
- Basic access

### Operator
- All student permissions
- Approve/reject jobs
- Manage queue
- Control printers

### Organization Admin
- All operator permissions (for their org)
- Manage organization users
- View organization analytics
- Configure SAML settings
- Manage billing (view only)

### System Admin
- Full system access
- Create organizations
- Manage all users
- Configure subscriptions
- System-wide settings

## Subscription Plans

### Basic ($29/month)
- Up to 10 users
- Up to 5 printers
- Basic support
- Job queue management
- 10 GB file storage

### Professional ($79/month)
- Up to 50 users
- Up to 20 printers
- Priority support
- Advanced queue optimization
- 100 GB file storage
- Custom slicer profiles
- Analytics dashboard

### Enterprise ($199/month)
- Unlimited users
- Unlimited printers
- 24/7 dedicated support
- SSO/SAML integration
- 1 TB file storage
- Custom integrations
- SLA guarantee

## Security Features

### Rate Limiting
- General API: 100 requests per 15 minutes
- Authentication: 5 attempts per 15 minutes
- File uploads: 20 per hour
- Payment operations: 10 per hour

### Audit Logging
All sensitive operations are logged:
- User creation/modification
- Organization changes
- SAML authentication
- Subscription updates
- Job approvals/rejections

### License Validation
Middleware checks subscription status before allowing:
- Job submissions (beyond trial limits)
- User additions (beyond plan limits)
- Printer additions (beyond plan limits)

## Example: Setting Up Georgia Tech

1. **Create Admin Account**:
```bash
# Login with default admin (change password!)
# Username: admin
# Password: admin123
```

2. **Create Georgia Tech Organization**:
```bash
curl -X POST http://localhost:3000/api/organizations \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Georgia Tech",
    "domain": "gatech.edu",
    "subscriptionPlan": "enterprise"
  }'
```

3. **Activate Subscription**:
```bash
curl -X PATCH http://localhost:3000/api/organizations/1/subscription \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subscriptionId": "sub_gatech123",
    "status": "active",
    "plan": "enterprise",
    "startsAt": "2025-01-01T00:00:00Z",
    "endsAt": "2026-01-01T00:00:00Z"
  }'
```

4. **Configure SAML** (coordinates with GT IT):
```bash
curl -X PATCH http://localhost:3000/api/organizations/1/saml \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "entityId": "print-farm-gatech",
    "ssoUrl": "https://login.gatech.edu/saml/sso",
    "certificate": "CERTIFICATE_FROM_GT_IT"
  }'
```

5. **Assign Organization Admin**:
```bash
# After first GT user logs in via SAML
curl -X PATCH http://localhost:3000/api/organizations/1/users/2 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "isOrgAdmin": true
  }'
```

## Testing

### Test Domain Verification
```bash
curl http://localhost:3000/api/saml/check-domain?email=student@gatech.edu
```

Expected response:
```json
{
  "ssoEnabled": true,
  "organizationName": "Georgia Tech",
  "organizationId": 1,
  "requiresSso": true
}
```

### Test Subscription Status
```bash
curl -H "Authorization: Bearer USER_TOKEN" \
  http://localhost:3000/api/organizations/1/subscription/status
```

Expected response:
```json
{
  "valid": true
}
```

## Troubleshooting

### SAML Authentication Not Working
1. Check SAML configuration in organization settings
2. Verify IdP certificate is correct
3. Check callback URL matches IdP configuration
4. Review audit logs for SAML errors

### Subscription Issues
1. Verify Stripe webhook is configured
2. Check webhook secret matches environment variable
3. Review subscription_transactions table
4. Check organization subscription_status field

### Domain Verification Not Working
1. Ensure organization domain is set correctly (lowercase)
2. Verify email parsing logic in `getDomainFromEmail()`
3. Check organizations table for domain entry

## Production Deployment

1. **Set Strong JWT Secret**:
```bash
JWT_SECRET=$(openssl rand -base64 32)
```

2. **Configure Reverse Proxy** (nginx):
```nginx
location /api {
    proxy_pass http://localhost:3000;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

3. **Enable HTTPS** (Let's Encrypt):
```bash
certbot --nginx -d your-domain.com
```

4. **Set Production Environment**:
```bash
NODE_ENV=production
```

5. **Monitor Logs**:
```bash
pm2 start dist/index.js --name print-farm-api
pm2 logs print-farm-api
```

## Support

For issues or questions:
- Check audit logs: `/api/organizations/:id/audit-logs`
- Review server logs
- Contact support@print-farm-orchestrator.com

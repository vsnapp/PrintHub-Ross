# Updated Pricing Model and Features

## Overview

The pricing model has been updated to a more flexible, usage-based system with institutional custom pricing options.

## New Pricing Model

### Standard Pricing (Usage-Based)
- **$10/month per printer**
- **$0.25/month per user**
- **First admin is FREE** (one free user per organization)

### How It Works

1. **Printers**: Each active printer in your organization costs $10/month
2. **Users**: 
   - First organization admin: **FREE** (one free user)
   - Additional admins: $0.25/month each
   - Regular users (students, staff): $0.25/month each
3. **No limits**: Add as many printers and users as you need

### Example Costs

| Scenario | Printers | Admins | Regular Users | Billable Users | Monthly Cost |
|----------|----------|--------|---------------|----------------|--------------|
| Small Lab | 3 | 2 | 15 | 16* | $34.00 |
| Medium Department | 10 | 5 | 50 | 54* | $113.50 |
| Large University | 25 | 10 | 500 | 509* | $377.25 |

*Billable Users = (Admins - 1) + Regular Users

**Calculation for Small Lab**: `(3 printers × $10) + (16 billable users × $0.25) = $30 + $4 = $34.00`

### Custom Institutional Pricing

For large institutions (universities, research centers, etc.), we offer custom pricing:
- Volume discounts available
- Flexible payment terms
- Includes SSO/SAML integration
- Dedicated support
- Custom integration options
- SLA guarantees

**Contact us for a custom quote tailored to your institution's needs.**

## Admin vs Additional User

### Organization Admins
- **First admin**: FREE (included with every organization)
- **Additional admins**: $0.25/month each

Organization admins have full management capabilities:
- Manage organization users
- **Add/remove other admins** (new feature!)
- Configure printers
- Manage subscriptions
- View audit logs
- Configure SAML/SSO settings

### Regular Users ($0.25/month each)
Regular users have standard access:
- Submit print jobs
- View their own jobs
- Upload files
- Track print status

## Key Features

### 1. Admins Can Add Other Admins
Organization admins can now grant admin privileges to other users:

**API Endpoint**: `PATCH /api/organizations/:id/users/:userId`

**Request Body**:
```json
{
  "isOrgAdmin": true
}
```

This allows distributed management within large organizations.

### 2. External Billing/Purchasing

Subscription purchasing is handled on a **separate billing website** (not integrated into the print farm app):

- Users are redirected to external billing portal for purchases
- External system confirms purchases via API
- Print farm tracks usage and subscription status

**Configuration**: Set `EXTERNAL_BILLING_URL` in environment variables

### 3. Automatic Usage Tracking

The system automatically tracks:
- Number of active printers
- Number of organization admins (free)
- Number of additional users (billed)

**API Endpoint**: `GET /api/subscriptions/usage/:organizationId`

**Response**:
```json
{
  "organizationId": 1,
  "numPrinters": 5,
  "numRegularUsers": 25,
  "numAdmins": 3,
  "numBillableUsers": 27,
  "note": "First admin is free, additional admins and all regular users are billed at $0.25/month each"
}
```

### 4. Pricing Calculator

Calculate exact monthly costs for an organization:

**API Endpoint**: `GET /api/subscriptions/calculate-cost/:organizationId`

**Response**:
```json
{
  "organizationId": 1,
  "pricingModel": "usage-based",
  "numPrinters": 5,
  "numAdditionalUsers": 27,
  "pricePerPrinter": 10.00,
  "pricePerAdditionalUser": 0.25,
  "printerCost": 50.00,
  "userCost": 6.75,
  "monthlyFee": 56.75,
  "currency": "USD",
  "breakdown": [
    { "item": "Printers", "quantity": 5, "unitPrice": 10.00, "total": 50.00 },
    { "item": "Billable Users", "quantity": 27, "unitPrice": 0.25, "total": 6.75 }
  ]
}
```
Note: numAdditionalUsers includes regular users plus additional admins (admins - 1)

## API Changes

### New Endpoints

1. **`GET /api/subscriptions/plans`** - Get pricing information (updated)
   - Returns usage-based pricing details
   - Explains admin vs user distinction
   - Lists custom pricing options

2. **`GET /api/subscriptions/calculate-cost/:organizationId`** - Calculate monthly cost
   - Authenticated endpoint
   - Returns detailed cost breakdown

3. **`GET /api/subscriptions/usage/:organizationId`** - Get current usage
   - Shows printers, admins, and additional users
   - Real-time counts from database

4. **`PATCH /api/subscriptions/update-usage/:organizationId`** - Update usage (admin only)
   - Manual adjustment of printer/user counts
   - For synchronization with external billing

5. **`POST /api/subscriptions/confirm-purchase`** - Confirm external purchase (admin only)
   - Called by external billing system
   - Activates subscription in print farm

### Modified Endpoints

1. **`POST /api/subscriptions/create-portal-session`** - Now redirects to external billing
   - Returns URL to external billing portal
   - No longer uses Stripe portal directly

2. **`PATCH /api/organizations/:id/users/:userId`** - Enhanced admin management
   - Can now set `isOrgAdmin: true` to grant admin privileges
   - Existing admins can create new admins

### Removed Endpoints

1. **`POST /api/subscriptions/create-checkout-session`** - Removed
   - Purchasing now handled on external site
   - Use external billing URL instead

## Database Schema Changes

### Organizations Table Updates

**New fields**:
- `num_printers` - Current number of active printers
- `num_additional_users` - Current number of billable users
- `price_per_printer` - Price per printer (default: $10.00)
- `price_per_additional_user` - Price per user (default: $0.25)
- `custom_pricing` - Boolean flag for custom pricing
- `custom_monthly_fee` - Custom monthly fee (if applicable)
- `subscription_plan` - Now 'standard' or 'custom' (was 'basic'/'pro'/'enterprise')

**Removed fields**:
- `max_users` - No longer needed (no limits)
- `max_printers` - No longer needed (no limits)

## Migration Guide

### For Existing Deployments

If you have an existing database, you'll need to migrate:

1. **Backup your database first!**

2. Add new columns to organizations table:
```sql
ALTER TABLE organizations ADD COLUMN num_printers INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN num_additional_users INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN price_per_printer REAL DEFAULT 10.00;
ALTER TABLE organizations ADD COLUMN price_per_additional_user REAL DEFAULT 0.25;
ALTER TABLE organizations ADD COLUMN custom_pricing BOOLEAN DEFAULT 0;
ALTER TABLE organizations ADD COLUMN custom_monthly_fee REAL;
```

3. Update subscription_plan values:
```sql
UPDATE organizations SET subscription_plan = 'standard' 
WHERE subscription_plan IN ('basic', 'pro', 'enterprise');
```

4. Initialize usage counts:
```sql
-- Count printers per organization (if you have multi-tenant printers)
-- Otherwise, set to total printer count
UPDATE organizations SET num_printers = (SELECT COUNT(*) FROM printers WHERE is_active = 1);

-- Count additional users per organization
UPDATE organizations o SET num_additional_users = (
  SELECT COUNT(*) FROM users 
  WHERE organization_id = o.id AND is_active = 1 AND is_org_admin = 0
);
```

## Environment Variables

### New Required Variables

Add to your `.env` file:

```env
# External Billing/Purchasing Site
EXTERNAL_BILLING_URL=https://billing.example.com

# Pricing Configuration (optional - defaults shown)
PRICE_PER_PRINTER=10.00
PRICE_PER_ADDITIONAL_USER=0.25
```

### Removed Variables

These are no longer needed:
- `STRIPE_SECRET_KEY` (unless using Stripe webhooks)
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_PRICE_BASIC`
- `STRIPE_PRICE_PRO`
- `STRIPE_PRICE_ENTERPRISE`

## Workflow

### For Standard Organizations

1. **Sign Up**: Organization created on external billing site
2. **Purchase**: Organization purchases on external billing site
   - Selects number of printers needed
   - Estimates number of users
3. **Activation**: External billing site calls `/api/subscriptions/confirm-purchase`
4. **Usage**: Print farm tracks actual usage automatically
5. **Billing**: External site queries `/api/subscriptions/calculate-cost` monthly

### For Custom Pricing Organizations

1. **Contact Sales**: Institution contacts sales team
2. **Custom Quote**: Sales provides custom pricing
3. **Agreement**: Contract signed with custom terms
4. **Setup**: Admin creates organization with custom pricing:
```bash
curl -X POST /api/subscriptions/confirm-purchase \
  -H "Authorization: ******" \
  -d '{
    "organizationId": 1,
    "subscriptionId": "custom_gt_2025",
    "numPrinters": 50,
    "numAdditionalUsers": 1000,
    "customPricing": true,
    "customMonthlyFee": 500.00
  }'
```
5. **Activation**: Organization activated with custom fee

## Benefits of New Model

### For Small Organizations
- **Lower entry cost**: Start with just 1 printer ($10/month) + 1 free admin
- **Predictable costs**: Pay only for what you use
- **No limits**: Grow without plan upgrades

### For Large Institutions
- **Custom pricing**: Negotiate volume discounts
- **Flexible**: Scale up/down as needed
- **One free admin**: First admin included with every organization

### For Everyone
- **Simple pricing**: Easy to understand and calculate
- **No tiers**: No need to choose between plans
- **Transparent**: See exact costs at any time

## Admin Self-Service

Organization admins can now fully self-manage:

### Add New Admin
```bash
PATCH /api/organizations/1/users/5
{
  "isOrgAdmin": true
}
```

### Remove Admin Privileges
```bash
PATCH /api/organizations/1/users/5
{
  "isOrgAdmin": false
}
```

### Deactivate User
```bash
PATCH /api/organizations/1/users/5
{
  "isActive": false
}
```

This enables distributed management in large organizations where multiple departments may need admin access.

## Summary

✅ **Changed**: Pricing from tiered plans to usage-based ($10/printer + $0.25/user)  
✅ **Changed**: Purchasing handled on external billing site  
✅ **Added**: Custom institutional pricing option  
✅ **Added**: Ability for admins to add other admins  
✅ **Added**: Automatic usage tracking  
✅ **Added**: Cost calculation API  
✅ **Clarified**: First admin is FREE, all additional admins and users are billed at $0.25/month  
✅ **Removed**: Direct Stripe checkout integration (use external site instead)

This new model is more flexible, scalable, and affordable for organizations of all sizes!

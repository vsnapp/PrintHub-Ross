# Organization Admin Dashboard - UI Preview

## Access Path
**URL:** `www.snapplabs.co/printhub/admin`

## Dashboard Layout

### Top Navigation
```
┌─────────────────────────────────────────────────────────────────────┐
│  Organization Admin Dashboard        [User Menu Icon]               │
│  Manage users, admins, and view usage & costs                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Stats Overview (4 Cards)
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Total Users  │ │   Admins     │ │  Printers    │ │ Monthly Cost │
│             │ │              │ │              │ │              │
│     25       │ │      3       │ │      5       │ │  $56.75      │
│ Regular users│ │ 1 free, 2    │ │ Active       │ │ Usage-based  │
│              │ │   billed     │ │  printers    │ │              │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

### Tabs
```
┌─────────────────────────────────────────────────────────────────────┐
│  [Users & Admins]  [Usage & Costs]                                  │
└─────────────────────────────────────────────────────────────────────┘
```

## Tab 1: Users & Admins

### Billing Note (Blue Banner)
```
┌─────────────────────────────────────────────────────────────────────┐
│ ℹ️  Billing Note                                                     │
│ First admin is free. Additional admins are billed at $0.25/month.  │
└─────────────────────────────────────────────────────────────────────┘
```

### User Management Table
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ User          │ Email              │ Role    │ Admin  │ Active │ Actions           │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ john_doe      │ john@gatech.edu    │ student │ Admin  │ Active │ Admin: ⚫ Active: ⚫│
│ jane_smith    │ jane@gatech.edu    │ student │ Admin  │ Active │ Admin: ⚫ Active: ⚫│
│ alice_jones   │ alice@gatech.edu   │ student │   -    │ Active │ Admin: ⚪ Active: ⚫│
│ bob_wilson    │ bob@gatech.edu     │ student │   -    │ Active │ Admin: ⚪ Active: ⚫│
│ carol_brown   │ carol@gatech.edu   │ student │   -    │ Inactive│Admin: ⚪ Active: ⚪│
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Toggle Actions:**
- **Admin Switch:** Grant/remove admin privileges (turns user into org admin)
- **Active Switch:** Enable/disable user account

## Tab 2: Usage & Costs

### Current Usage Section
```
┌──────────────────────────────────────────────────────────────────────┐
│ Current Usage                                                        │
│ Real-time usage statistics for your organization                    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────┐│
│  │  Printers    │  │Regular Users │  │ Total Admins │  │Billable ││
│  │              │  │              │  │              │  │ Users   ││
│  │      5       │  │      25      │  │      3       │  │   27    ││
│  │ $10/mo each  │  │ $0.25/mo each│  │First free,   │  │25+2     ││
│  │              │  │              │  │add'l $0.25/mo│  │         ││
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────┘│
│                                                                      │
│  Note: First admin is free, additional admins and all regular       │
│        users are billed at $0.25/month each                         │
└──────────────────────────────────────────────────────────────────────┘
```

### Cost Breakdown Section
```
┌──────────────────────────────────────────────────────────────────────┐
│ Cost Breakdown                                                       │
│ Monthly billing details for your organization                       │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Item              │ Quantity │ Unit Price │    Total               │
│  ────────────────────────────────────────────────────────           │
│  Printers          │    5     │   $10.00   │  $50.00               │
│  Billable Users    │   27     │   $0.25    │   $6.75               │
│  ────────────────────────────────────────────────────────           │
│  Total Monthly Cost                          │  $56.75 USD          │
│                                                                      │
│                                     [Manage Billing]                │
└──────────────────────────────────────────────────────────────────────┘
```

### Back Button
```
[← Back to Dashboard]
```

## User Menu Integration

When clicking the user menu icon in any page:
```
┌──────────────────────────────┐
│ User Settings                │
│ username • email@example.com │
├──────────────────────────────┤
│ [⚙️ Admin Dashboard]         │ ← NEW! Only shown for org admins
├──────────────────────────────┤
│ Dark Mode    ☀️ ⚫ 🌙       │
├──────────────────────────────┤
│ Pause on Filament Runout     │
│              ⚠️ ⚫           │
├──────────────────────────────┤
│ [🚪 Sign Out]               │
└──────────────────────────────┘
```

## Features Summary

### ✅ View & Manage Users
- See all users in organization
- View user details (email, role, status)
- Quick visual status with badges

### ✅ Admin Management
- Toggle admin privileges with a switch
- Cannot remove own admin status
- Clear indication of who is an admin

### ✅ User Access Control
- Enable/disable user accounts
- Cannot disable own account
- Immediate effect on user access

### ✅ Real-Time Usage Statistics
- Live count of printers
- Live count of users (regular and admins)
- Automatic billable user calculation

### ✅ Cost Transparency
- Detailed breakdown of costs
- Clear pricing per item
- Total monthly cost prominently displayed
- Link to external billing for management

### ✅ Security & Access
- Only accessible to organization admins
- Protected route with authentication check
- Redirects unauthorized users
- Uses organization ID from user context

## API Calls Made

1. **On Page Load:**
   - `GET /api/organizations/:id/users` - Fetch all users
   - `GET /api/subscriptions/usage/:id` - Get usage statistics
   - `GET /api/subscriptions/calculate-cost/:id` - Get cost breakdown

2. **When Toggling Admin:**
   - `PATCH /api/organizations/:id/users/:userId` with `{ isOrgAdmin: true/false }`

3. **When Toggling Active:**
   - `PATCH /api/organizations/:id/users/:userId` with `{ isActive: true/false }`

## Responsive Design
- Mobile-friendly layout
- Cards stack on smaller screens
- Table scrolls horizontally on mobile
- Touch-friendly switches

## Color Coding
- **Green badges:** Active/Admin status
- **Gray badges:** Inactive status
- **Blue note:** Billing information
- **Purple badge:** Admin indicator

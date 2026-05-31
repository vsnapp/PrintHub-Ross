# Whitelist Feature Documentation

## Overview

The whitelist feature allows system administrators to exempt specific users from billing calculations. This is useful for:
- Platform administrators (e.g., viktorsnapp@gmail.com)
- Internal team members
- Beta testers
- VIP users

## How It Works

### Database Changes

A new column `is_whitelisted` has been added to the `users` table:
- Type: BOOLEAN
- Default: 0 (false)
- When set to 1 (true), the user is excluded from all billing calculations

### Billing Impact

Whitelisted users are **completely excluded** from billing:
- They don't count as "regular users" ($0.25/month)
- They don't count as "additional admins" ($0.25/month)
- They can be org admins without affecting the "first admin free" rule
- Their printer usage doesn't affect organization costs

### API Endpoints

**List Whitelisted Users** (System Admin Only)
```
GET /api/whitelist
```
Returns all users who are currently whitelisted.

**Add User to Whitelist** (System Admin Only)
```
POST /api/whitelist/add
Body: { "email": "user@example.com" }
```
Adds an existing user to the whitelist by their email address.

**Remove User from Whitelist** (System Admin Only)
```
POST /api/whitelist/remove
Body: { "email": "user@example.com" }
```
Removes a user from the whitelist. They will start being billed normally.

**Check Whitelist Status** (Public)
```
GET /api/whitelist/check/:email
```
Returns whether an email address is whitelisted (useful for registration flows).

### Usage Calculation Changes

The `/api/subscriptions/usage/:organizationId` endpoint now:
- Excludes whitelisted users from all counts
- Shows `numWhitelistedUsers` separately
- Calculates billable users as: `(admins - whitelisted admins - 1) + (regular users - whitelisted regular users)`

Example response:
```json
{
  "organizationId": 1,
  "numPrinters": 5,
  "numRegularUsers": 25,
  "numAdmins": 3,
  "numWhitelistedUsers": 1,
  "numBillableUsers": 26,
  "note": "First admin is free, additional admins and all regular users are billed at $0.25/month each. Whitelisted users are never billed."
}
```

## User Interface

### Super Admin Dashboard - Whitelist Tab

Navigate to `/printhub/super-admin` and click the **Whitelist** tab.

**Features:**
1. **Add Users to Whitelist**
   - Enter any existing user's email address
   - Click "Add" to whitelist them
   - They will immediately be excluded from billing

2. **View Whitelisted Users**
   - Table showing all whitelisted users
   - Displays username, email, role, and when they were added
   - Quick remove button for each user

3. **Remove from Whitelist**
   - Click "Remove" next to any user
   - Confirm the action (they will start being billed)
   - User is removed from whitelist

### Access Control

- Only system administrators (role='admin') can access whitelist management
- Audit logs record all whitelist changes
- IP address and user agent tracked for compliance

## Example: Whitelisting Yourself

To whitelist yourself (viktorsnapp@gmail.com) and avoid billing:

1. **Login as system admin**
2. **Navigate to** `/printhub/super-admin`
3. **Click "Whitelist" tab**
4. **Enter email:** `viktorsnapp@gmail.com`
5. **Click "Add"**
6. **Verify:** Your email appears in the whitelisted users table

You will now be excluded from all billing calculations, regardless of your role or organization.

## Security & Audit

All whitelist operations are logged:
- User who made the change
- Email address whitelisted/removed
- Timestamp
- IP address
- User agent

View audit logs via `/api/organizations/:id/audit-logs`

## Migration

Existing users are **not whitelisted by default**. The `is_whitelisted` column defaults to 0 for all users.

To whitelist existing users:
```sql
UPDATE users SET is_whitelisted = 1 WHERE email = 'viktorsnapp@gmail.com';
```

Or use the API/UI as described above.

## Notes

- Whitelisted status is independent of organization membership
- A whitelisted user can belong to any organization
- Whitelisted users still have full access to all features
- Only billing calculations are affected
- The first non-whitelisted admin is still free per organization

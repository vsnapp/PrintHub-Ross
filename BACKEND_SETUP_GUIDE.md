# Backend Setup Guide

This guide will help you set up and run the Print Farm Orchestrator backend with all the new licensing, subscription, and admin features.

## Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and update these critical settings:

```bash
# REQUIRED: Generate a secure JWT secret
JWT_SECRET=your-secure-random-secret-here

# Your frontend URL (update for production)
FRONTEND_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173

# External billing site (configure when ready)
EXTERNAL_BILLING_URL=https://billing.example.com
```

**Generate a secure JWT secret:**
```bash
# On Mac/Linux:
openssl rand -base64 32

# Or use Node.js:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Start the Backend

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm run build
npm start
```

The backend will start on `http://localhost:3000` (or your configured PORT).

### 4. Database Initialization

The database is **automatically initialized** when you first start the backend. It will:
- Create the SQLite database file at `./database.db`
- Create all necessary tables (users, organizations, printers, etc.)
- Insert default admin user
- Add 8 sample printers

## Default Admin Credentials

**⚠️ IMPORTANT: Change these immediately in production!**

```
Username: admin
Password: admin123
Email: admin@printfarm.local
```

To login:
1. Start the frontend at `http://localhost:5173/printhub/`
2. Navigate to `/printhub/login`
3. Enter the credentials above
4. You'll be logged in as a system admin with full access

## Admin User Features

As the default admin, you have access to:

1. **Organization Admin Dashboard** (`/printhub/admin`)
   - View and manage users in your organization
   - Add/remove admin privileges
   - View usage and costs

2. **Super Admin Platform Analytics** (`/printhub/super-admin`)
   - View platform-wide revenue statistics
   - Monitor active users
   - Track growth metrics
   - Export revenue reports
   - **Manage billing whitelist** (add yourself here!)

## Adding Yourself to Whitelist

To exclude yourself from billing:

1. Login as `admin` (default admin account)
2. Navigate to `http://localhost:5173/printhub/super-admin`
3. Click the **"Whitelist"** tab
4. Enter your email: `viktorsnapp@gmail.com`
5. Click **"Add"**
6. Done! You're now excluded from all billing

## Changing the Admin Password

After first login, change the default password:

**Option 1: Via API**
```bash
curl -X PATCH http://localhost:3000/api/auth/change-password \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"admin123","newPassword":"your-new-secure-password"}'
```

**Option 2: Direct Database Update**
```bash
# Generate a new password hash
node -e "console.log(require('bcrypt').hashSync('your-new-password', 10))"

# Update database
sqlite3 backend/database.db
UPDATE users SET password_hash = 'YOUR_HASH_HERE' WHERE username = 'admin';
```

## Creating Additional Users

**Option 1: Via Registration**
- Go to `/printhub/register`
- Fill out the form
- New users will be assigned to organizations based on email domain

**Option 2: Via API**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "email": "user@example.com",
    "password": "securepassword"
  }'
```

## Database Location

The SQLite database is stored at:
```
backend/database.db
```

**Backup your database regularly!**
```bash
# Create backup
cp backend/database.db backend/database.backup.db

# Or use SQLite backup command
sqlite3 backend/database.db ".backup backend/database.backup.db"
```

## API Endpoints Overview

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `PATCH /api/auth/change-password` - Change password

### Organizations
- `POST /api/organizations` - Create organization
- `GET /api/organizations/:id/users` - List org users
- `PATCH /api/organizations/:id/users/:userId` - Update user (admin/active status)
- `GET /api/organizations/:id/subscription/status` - Check subscription
- `GET /api/organizations/:id/audit-logs` - View audit logs

### Subscriptions
- `GET /api/subscriptions/plans` - Get pricing info
- `GET /api/subscriptions/usage/:orgId` - Get usage stats
- `GET /api/subscriptions/calculate-cost/:orgId` - Calculate monthly cost
- `PATCH /api/subscriptions/update-usage/:orgId` - Update usage
- `POST /api/subscriptions/confirm-purchase` - Confirm purchase

### Analytics (System Admin Only)
- `GET /api/analytics/platform-stats` - Platform statistics
- `GET /api/analytics/real-time` - Real-time metrics
- `GET /api/analytics/revenue-report` - Download CSV report

### Whitelist (System Admin Only)
- `GET /api/whitelist` - List whitelisted users
- `POST /api/whitelist/add` - Add user to whitelist
- `POST /api/whitelist/remove` - Remove from whitelist
- `GET /api/whitelist/check/:email` - Check if email is whitelisted

### Print Jobs
- `GET /api/jobs` - List jobs
- `POST /api/jobs` - Create job
- `PATCH /api/jobs/:id` - Update job
- `DELETE /api/jobs/:id` - Delete job

### Printers
- `GET /api/printers` - List printers
- `POST /api/printers` - Add printer
- `PATCH /api/printers/:id` - Update printer
- `DELETE /api/printers/:id` - Remove printer

### Queue
- `GET /api/queue` - Get queue schedule
- `POST /api/queue/schedule` - Schedule jobs

## Environment Variables Reference

```bash
# Server Configuration
PORT=3000                          # Backend server port
NODE_ENV=development               # Environment (development/production)

# Database
DATABASE_URL=./database.db         # SQLite database path

# Authentication
JWT_SECRET=your-secret-key         # JWT signing secret (CHANGE THIS!)
JWT_EXPIRES_IN=7d                  # JWT token expiration

# File Uploads
UPLOAD_DIR=./uploads               # Upload directory
MAX_FILE_SIZE=104857600            # Max file size (100MB)

# CORS
CORS_ORIGIN=http://localhost:5173  # Frontend URL for CORS
FRONTEND_URL=http://localhost:5173 # Frontend URL for redirects

# Billing
EXTERNAL_BILLING_URL=https://billing.example.com  # External billing site

# Pricing
PRICE_PER_PRINTER=10.00           # Price per printer
PRICE_PER_ADDITIONAL_USER=0.25    # Price per user

# Work Hours
DEFAULT_WORK_START=8               # Default work start hour
DEFAULT_WORK_END=18                # Default work end hour

# Optional: Stripe
STRIPE_WEBHOOK_SECRET=whsec_...    # Stripe webhook secret

# Optional: SAML/SSO
SAML_ENTRY_POINT=https://idp.example.edu/saml/sso
SAML_ISSUER=print-farm-orchestrator
SAML_CALLBACK_URL=https://your-domain.com/api/auth/saml/callback
SAML_CERT=path/to/idp-cert.pem
```

## Troubleshooting

### Backend won't start
```bash
# Check if port 3000 is in use
lsof -i :3000

# Kill the process if needed
kill -9 <PID>

# Or use a different port
PORT=3001 npm run dev
```

### Can't login
1. Check if backend is running: `http://localhost:3000/api/health`
2. Verify frontend is pointing to correct API URL
3. Check JWT_SECRET is set in `.env`
4. Try resetting admin password (see above)

### Database errors
```bash
# Delete and recreate database
rm backend/database.db
npm run dev  # Will recreate with fresh schema
```

### CORS errors
Update `CORS_ORIGIN` in `.env` to match your frontend URL:
```bash
CORS_ORIGIN=http://localhost:5173
```

## Production Deployment

For production deployment:

1. **Set environment to production:**
   ```bash
   NODE_ENV=production
   ```

2. **Use a strong JWT secret:**
   ```bash
   JWT_SECRET=$(openssl rand -base64 32)
   ```

3. **Change default admin password immediately**

4. **Set up HTTPS** (see PRODUCTION_DEPLOYMENT.md)

5. **Configure reverse proxy** (Nginx recommended)

6. **Set up PM2 for process management:**
   ```bash
   npm install -g pm2
   pm2 start npm --name "print-farm-api" -- start
   pm2 save
   pm2 startup
   ```

7. **Configure database backups:**
   ```bash
   # Add to crontab
   0 2 * * * cp /path/to/database.db /path/to/backups/database-$(date +\%Y\%m\%d).db
   ```

See **PRODUCTION_DEPLOYMENT.md** for complete production setup guide.

## Next Steps

1. ✅ Start the backend: `npm run dev`
2. ✅ Login with default admin credentials
3. ✅ Add yourself to whitelist at `/printhub/super-admin`
4. ✅ Change default admin password
5. ✅ Configure your external billing site URL
6. ✅ Set up organizations and users
7. ✅ Start using the platform!

## Support & Documentation

- **API Documentation**: See `/api/` endpoints above
- **Licensing Guide**: `LICENSING_GUIDE.md`
- **Production Deployment**: `PRODUCTION_DEPLOYMENT.md`
- **Pricing Model**: `UPDATED_PRICING_MODEL.md`
- **Whitelist Feature**: `WHITELIST_FEATURE.md`
- **Admin Dashboard**: `ADMIN_DASHBOARD_UI.md`

## Quick Reference

**Default Admin:**
- Username: `admin`
- Password: `admin123`
- Email: `admin@printfarm.local`

**URLs:**
- Backend API: `http://localhost:3000`
- Frontend: `http://localhost:5173/printhub/`
- Admin Dashboard: `http://localhost:5173/printhub/admin`
- Super Admin: `http://localhost:5173/printhub/super-admin`

**Database:**
- Location: `backend/database.db`
- Type: SQLite
- Auto-initialized on first start

That's it! Your backend is now ready to use. 🚀

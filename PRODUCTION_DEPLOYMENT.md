# Production Deployment Guide

This guide covers deploying the Print Farm Orchestrator for production use with licensing and institutional authentication.

## Prerequisites

- Linux server (Ubuntu 20.04+ recommended)
- Node.js 18+ installed
- Domain name configured (e.g., `printfarm.yourschool.edu`)
- SSL certificate (Let's Encrypt recommended)
- Stripe account (for subscriptions)
- Email from your institution's IT for SAML setup (if using SSO)

## Step 1: Server Setup

### 1.1 Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install build tools
sudo apt install -y build-essential git

# Install PM2 for process management
sudo npm install -g pm2

# Install nginx for reverse proxy
sudo apt install -y nginx

# Install certbot for SSL
sudo apt install -y certbot python3-certbot-nginx
```

### 1.2 Create Application User

```bash
sudo useradd -m -s /bin/bash printfarm
sudo mkdir -p /opt/printfarm
sudo chown printfarm:printfarm /opt/printfarm
```

## Step 2: Deploy Application

### 2.1 Clone Repository

```bash
sudo su - printfarm
cd /opt/printfarm
git clone https://github.com/vsnapp/print-farm-orchestrator-nexus.git
cd print-farm-orchestrator-nexus
```

### 2.2 Build Backend

```bash
cd backend
npm install --production
npm run build
```

### 2.3 Build Frontend

```bash
cd ../
npm install
npm run build
```

## Step 3: Configure Environment

### 3.1 Backend Environment

```bash
cd /opt/printfarm/print-farm-orchestrator-nexus/backend
cp .env.example .env
nano .env
```

Update the following values:

```env
# Server
PORT=3000
NODE_ENV=production

# Database
DATABASE_URL=/opt/printfarm/data/database.db

# Authentication - CHANGE THIS!
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRES_IN=7d

# File Upload
UPLOAD_DIR=/opt/printfarm/data/uploads
MAX_FILE_SIZE=104857600

# CORS
CORS_ORIGIN=https://printfarm.yourschool.edu

# Frontend URL
FRONTEND_URL=https://printfarm.yourschool.edu

# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_your_actual_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_actual_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_actual_webhook_secret

# SAML Configuration (if using SSO)
SAML_ENTRY_POINT=https://login.yourschool.edu/saml/sso
SAML_ISSUER=print-farm-orchestrator
SAML_CALLBACK_URL=https://printfarm.yourschool.edu/api/saml/callback
```

### 3.2 Create Data Directories

```bash
sudo mkdir -p /opt/printfarm/data/uploads
sudo chown -R printfarm:printfarm /opt/printfarm/data
```

## Step 4: Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/printfarm
```

Add the following configuration:

```nginx
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/m;
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;

server {
    listen 80;
    server_name printfarm.yourschool.edu;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name printfarm.yourschool.edu;

    # SSL Configuration (certbot will add this)
    ssl_certificate /etc/letsencrypt/live/printfarm.yourschool.edu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/printfarm.yourschool.edu/privkey.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Max upload size
    client_max_body_size 100M;
    
    # Frontend static files
    location / {
        root /opt/printfarm/print-farm-orchestrator-nexus/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # API endpoints
    location /api {
        limit_req zone=api_limit burst=20 nodelay;
        
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Auth endpoints with stricter rate limiting
    location /api/auth {
        limit_req zone=auth_limit burst=3 nodelay;
        
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # WebSocket support
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/printfarm /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Step 5: Setup SSL Certificate

```bash
sudo certbot --nginx -d printfarm.yourschool.edu
```

Follow the prompts to:
1. Enter email for renewal notifications
2. Agree to terms of service
3. Choose to redirect HTTP to HTTPS

## Step 6: Start Application with PM2

```bash
cd /opt/printfarm/print-farm-orchestrator-nexus/backend
pm2 start dist/index.js --name printfarm-api
pm2 save
pm2 startup  # Follow the instructions shown
```

## Step 7: Configure Firewall

```bash
# Allow SSH
sudo ufw allow ssh

# Allow HTTP and HTTPS
sudo ufw allow 'Nginx Full'

# Enable firewall
sudo ufw enable
```

## Step 8: Setup Stripe

### 8.1 Create Stripe Account
1. Go to https://stripe.com and sign up
2. Complete business verification

### 8.2 Create Products
1. Go to Products in Stripe Dashboard
2. Create three products:
   - Basic Plan: $29/month
   - Professional Plan: $79/month
   - Enterprise Plan: $199/month
3. Note the Price IDs for each

### 8.3 Configure Webhook
1. Go to Developers → Webhooks
2. Add endpoint: `https://printfarm.yourschool.edu/api/subscriptions/webhook`
3. Select events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy the webhook signing secret and add to `.env`

### 8.4 Get API Keys
1. Go to Developers → API Keys
2. Reveal live secret key
3. Copy to `.env` file

### 8.5 Restart API
```bash
pm2 restart printfarm-api
```

## Step 9: Initial Setup

### 9.1 Login as Admin
1. Go to https://printfarm.yourschool.edu
2. Login with:
   - Username: `admin`
   - Password: `admin123`
3. **IMMEDIATELY change the password!**

### 9.2 Create Your Organization

Using the API or admin interface:

```bash
curl -X POST https://printfarm.yourschool.edu/api/organizations \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Your University Name",
    "domain": "yourschool.edu",
    "subscriptionPlan": "enterprise"
  }'
```

## Step 10: Configure SAML/SSO (Optional)

### 10.1 Contact Your IT Department
Request SAML integration with:
- Service Provider Entity ID: `print-farm-orchestrator`
- Assertion Consumer Service (ACS) URL: `https://printfarm.yourschool.edu/api/saml/callback`
- Metadata URL: `https://printfarm.yourschool.edu/api/saml/metadata?organizationId=1`

### 10.2 Configure SAML in Application

Once you receive SAML configuration from IT:

```bash
curl -X PATCH https://printfarm.yourschool.edu/api/organizations/1/saml \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "entityId": "print-farm-yourschool",
    "ssoUrl": "https://login.yourschool.edu/saml/sso",
    "certificate": "-----BEGIN CERTIFICATE-----\nYOUR_IDP_CERTIFICATE\n-----END CERTIFICATE-----"
  }'
```

## Step 11: Monitoring and Maintenance

### 11.1 View Logs
```bash
# API logs
pm2 logs printfarm-api

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 11.2 Monitor Application
```bash
pm2 monit
```

### 11.3 Database Backups
```bash
# Create backup script
sudo nano /opt/printfarm/scripts/backup.sh
```

Add:
```bash
#!/bin/bash
BACKUP_DIR="/opt/printfarm/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
cp /opt/printfarm/data/database.db $BACKUP_DIR/database_$DATE.db
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz /opt/printfarm/data/uploads

# Keep only last 30 days
find $BACKUP_DIR -name "database_*.db" -mtime +30 -delete
find $BACKUP_DIR -name "uploads_*.tar.gz" -mtime +30 -delete
```

Make executable and add to crontab:
```bash
chmod +x /opt/printfarm/scripts/backup.sh
crontab -e
```

Add daily backup at 2 AM:
```
0 2 * * * /opt/printfarm/scripts/backup.sh
```

### 11.4 Auto-renewal of SSL Certificate
Certbot automatically sets up renewal. Test it:
```bash
sudo certbot renew --dry-run
```

## Step 12: Updates

To update the application:

```bash
cd /opt/printfarm/print-farm-orchestrator-nexus
git pull origin main

# Update backend
cd backend
npm install --production
npm run build
pm2 restart printfarm-api

# Update frontend
cd ..
npm install
npm run build
```

## Troubleshooting

### Application won't start
```bash
pm2 logs printfarm-api --lines 100
```

### Database errors
```bash
# Check database permissions
ls -la /opt/printfarm/data/database.db

# Check SQLite version
sqlite3 --version
```

### SSL certificate issues
```bash
sudo certbot renew --force-renewal
sudo systemctl restart nginx
```

### SAML authentication not working
1. Check organization SAML configuration
2. Verify IdP certificate
3. Check audit logs: `/api/organizations/1/audit-logs`
4. Contact your IT department

### Stripe webhook not receiving events
1. Check webhook URL in Stripe dashboard
2. Verify webhook secret in `.env`
3. Check nginx logs for 4xx/5xx errors
4. Test webhook: `stripe trigger customer.subscription.created`

## Security Checklist

- [ ] Changed default admin password
- [ ] Set strong JWT_SECRET
- [ ] Configured firewall (UFW)
- [ ] SSL certificate installed and auto-renewing
- [ ] Rate limiting enabled in nginx
- [ ] Stripe keys are live keys (not test)
- [ ] Database file permissions are restricted
- [ ] Regular backups configured
- [ ] Monitoring enabled
- [ ] Server hardening applied (SSH keys only, etc.)

## Performance Optimization

### Database Optimization
```sql
-- Run periodically to optimize database
sqlite3 /opt/printfarm/data/database.db "VACUUM;"
sqlite3 /opt/printfarm/data/database.db "ANALYZE;"
```

### PM2 Cluster Mode
For high traffic:
```bash
pm2 delete printfarm-api
pm2 start dist/index.js --name printfarm-api -i max
pm2 save
```

## Support and Maintenance

### Regular Maintenance Tasks
- Weekly: Check logs for errors
- Weekly: Review audit logs for suspicious activity
- Monthly: Review and archive old print jobs
- Monthly: Check disk space usage
- Quarterly: Review user accounts and permissions
- Quarterly: Update dependencies and security patches

### Getting Help
- Documentation: See LICENSING_GUIDE.md
- Logs: `pm2 logs printfarm-api`
- Audit logs: Access via API at `/api/organizations/:id/audit-logs`

## Cost Estimation

### Monthly Costs (approximate)
- VPS/Server: $10-50/month (DigitalOcean, Linode, etc.)
- Domain: $10-15/year
- SSL: Free (Let's Encrypt)
- Stripe fees: 2.9% + $0.30 per transaction
- Total base: ~$15-55/month + transaction fees

Charges to customers will offset operational costs.

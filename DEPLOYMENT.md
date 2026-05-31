# Setup and Deployment Guide

## Quick Start for Testing

### 1. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
```

### 2. Configure Environment

Edit `backend/.env`:

```bash
# Required: Change these for production!
JWT_SECRET=your-very-secure-random-string-here
DATABASE_URL=./database.db

# Optional: Adjust as needed
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

**⚠️ IMPORTANT:** Generate a secure JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Start Backend

```bash
npm run dev
```

The server will:
- Create database at `./database.db`
- Run schema initialization
- Create default admin user
- Start on http://localhost:3000

### 4. Default Login Credentials

**Admin Account:**
- Username: `admin`
- Password: `admin123`
- Email: `admin@printfarm.local`

**⚠️ CHANGE THE DEFAULT PASSWORD IMMEDIATELY!**

## Testing the API

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@printfarm.local",
    "role": "admin"
  }
}
```

### Register New Student

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type": application/json" \
  -d '{
    "username": "student1",
    "email": "student1@school.edu",
    "password": "password123"
  }'
```

### Get Printers (Authenticated)

```bash
# Replace YOUR_TOKEN with the token from login
curl http://localhost:3000/api/printers \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Check Current User

```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## User Roles

### Student
- Can upload STL files
- Can view their own print jobs
- Can track print status
- **Cannot** approve jobs or modify printers

### Operator
- All student permissions
- Can approve/reject print jobs
- Can update printer status
- Can override queue
- **Cannot** manage users

### Admin
- All operator permissions
- Can create/manage users
- Can configure system settings
- Full access to all features

## Creating Users Programmatically

### Create Operator Account

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "operator1",
    "email": "operator@school.edu",
    "password": "securepassword"
  }'
```

Then manually update their role in the database:

```bash
sqlite3 backend/database.db
```

```sql
UPDATE users SET role = 'operator' WHERE username = 'operator1';
.quit
```

Or use the admin API (when implemented) to change roles.

## Frontend Integration

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API URL

Create `.env.local`:

```bash
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
```

### 3. Add Authentication Hook

Create `src/hooks/useAuth.ts`:

```typescript
import { useState, useEffect } from 'react';

interface User {
  id: number;
  username: string;
  email: string;
  role: 'student' | 'operator' | 'admin';
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(
    localStorage.getItem('token')
  );

  useEffect(() => {
    if (token) {
      // Fetch current user
      fetch(`${import.meta.env.VITE_API_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
        .then(res => res.json())
        .then(data => setUser(data.user))
        .catch(() => {
          localStorage.removeItem('token');
          setToken(null);
        });
    }
  }, [token]);

  const login = async (username: string, password: string) => {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) throw new Error('Login failed');

    const data = await res.json();
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return { user, token, login, logout, isAuthenticated: !!token };
}
```

### 4. Run Frontend

```bash
npm run dev
```

Visit http://localhost:5173

## Production Deployment

### Backend Deployment

#### Option 1: VPS/Cloud Server

1. **Install Node.js** (18+)

2. **Clone repository**
```bash
git clone https://github.com/your-org/print-farm-orchestrator-nexus.git
cd print-farm-orchestrator-nexus/backend
```

3. **Install dependencies**
```bash
npm ci --production
```

4. **Configure environment**
```bash
cp .env.example .env
nano .env  # Edit with production values
```

5. **Build TypeScript**
```bash
npm run build
```

6. **Install PM2**
```bash
npm install -g pm2
```

7. **Start with PM2**
```bash
pm2 start dist/index.js --name print-farm-api
pm2 save
pm2 startup
```

8. **Configure nginx reverse proxy**
```nginx
server {
    listen 80;
    server_name api.printfarm.school.edu;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

9. **Set up SSL with Let's Encrypt**
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.printfarm.school.edu
```

#### Option 2: Docker

Create `backend/Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

Build and run:
```bash
docker build -t print-farm-backend .
docker run -p 3000:3000 -v ./database.db:/app/database.db print-farm-backend
```

### Frontend Deployment

#### Build for Production

```bash
npm run build
```

This creates `dist/` folder with static files.

#### Deploy Options

1. **Vercel/Netlify** - Drag and drop `dist/` folder
2. **Nginx** - Copy `dist/` to `/var/www/html`
3. **S3 + CloudFront** - Upload to S3 bucket

Example nginx config:
```nginx
server {
    listen 80;
    server_name printfarm.school.edu;
    root /var/www/html/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## Security Checklist

- [ ] Change default admin password
- [ ] Use strong JWT_SECRET (32+ random characters)
- [ ] Enable HTTPS in production
- [ ] Set proper CORS_ORIGIN
- [ ] Implement rate limiting
- [ ] Set up firewall rules
- [ ] Regular database backups
- [ ] Keep dependencies updated
- [ ] Enable audit logging
- [ ] Scan uploaded files for malware

## Troubleshooting

### Database locked error
```bash
# Stop all processes using the database
pm2 stop all
# Or restart
pm2 restart print-farm-api
```

### CORS errors
Check `CORS_ORIGIN` in backend `.env` matches frontend URL

### Authentication fails
Verify JWT_SECRET is the same across restarts

### Can't connect to printers
Check printer IP addresses and network connectivity

## Monitoring

```bash
# View logs
pm2 logs print-farm-api

# Monitor performance
pm2 monit

# Check status
pm2 status
```

## Backup

### Database Backup

```bash
# Daily backup
cp backend/database.db backend/database.backup.$(date +%Y%m%d).db

# Or use cron
0 2 * * * cp /path/to/database.db /path/to/backups/database.$(date +\%Y\%m\%d).db
```

## Support

For issues, check:
1. Backend logs: `pm2 logs`
2. Browser console (F12)
3. Network tab in DevTools
4. Database integrity: `sqlite3 database.db "PRAGMA integrity_check;"`

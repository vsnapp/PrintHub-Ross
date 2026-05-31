# Print Farm Orchestrator Nexus

A production-ready 3D print farm management system with institutional authentication, subscription licensing, and multi-tenant support.

## 🎯 Key Features

### Multi-Tenant Organization Support
- Organization-based user management
- Domain-based auto-assignment (e.g., @gatech.edu → Georgia Tech org)
- Organization admin roles for self-service management
- Subscription-based access control

### Subscription & Licensing
- Three subscription tiers: Basic ($29/mo), Professional ($79/mo), Enterprise ($199/mo)
- Stripe integration for payment processing
- Trial period support
- Automatic license validation
- Usage limits enforcement (users, printers, storage)

### Institutional SSO/SAML Authentication
- SAML 2.0 support for university/enterprise SSO
- Automatic user provisioning from SSO
- Domain-based authentication routing
- Example: Georgia Tech students authenticate via @gatech.edu

### Print Farm Management
- Job queue optimization with deadline awareness
- Multi-printer support (FDM & Resin)
- Multiple slicer integration (Cura, PrusaSlicer, OrcaSlicer, Bambu Studio, Preform)
- Real-time WebSocket updates
- File management and storage

### Security & Production Features
- Rate limiting (API, auth, uploads, payments)
- Audit logging for compliance
- JWT-based authentication
- Role-based access control (student, operator, org_admin, admin)
- HTTPS/SSL ready
- Environment-based configuration

## 📚 Documentation

- **[Production Deployment Guide](PRODUCTION_DEPLOYMENT.md)** - Complete server setup and deployment instructions
- **[Licensing & SSO Guide](LICENSING_GUIDE.md)** - Organization setup, SAML configuration, and subscription management
- **[Architecture Documentation](ARCHITECTURE.md)** - System architecture and component details
- **[API Testing Guide](API_TESTING_GUIDE.md)** - API endpoint documentation

## 🚀 Quick Start

### Development Setup

#### Frontend
```sh
npm install
npm run dev
```

#### Backend
```sh
cd backend
npm install
npm run dev
```

The backend will run on `http://localhost:3000` and the frontend on `http://localhost:5173`.

**Default Admin Credentials:**
- Username: `admin`
- Password: `admin123`
- ⚠️ **Change immediately in production!**

### Production Deployment

See [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) for complete production setup instructions including:
- Server configuration
- SSL/HTTPS setup
- Nginx reverse proxy
- PM2 process management
- Database backups
- Stripe integration
- SAML/SSO configuration

## 🏗️ Architecture

### Technology Stack

**Frontend:**
- React + TypeScript
- Vite build system
- TailwindCSS + shadcn/ui
- Three.js for 3D preview
- WebSocket for real-time updates

**Backend:**
- Node.js + Express
- TypeScript
- SQLite database (production-ready)
- JWT authentication
- WebSocket server
- Stripe for payments

## 💼 Subscription Plans

### Basic - $29/month
- Up to 10 users
- Up to 5 printers
- Basic support
- Job queue management
- 10 GB file storage

### Professional - $79/month
- Up to 50 users
- Up to 20 printers
- Priority support
- Advanced queue optimization
- 100 GB file storage
- Custom slicer profiles
- Analytics dashboard

### Enterprise - $199/month
- Unlimited users & printers
- 24/7 dedicated support
- SSO/SAML integration
- 1 TB file storage
- Custom integrations
- SLA guarantee

## 🔐 Security Features

- **Rate Limiting:**
  - General API: 100 req/15min
  - Authentication: 5 attempts/15min
  - File uploads: 20/hour
  - Payment operations: 10/hour

- **Audit Logging:** All sensitive operations logged
- **Subscription Validation:** Automatic enforcement of plan limits
- **HTTPS/SSL:** Production-ready SSL configuration
- **CORS:** Configurable cross-origin policies

## 🏫 Example: Georgia Tech Setup

1. Create organization for Georgia Tech:
```bash
curl -X POST https://your-domain.com/api/organizations \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{"name": "Georgia Tech", "domain": "gatech.edu", "subscriptionPlan": "enterprise"}'
```

2. Configure SAML with GT's identity provider
3. Students with @gatech.edu automatically join Georgia Tech organization
4. GT admin manages student access and permissions

See [LICENSING_GUIDE.md](LICENSING_GUIDE.md) for detailed setup instructions.

## 📊 API Endpoints

### Authentication
- `POST /api/auth/login` - Standard login
- `POST /api/auth/register` - Register new user
- `GET /api/auth/me` - Get current user

### Organizations
- `GET /api/organizations` - List organizations (admin)
- `POST /api/organizations` - Create organization
- `GET /api/organizations/:id` - Get organization details
- `PATCH /api/organizations/:id/subscription` - Update subscription
- `PATCH /api/organizations/:id/saml` - Configure SAML

### Subscriptions
- `GET /api/subscriptions/plans` - Get available plans
- `POST /api/subscriptions/create-checkout-session` - Start subscription
- `POST /api/subscriptions/webhook` - Stripe webhook handler

### SAML
- `GET /api/saml/login` - Initiate SAML login
- `POST /api/saml/callback` - SAML callback (ACS)
- `GET /api/saml/check-domain` - Check if domain supports SSO

### Print Jobs
- `GET /api/jobs` - List jobs
- `POST /api/jobs` - Create job
- `PATCH /api/jobs/:id/approve` - Approve job (operator)

See [API_TESTING_GUIDE.md](API_TESTING_GUIDE.md) for complete API documentation.

## 🛠️ Development

### Project Structure
```
├── backend/                 # Backend API server
│   ├── src/
│   │   ├── routes/         # API route handlers
│   │   ├── middleware/     # Auth, rate limiting, etc.
│   │   └── database.ts     # Database setup and queries
│   └── package.json
├── src/                     # Frontend React application
│   ├── components/         # React components
│   ├── pages/              # Page components
│   └── contexts/           # React contexts (auth, etc.)
├── electron/               # Electron desktop app (optional)
└── public/                 # Static assets
```

## 📝 License

MIT License

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Cura Multi-Printer Slice Plugin

The `cura-multi-printer-plugin` directory contains a Cura extension that slices a scene for multiple selected printers and exports each G-code file to an external application's `gcode` folder. It supports environment/config overrides, auto-discovery of common install paths, and an optional silent mode.

After slicing, the plugin can automatically start prints on the chosen printers. If a printer is already printing, you'll be asked whether to queue the job or skip it. There's also a **Slice Selected Printers to Queue** action that drops generated files into `<output_root>/queue` for later use.


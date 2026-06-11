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
- Student portal: upload STL, get an instant print-time estimate, submit a job, and get notified (in-app + email) when the print is done
- Job queue optimization with deadline + worker-hour awareness (long prints scheduled overnight)
- Multi-printer support (FDM & Resin) with per-printer slicer assignment and default slicing settings
- Embedded slicing for Cura (CuraEngine), PrusaSlicer, OrcaSlicer, Bambu Studio, and PreForm with per-slice settings overrides (layer height, nozzle/bed temperature, infill, speed, supports)
- Real-time WebSocket updates (job created/approved/printing/completed, printer status, queue changes)
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

#### Desktop App (optional, for local slicer access)
```sh
cd electron
npm install
npm run dev
```

The backend will run on `http://localhost:3000` and the frontend on `http://localhost:8080/printhub/`.

**Default Admin Credentials:**
- Username: `admin`
- Password: `admin123`
- ⚠️ **Change immediately in production!**

### Embedded Slicing Setup

Slicing runs through the slicers' CLI engines, either **on the server** (works from the web app)
or **locally** in the Electron desktop app. Installed slicers are auto-detected from common
install locations and `PATH`; you can also point at specific binaries with environment variables:

| Slicer | Environment variable | Notes |
|--------|---------------------|-------|
| Ultimaker Cura | `CURA_ENGINE_PATH` | Must point at the `CuraEngine` binary inside the Cura install |
| PrusaSlicer | `PRUSASLICER_PATH` | Full headless slicing support (recommended baseline engine) |
| OrcaSlicer | `ORCASLICER_PATH` | Headless CLI support varies by release; falls back to another engine if unavailable |
| Bambu Studio | `BAMBU_STUDIO_PATH` | Same as OrcaSlicer |
| PreForm | `PREFORM_PATH` | GUI launch only; for headless resin prep use **PreForm Server** below |

On Debian/Ubuntu servers, `sudo apt install prusa-slicer` is enough to enable server-side slicing.

#### Resin prep with PreForm Server (Formlabs Local API)

PrintHub includes a custom resin slicing UI (dashboard → Slicer → "Resin Prep", or Manage Jobs →
Slice on a resin job): orient, position and scale the model on a virtual Formlabs build platform,
pick material/layer thickness/support settings, and PrintHub translates that exact scene setup into
[Formlabs Local API](https://formlabs-dashboard-api-resources.s3.amazonaws.com/formlabs-local-api-latest.html)
calls — auto-supports, PreForm's real print-time/resin estimates, a saved `.form` job file, and
direct upload to Formlabs printers.

Setup (the headless **PreFormServer** app from Formlabs, Windows/macOS):

| Variable | Meaning |
|----------|---------|
| `PREFORM_SERVER_URL` | URL of an already-running PreFormServer, e.g. `http://localhost:44388` |
| `PREFORM_SERVER_PATH` | Path to the PreFormServer executable; PrintHub spawns/manages it on demand |

PreFormServer must run on the same machine as the backend (it reads model files from local paths).
Without it, resin jobs still get geometry-based estimates.

When no slicing engine is available, students still get instant print-time estimates computed
from the STL geometry; the estimate is replaced by the slicer's exact time once a real slice runs.

Check engine availability at `GET /api/slicers` or in the dashboard's Slicer tab.

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
- `GET /api/jobs` - List jobs (students see their own)
- `POST /api/jobs` - Create job (auto-estimates print time from attached STL)
- `PATCH /api/jobs/:id/approve` - Approve job (operator)
- `PATCH /api/jobs/:id/reject` - Reject job with reason (operator)

### Files & Slicing
- `POST /api/files/upload` - Upload STL/gcode (100 MB limit)
- `POST /api/files/:id/estimate` - Instant geometry-based print time estimate
- `GET /api/slicers` - List slicing engines available on the server (operator)
- `POST /api/slicers/slice` - Slice an STL with a printer's assigned slicer + overrides; stores gcode and updates the job estimate (operator)

### Queue & Scheduling
- `POST /api/queue/optimize` - Re-optimize the print schedule (deadline + worker-hour aware)
- `GET /api/queue/schedule` - Current schedule (students see their own entries)
- `GET /api/workhours` / `PUT /api/workhours` - Farm worker hours used by the optimizer

### Printers
- `POST /api/printers` - Create printer (slicer assignment + default slicing settings)
- `POST /api/printers/:id/print` - Start a print (uses the job's sliced gcode when present)
- `GET /api/printers/:id/status` - Live status via OctoPrint/Moonraker/Serial/Bambu integrations

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


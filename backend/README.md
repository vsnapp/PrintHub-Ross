# Print Farm Orchestrator - Backend API

Backend server for the Print Farm Orchestrator hybrid architecture.

## Quick Start

### Prerequisites
- Node.js 18+ or Bun
- npm or bun

### Installation

```bash
cd backend
npm install
```

### Configuration

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` and configure:
   - `JWT_SECRET` - Change to a secure random string
   - `DATABASE_URL` - Path to SQLite database
   - `UPLOAD_DIR` - Directory for file uploads
   - Slicer CLI paths (optional, for actual slicing)

### Development

```bash
npm run dev
```

Server will start on `http://localhost:3000`

### Production Build

```bash
npm run build
npm start
```

## API Endpoints

### Health Check
```
GET /health
```

### API Info
```
GET /api
```

### Authentication (Coming Soon)
```
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

### Print Jobs (Coming Soon)
```
GET    /api/jobs              - List jobs
POST   /api/jobs              - Create job
GET    /api/jobs/:id          - Get job details
PATCH  /api/jobs/:id          - Update job
DELETE /api/jobs/:id          - Cancel job
POST   /api/jobs/:id/approve  - Approve job (operators)
```

### Files (Coming Soon)
```
POST /api/files/upload        - Upload STL/gcode
GET  /api/files/:id           - Download file
POST /api/files/:id/slice     - Slice STL file
```

### Queue (Coming Soon)
```
GET  /api/queue               - Get optimized queue
POST /api/queue/optimize      - Trigger optimization
```

### Printers (Coming Soon)
```
GET   /api/printers           - List printers
GET   /api/printers/:id       - Get printer details
PATCH /api/printers/:id       - Update printer (operators)
```

## WebSocket Events

Connect to `ws://localhost:3000`

### Client -> Server
```json
{ "type": "subscribe:jobs" }
{ "type": "subscribe:printers" }
```

### Server -> Client
```json
{ "type": "job:created", "data": {...} }
{ "type": "job:started", "data": {...} }
{ "type": "job:completed", "data": {...} }
{ "type": "printer:status", "data": {...} }
{ "type": "queue:updated", "data": {...} }
```

## Database

Uses SQLite by default. Schema will be created automatically on first run.

To migrate to PostgreSQL/MySQL, update `DATABASE_URL` and install appropriate driver.

## File Structure

```
backend/
├── src/
│   ├── index.ts           # Main server entry
│   ├── routes/            # API route definitions
│   ├── controllers/       # Request handlers
│   ├── models/            # Database models
│   ├── services/          # Business logic
│   ├── middleware/        # Express middleware
│   └── types/             # TypeScript types
├── uploads/               # Uploaded files (gitignored)
├── .env                   # Environment config (gitignored)
├── .env.example           # Example environment
├── package.json
└── tsconfig.json
```

## Development Roadmap

- [x] Basic server setup
- [x] WebSocket support
- [x] CORS configuration
- [ ] Database schema & models
- [ ] Authentication & authorization
- [ ] File upload handling
- [ ] Queue optimizer integration
- [ ] Slicer CLI integration
- [ ] Real-time notifications
- [ ] API documentation (Swagger)

## Testing

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e
```

## Deployment

### Docker

```bash
docker build -t print-farm-backend .
docker run -p 3000:3000 print-farm-backend
```

### Manual Deployment

1. Build the project: `npm run build`
2. Copy `dist/` folder to server
3. Copy `.env` file
4. Install production dependencies: `npm ci --production`
5. Start: `node dist/index.js`

### Recommended Stack

- **Reverse Proxy**: nginx
- **Process Manager**: PM2
- **SSL**: Let's Encrypt
- **Monitoring**: PM2 or custom logging

## Security Notes

- Change `JWT_SECRET` in production
- Use HTTPS in production
- Implement rate limiting
- Validate and sanitize all inputs
- Scan uploaded files for malware
- Use proper CORS settings
- Keep dependencies updated

## Contributing

See main project README for contribution guidelines.

## License

MIT

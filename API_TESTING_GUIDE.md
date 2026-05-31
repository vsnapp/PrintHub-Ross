# API Testing Guide

Complete guide for testing all backend API endpoints.

## Prerequisites

1. Start the backend server:
```bash
cd backend
npm run dev
```

2. Get an authentication token:
```bash
# Login as admin
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Save the token from response
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## Authentication API

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### Register (Student)
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username":"student1",
    "email":"student1@school.edu",
    "password":"password123"
  }'
```

### Get Current User
```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

## Printers API

### List All Printers
```bash
curl http://localhost:3000/api/printers \
  -H "Authorization: Bearer $TOKEN"
```

### Get Printer by ID
```bash
curl http://localhost:3000/api/printers/1 \
  -H "Authorization: Bearer $TOKEN"
```

### Get Printers by Type
```bash
# FDM printers
curl http://localhost:3000/api/printers/type/fdm \
  -H "Authorization: Bearer $TOKEN"

# Resin printers
curl http://localhost:3000/api/printers/type/resin \
  -H "Authorization: Bearer $TOKEN"
```

### Update Printer Status (Operators only)
```bash
curl -X PATCH http://localhost:3000/api/printers/1/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"printing"}'
```

## Files API

### Upload File
```bash
# Upload STL file
curl -X POST http://localhost:3000/api/files/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/model.stl"

# Upload gcode file
curl -X POST http://localhost:3000/api/files/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/model.gcode"
```

### Get File Metadata
```bash
curl http://localhost:3000/api/files/1/metadata \
  -H "Authorization: Bearer $TOKEN"
```

### Download File
```bash
curl http://localhost:3000/api/files/1 \
  -H "Authorization: Bearer $TOKEN" \
  -o downloaded_file.stl
```

### Delete File
```bash
curl -X DELETE http://localhost:3000/api/files/1 \
  -H "Authorization: Bearer $TOKEN"
```

## Jobs API

### Create Print Job
```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Dragon Miniature",
    "file_id":1,
    "deadline":"2025-11-01T12:00:00Z",
    "priority":"high",
    "printer_type":"resin",
    "estimated_time_minutes":180,
    "notes":"Handle with care"
  }'
```

### List All Jobs
```bash
# All jobs (operators/admin)
curl http://localhost:3000/api/jobs \
  -H "Authorization: Bearer $TOKEN"

# Filter by status
curl http://localhost:3000/api/jobs?status=pending \
  -H "Authorization: Bearer $TOKEN"

# Filter by printer type
curl http://localhost:3000/api/jobs?printer_type=fdm \
  -H "Authorization: Bearer $TOKEN"
```

### Get Job Details
```bash
curl http://localhost:3000/api/jobs/1 \
  -H "Authorization: Bearer $TOKEN"
```

### Update Job
```bash
# Update priority
curl -X PATCH http://localhost:3000/api/jobs/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"priority":"high"}'

# Update deadline
curl -X PATCH http://localhost:3000/api/jobs/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"deadline":"2025-11-05T12:00:00Z"}'
```

### Approve Job (Operators only)
```bash
curl -X PATCH http://localhost:3000/api/jobs/1/approve \
  -H "Authorization: Bearer $TOKEN"
```

### Reject Job (Operators only)
```bash
curl -X PATCH http://localhost:3000/api/jobs/1/reject \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"File quality too low"}'
```

### Delete Job
```bash
curl -X DELETE http://localhost:3000/api/jobs/1 \
  -H "Authorization: Bearer $TOKEN"
```

## Queue API

### Optimize Queue
```bash
curl -X POST http://localhost:3000/api/queue/optimize \
  -H "Authorization: Bearer $TOKEN"

# Response includes:
# - scheduled: number of jobs scheduled
# - unscheduled: number of jobs that couldn't be scheduled
# - utilizationByPrinter: printer utilization percentages
# - unscheduledJobs: list of jobs that didn't fit
```

### Get Current Schedule
```bash
curl http://localhost:3000/api/queue/schedule \
  -H "Authorization: Bearer $TOKEN"
```

### Get Timeline Data
```bash
curl http://localhost:3000/api/queue/timeline \
  -H "Authorization: Bearer $TOKEN"

# Response includes:
# - workHours: current work hours configuration
# - schedule: all scheduled prints
# - printers: list of all printers
# - utilizationByPrinter: utilization metrics
```

### Remove from Schedule (Operators only)
```bash
curl -X DELETE http://localhost:3000/api/queue/schedule/1 \
  -H "Authorization: Bearer $TOKEN"
```

## Work Hours API

### Get Work Hours
```bash
curl http://localhost:3000/api/workhours \
  -H "Authorization: Bearer $TOKEN"
```

### Update Work Hours (Operators only)
```bash
# Set work hours to 9am - 5pm
curl -X PUT http://localhost:3000/api/workhours \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "start_hour":9,
    "end_hour":17
  }'
```

## Complete Workflow Example

### 1. Student Uploads and Creates Job
```bash
# Register student
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username":"alice",
    "email":"alice@school.edu",
    "password":"password123"
  }'

# Login
STUDENT_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"password123"}' \
  | jq -r '.token')

# Upload STL file
FILE_ID=$(curl -s -X POST http://localhost:3000/api/files/upload \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -F "file=@model.stl" \
  | jq -r '.id')

# Create print job
JOB_ID=$(curl -s -X POST http://localhost:3000/api/jobs \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\":\"My Project\",
    \"file_id\":$FILE_ID,
    \"deadline\":\"2025-11-10T12:00:00Z\",
    \"priority\":\"medium\",
    \"printer_type\":\"fdm\",
    \"estimated_time_minutes\":120
  }" \
  | jq -r '.id')

echo "Created job ID: $JOB_ID"
```

### 2. Operator Approves and Optimizes
```bash
# Login as operator/admin
ADMIN_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | jq -r '.token')

# Approve job
curl -X PATCH http://localhost:3000/api/jobs/$JOB_ID/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Optimize queue
curl -X POST http://localhost:3000/api/queue/optimize \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# View schedule
curl http://localhost:3000/api/queue/schedule \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### 3. Check Timeline
```bash
curl http://localhost:3000/api/queue/timeline \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## WebSocket Testing

Connect to WebSocket for real-time updates:

```javascript
// In browser console or Node.js
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
  console.log('Connected');
  // Subscribe to updates
  ws.send(JSON.stringify({ type: 'subscribe:jobs' }));
  ws.send(JSON.stringify({ type: 'subscribe:printers' }));
};

ws.onmessage = (event) => {
  console.log('Message:', JSON.parse(event.data));
};
```

## Error Responses

All endpoints return standardized error responses:

```json
{
  "error": "Description of what went wrong"
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

## Role-Based Access

### Student Role
Can:
- View their own jobs
- Create jobs
- Update their own pending jobs
- Delete their own pending jobs
- Upload files
- View their own files

Cannot:
- Approve/reject jobs
- View other users' jobs
- Update printer status
- Modify work hours
- Access operator features

### Operator/Admin Role
Can:
- All student permissions
- View all jobs
- Approve/reject any job
- Update printer status
- Optimize queue
- Modify work hours
- Remove jobs from schedule

## Testing Checklist

- [ ] Authentication (login, register, token validation)
- [ ] File upload (STL and gcode)
- [ ] Job creation and management
- [ ] Job approval workflow
- [ ] Queue optimization
- [ ] Schedule viewing
- [ ] Work hours configuration
- [ ] Printer status updates
- [ ] Role-based access control
- [ ] WebSocket connections

## Troubleshooting

### "Authentication required"
Make sure you're including the Authorization header:
```bash
-H "Authorization: Bearer $TOKEN"
```

### "Invalid or expired token"
Token expires after 7 days. Login again to get a new token.

### "Insufficient permissions"
Your user role doesn't have access to this endpoint. Use an operator/admin account.

### Database locked
Stop all running instances of the backend before starting a new one.

### File upload fails
Check:
- File size < 100MB
- File extension is .stl or .gcode
- Content-Type is multipart/form-data

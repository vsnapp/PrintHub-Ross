import dotenv from 'dotenv';
import path from 'path';

// Load environment variables before any module reads process.env at import time.
// The first path supports running from the backend directory; the second supports
// running from the repository root while still picking up backend/.env.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

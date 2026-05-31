import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { checkOrganizationSubscription } from '../database';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const DEV_AUTH_BYPASS = process.env.DEV_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
    email: string;
    role: 'student' | 'operator' | 'admin' | 'org_admin';
    organizationId?: number;
    isOrgAdmin?: boolean;
  };
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  if (DEV_AUTH_BYPASS) {
    req.user = {
      id: 0,
      username: 'dev-admin',
      email: 'dev-admin@local',
      role: 'admin',
    };
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthRequest['user'];
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

export function generateToken(user: { 
  id: number; 
  username: string; 
  email: string; 
  role: string;
  organizationId?: number;
  isOrgAdmin?: boolean;
}): string {
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    isOrgAdmin: user.isOrgAdmin
  };
  
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '7d'
  });
}

export function generateWebcamToken(user: AuthRequest['user'], printerId: string): string {
  if (!user) {
    throw new Error('User is required to generate webcam token');
  }
  const { iat: _iat, exp: _exp, ...safeUser } = user as AuthRequest['user'] & {
    iat?: number;
    exp?: number;
  };
  const payload = {
    ...safeUser,
    scope: 'webcam',
    printerId,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '15m'
  });
}

export function verifyWebcamToken(token: string, printerId: string): AuthRequest['user'] {
  const decoded = jwt.verify(token, JWT_SECRET) as AuthRequest['user'] & {
    scope?: string;
    printerId?: string;
  };

  if (decoded.scope !== 'webcam') {
    throw new Error('Invalid token scope');
  }

  if (decoded.printerId !== printerId) {
    throw new Error('Invalid token printer');
  }

  const { scope: _scope, printerId: _printerId, ...user } = decoded as any;
  return user as AuthRequest['user'];
}

// Middleware to check if user's organization has active subscription
export function requireActiveSubscription(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Admins bypass subscription checks
  if (req.user.role === 'admin') {
    return next();
  }

  // If user doesn't belong to an organization, allow (individual users)
  if (!req.user.organizationId) {
    return next();
  }

  const subscriptionStatus = checkOrganizationSubscription(req.user.organizationId);
  
  if (!subscriptionStatus.valid) {
    return res.status(402).json({ 
      error: 'Subscription required',
      reason: subscriptionStatus.reason,
      organizationId: req.user.organizationId
    });
  }

  next();
}


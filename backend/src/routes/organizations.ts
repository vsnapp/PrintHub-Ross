import { Router } from 'express';
import { 
  organizationQueries, 
  userQueries, 
  checkOrganizationSubscription,
  auditLogQueries,
  subscriptionTransactionQueries 
} from '../database';
import { authenticateToken, AuthRequest, requireRole } from '../middleware/auth';

const router = Router();

// Get organization details (authenticated users only)
router.get('/:id', authenticateToken, (req: AuthRequest, res) => {
  try {
    const orgId = parseInt(req.params.id);
    const user = req.user!;

    // Users can only view their own organization (unless admin)
    if (user.role !== 'admin' && user.organizationId !== orgId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const org = organizationQueries.findById().get(orgId);
    
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Don't expose sensitive SAML details to regular users
    const sanitizedOrg = { ...org } as any;
    if (user.role !== 'admin' && !user.isOrgAdmin) {
      delete sanitizedOrg.saml_certificate;
      delete sanitizedOrg.stripe_customer_id;
    }

    res.json(sanitizedOrg);
  } catch (error) {
    console.error('Get organization error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create organization (admin only)
router.post('/', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const { name, domain, subscriptionPlan } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Organization name required' });
    }

    const result = organizationQueries.create().run(
      name, 
      domain || null, 
      subscriptionPlan || 'basic',
      'trial' // Start with trial
    );

    const orgId = (result as any).lastInsertRowid;

    // Log the action
    auditLogQueries.create().run(
      req.user!.id,
      orgId,
      'organization_created',
      'organization',
      orgId.toString(),
      JSON.stringify({ name, domain, subscriptionPlan }),
      req.ip,
      req.headers['user-agent'] || null
    );

    res.status(201).json({
      id: orgId,
      name,
      domain,
      subscriptionPlan: subscriptionPlan || 'basic',
      subscriptionStatus: 'trial'
    });
  } catch (error) {
    console.error('Create organization error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update organization subscription (admin only)
router.patch('/:id/subscription', authenticateToken, requireRole(['admin']), (req: AuthRequest, res) => {
  try {
    const orgId = parseInt(req.params.id);
    const { subscriptionId, status, plan, startsAt, endsAt } = req.body;

    organizationQueries.updateSubscription().run(
      subscriptionId,
      status,
      plan,
      startsAt,
      endsAt,
      orgId
    );

    // Log transaction
    subscriptionTransactionQueries.create().run(
      orgId,
      'updated',
      null,
      'USD',
      null,
      null,
      JSON.stringify({ status, plan, startsAt, endsAt })
    );

    // Audit log
    auditLogQueries.create().run(
      req.user!.id,
      orgId,
      'subscription_updated',
      'organization',
      orgId.toString(),
      JSON.stringify({ status, plan }),
      req.ip,
      req.headers['user-agent'] || null
    );

    res.json({ message: 'Subscription updated successfully' });
  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update SAML settings (admin or org admin)
router.patch('/:id/saml', authenticateToken, (req: AuthRequest, res) => {
  try {
    const orgId = parseInt(req.params.id);
    const user = req.user!;

    // Only admin or org admin of this organization can update SAML
    if (user.role !== 'admin' && (user.organizationId !== orgId || !user.isOrgAdmin)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { enabled, entityId, ssoUrl, certificate } = req.body;

    organizationQueries.updateSAML().run(
      enabled ? 1 : 0,
      entityId || null,
      ssoUrl || null,
      certificate || null,
      orgId
    );

    // Audit log
    auditLogQueries.create().run(
      user.id,
      orgId,
      'saml_updated',
      'organization',
      orgId.toString(),
      JSON.stringify({ enabled }),
      req.ip,
      req.headers['user-agent'] || null
    );

    res.json({ message: 'SAML settings updated successfully' });
  } catch (error) {
    console.error('Update SAML error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List users in organization (org admin or admin)
router.get('/:id/users', authenticateToken, (req: AuthRequest, res) => {
  try {
    const orgId = parseInt(req.params.id);
    const user = req.user!;

    // Only admin or org admin of this organization can list users
    if (user.role !== 'admin' && (user.organizationId !== orgId || !user.isOrgAdmin)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const users = userQueries.listByOrganization().all(orgId);

    res.json(users);
  } catch (error) {
    console.error('List organization users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user role within organization (org admin)
router.patch('/:id/users/:userId', authenticateToken, (req: AuthRequest, res) => {
  try {
    const orgId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);
    const user = req.user!;

    // Only admin or org admin of this organization
    if (user.role !== 'admin' && (user.organizationId !== orgId || !user.isOrgAdmin)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { isActive, isOrgAdmin } = req.body;
    
    const targetUser = userQueries.findById().get(userId) as any;
    if (!targetUser || targetUser.organization_id !== orgId) {
      return res.status(404).json({ error: 'User not found in organization' });
    }

    // Update user
    const updates: string[] = [];
    const values: any[] = [];
    
    if (typeof isActive === 'boolean') {
      updates.push('is_active = ?');
      values.push(isActive ? 1 : 0);
    }
    
    if (typeof isOrgAdmin === 'boolean') {
      updates.push('is_org_admin = ?');
      values.push(isOrgAdmin ? 1 : 0);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(userId);
      
      const db = require('../database').db;
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

      // Audit log
      auditLogQueries.create().run(
        user.id,
        orgId,
        'user_updated',
        'user',
        userId.toString(),
        JSON.stringify({ isActive, isOrgAdmin }),
        req.ip,
        req.headers['user-agent'] || null
      );

      res.json({ message: 'User updated successfully' });
    } else {
      res.status(400).json({ error: 'No valid updates provided' });
    }
  } catch (error) {
    console.error('Update organization user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check subscription status
router.get('/:id/subscription/status', authenticateToken, (req: AuthRequest, res) => {
  try {
    const orgId = parseInt(req.params.id);
    const user = req.user!;

    // Users can only check their own organization's status (unless admin)
    if (user.role !== 'admin' && user.organizationId !== orgId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const status = checkOrganizationSubscription(orgId);
    res.json(status);
  } catch (error) {
    console.error('Check subscription status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get audit logs (org admin or admin)
router.get('/:id/audit-logs', authenticateToken, (req: AuthRequest, res) => {
  try {
    const orgId = parseInt(req.params.id);
    const user = req.user!;
    const limit = parseInt(req.query.limit as string) || 100;

    // Only admin or org admin of this organization
    if (user.role !== 'admin' && (user.organizationId !== orgId || !user.isOrgAdmin)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const logs = auditLogQueries.listByOrganization().all(orgId, Math.min(limit, 1000));
    res.json(logs);
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List all organizations (admin only)
router.get('/', authenticateToken, requireRole(['admin']), (req: AuthRequest, res) => {
  try {
    const organizations = organizationQueries.list().all();
    res.json(organizations);
  } catch (error) {
    console.error('List organizations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

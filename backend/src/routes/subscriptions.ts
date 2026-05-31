import { Router } from 'express';
import { 
  organizationQueries, 
  subscriptionTransactionQueries,
  auditLogQueries 
} from '../database';
import { authenticateToken, AuthRequest, requireRole } from '../middleware/auth';

const router = Router();

// Webhook handler for Stripe events
router.post('/webhook', async (req, res) => {
  try {
    const event = req.body;

    // In production, verify the webhook signature
    // const sig = req.headers['stripe-signature'];
    // const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    // event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;
      
      case 'customer.subscription.deleted':
        await handleSubscriptionCancelled(event.data.object);
        break;
      
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

// Calculate monthly cost for an organization
router.get('/calculate-cost/:organizationId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const orgId = parseInt(req.params.organizationId);
    const user = req.user!;

    // Check permissions
    if (user.role !== 'admin' && (user.organizationId !== orgId || !user.isOrgAdmin)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const org = organizationQueries.findById().get(orgId) as any;
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // If custom pricing, return that
    if (org.custom_pricing && org.custom_monthly_fee) {
      return res.json({
        organizationId: orgId,
        pricingModel: 'custom',
        monthlyFee: org.custom_monthly_fee,
        currency: 'USD',
        details: 'Custom institutional pricing'
      });
    }

    // Calculate usage-based pricing
    const printerCost = org.num_printers * org.price_per_printer;
    const userCost = org.num_additional_users * org.price_per_additional_user;
    const totalCost = printerCost + userCost;

    res.json({
      organizationId: orgId,
      pricingModel: 'usage-based',
      numPrinters: org.num_printers,
      numAdditionalUsers: org.num_additional_users,
      pricePerPrinter: org.price_per_printer,
      pricePerAdditionalUser: org.price_per_additional_user,
      printerCost: printerCost,
      userCost: userCost,
      monthlyFee: totalCost,
      currency: 'USD',
      breakdown: [
        { item: 'Printers', quantity: org.num_printers, unitPrice: org.price_per_printer, total: printerCost },
        { item: 'Additional Users', quantity: org.num_additional_users, unitPrice: org.price_per_additional_user, total: userCost }
      ]
    });
  } catch (error) {
    console.error('Calculate cost error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// External purchase confirmation - called by external billing system
router.post('/confirm-purchase', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const { organizationId, subscriptionId, numPrinters, numAdditionalUsers, customPricing, customMonthlyFee } = req.body;

    if (!organizationId || !subscriptionId) {
      return res.status(400).json({ error: 'Organization ID and subscription ID required' });
    }

    const org = organizationQueries.findById().get(organizationId) as any;
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Update organization with subscription details
    const db = require('../database').db;
    
    if (customPricing && customMonthlyFee) {
      db.prepare(`
        UPDATE organizations 
        SET subscription_id = ?, 
            subscription_status = 'active',
            subscription_plan = 'custom',
            num_printers = ?,
            num_additional_users = ?,
            custom_pricing = 1,
            custom_monthly_fee = ?,
            subscription_starts_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(subscriptionId, numPrinters || 0, numAdditionalUsers || 0, customMonthlyFee, organizationId);
    } else {
      db.prepare(`
        UPDATE organizations 
        SET subscription_id = ?, 
            subscription_status = 'active',
            subscription_plan = 'standard',
            num_printers = ?,
            num_additional_users = ?,
            custom_pricing = 0,
            subscription_starts_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(subscriptionId, numPrinters || 0, numAdditionalUsers || 0, organizationId);
    }

    // Log the transaction
    subscriptionTransactionQueries.create().run(
      organizationId,
      'created',
      customMonthlyFee || ((numPrinters || 0) * 10 + (numAdditionalUsers || 0) * 0.25),
      'USD',
      null,
      subscriptionId,
      JSON.stringify({ numPrinters, numAdditionalUsers, customPricing })
    );

    // Audit log
    auditLogQueries.create().run(
      req.user!.id,
      organizationId,
      'subscription_activated',
      'organization',
      organizationId.toString(),
      JSON.stringify({ subscriptionId, numPrinters, numAdditionalUsers }),
      req.ip,
      req.headers['user-agent'] || null
    );

    res.json({ 
      message: 'Subscription activated successfully',
      organizationId,
      subscriptionId
    });
  } catch (error) {
    console.error('Confirm purchase error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create portal session for managing subscription (org admin or admin)
router.post('/create-portal-session', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { organizationId } = req.body;
    const user = req.user!;

    // Check permissions
    if (user.role !== 'admin' && (user.organizationId !== organizationId || !user.isOrgAdmin)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const org = organizationQueries.findById().get(organizationId) as any;
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Redirect to external billing/purchasing site
    // The external site should handle subscription management
    const externalBillingUrl = process.env.EXTERNAL_BILLING_URL || 'https://billing.example.com';
    
    res.json({
      url: `${externalBillingUrl}/manage?org=${organizationId}&subscription=${org.subscription_id || ''}`,
      message: 'Redirecting to external billing portal'
    });
  } catch (error) {
    console.error('Create portal session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get subscription pricing information
router.get('/plans', (req, res) => {
  const pricing = {
    model: 'usage-based',
    basePricing: {
      pricePerPrinter: 10.00,
      pricePerAdditionalUser: 0.25,
      interval: 'month',
      currency: 'USD'
    },
    description: 'Pay only for what you use',
    features: [
      '$10/month per printer',
      '$0.25/month per user (first admin is free)',
      'All users get full access to features',
      'No user limits',
      'No printer limits',
      'Basic support included',
      'Advanced queue optimization',
      'File storage (unlimited)',
      'Custom slicer profiles',
      'Analytics dashboard'
    ],
    customPricing: {
      available: true,
      description: 'Custom pricing available for institutions',
      contactInfo: 'Contact us for custom institutional pricing',
      benefits: [
        'Volume discounts for large institutions',
        'Flexible payment terms',
        'Dedicated support',
        'SSO/SAML integration included',
        'Custom integration options',
        'SLA guarantees available'
      ]
    },
    adminVsUser: {
      admins: {
        description: 'Organization admins',
        cost: 'First admin free, additional admins $0.25/month each',
        capabilities: [
          'Manage organization users',
          'Add/remove other admins',
          'Configure printers',
          'Manage subscriptions',
          'View audit logs',
          'Configure SAML/SSO'
        ]
      },
      additionalUsers: {
        description: 'Regular users (students, staff)',
        cost: '$0.25/month per user',
        capabilities: [
          'Submit print jobs',
          'View own jobs',
          'Upload files',
          'Track print status'
        ]
      },
      pricing: {
        note: 'Only the first admin is free. All additional admins and users are billed at $0.25/month each.'
      }
    }
  };

  res.json(pricing);
});

// Update organization usage (admin only - for manual adjustment)
router.patch('/update-usage/:organizationId', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const orgId = parseInt(req.params.organizationId);
    const { numPrinters, numAdditionalUsers } = req.body;

    if (typeof numPrinters !== 'number' || typeof numAdditionalUsers !== 'number') {
      return res.status(400).json({ error: 'Number of printers and additional users required' });
    }

    const db = require('../database').db;
    db.prepare(`
      UPDATE organizations 
      SET num_printers = ?, 
          num_additional_users = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(numPrinters, numAdditionalUsers, orgId);

    // Audit log
    auditLogQueries.create().run(
      req.user!.id,
      orgId,
      'usage_updated',
      'organization',
      orgId.toString(),
      JSON.stringify({ numPrinters, numAdditionalUsers }),
      req.ip,
      req.headers['user-agent'] || null
    );

    res.json({ 
      message: 'Usage updated successfully',
      numPrinters,
      numAdditionalUsers
    });
  } catch (error) {
    console.error('Update usage error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current usage for an organization
router.get('/usage/:organizationId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const orgId = parseInt(req.params.organizationId);
    const user = req.user!;

    // Check permissions
    if (user.role !== 'admin' && (user.organizationId !== orgId || !user.isOrgAdmin)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const db = require('../database').db;
    
    // Count active printers
    const printerCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM printers 
      WHERE is_active = 1
    `).get() as any;

    // Count all active users (regular users), excluding whitelisted users
    const regularUserCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM users 
      WHERE organization_id = ? 
        AND is_active = 1 
        AND is_org_admin = 0
        AND is_whitelisted = 0
    `).get(orgId) as any;

    // Count admins (excluding whitelisted)
    const adminCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM users 
      WHERE organization_id = ? 
        AND is_active = 1 
        AND is_org_admin = 1
        AND is_whitelisted = 0
    `).get(orgId) as any;

    // Count whitelisted users
    const whitelistedCount = db.prepare(`
      SELECT COUNT(*) as count 
      FROM users 
      WHERE organization_id = ? 
        AND is_active = 1 
        AND is_whitelisted = 1
    `).get(orgId) as any;

    // Calculate billable users: all regular users + (admins - 1)
    // First admin is free, additional admins are billed
    // Whitelisted users are never billed
    const billableUsers = regularUserCount.count + Math.max(0, adminCount.count - 1);

    res.json({
      organizationId: orgId,
      numPrinters: printerCount.count,
      numRegularUsers: regularUserCount.count,
      numAdmins: adminCount.count,
      numWhitelistedUsers: whitelistedCount.count,
      numBillableUsers: billableUsers,
      note: 'First admin is free, additional admins and all regular users are billed at $0.25/month each. Whitelisted users are never billed.'
    });
  } catch (error) {
    console.error('Get usage error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper functions for webhook handling
async function handleSubscriptionUpdate(subscription: any) {
  const orgId = parseInt(subscription.metadata.organizationId);
  
  if (!orgId) {
    console.error('Organization ID not found in subscription metadata');
    return;
  }

  const status = subscription.status === 'active' ? 'active' : 
                 subscription.status === 'past_due' ? 'past_due' :
                 subscription.status === 'canceled' ? 'cancelled' : 'inactive';
  
  const plan = subscription.items.data[0]?.price?.lookup_key || 'basic';
  
  organizationQueries.updateSubscription().run(
    subscription.id,
    status,
    plan,
    new Date(subscription.current_period_start * 1000).toISOString(),
    new Date(subscription.current_period_end * 1000).toISOString(),
    orgId
  );

  subscriptionTransactionQueries.create().run(
    orgId,
    'updated',
    null,
    'USD',
    null,
    null,
    JSON.stringify({ status, plan, subscriptionId: subscription.id })
  );
}

async function handleSubscriptionCancelled(subscription: any) {
  const orgId = parseInt(subscription.metadata.organizationId);
  
  if (!orgId) return;

  organizationQueries.updateSubscription().run(
    subscription.id,
    'cancelled',
    null,
    null,
    null,
    orgId
  );

  subscriptionTransactionQueries.create().run(
    orgId,
    'cancelled',
    null,
    'USD',
    null,
    null,
    JSON.stringify({ subscriptionId: subscription.id })
  );
}

async function handlePaymentSucceeded(invoice: any) {
  const orgId = parseInt(invoice.subscription_metadata?.organizationId);
  
  if (!orgId) return;

  subscriptionTransactionQueries.create().run(
    orgId,
    'payment_succeeded',
    invoice.amount_paid / 100,
    invoice.currency.toUpperCase(),
    invoice.id,
    invoice.payment_intent,
    JSON.stringify({ amount: invoice.amount_paid / 100 })
  );
}

async function handlePaymentFailed(invoice: any) {
  const orgId = parseInt(invoice.subscription_metadata?.organizationId);
  
  if (!orgId) return;

  subscriptionTransactionQueries.create().run(
    orgId,
    'payment_failed',
    invoice.amount_due / 100,
    invoice.currency.toUpperCase(),
    invoice.id,
    null,
    JSON.stringify({ amount: invoice.amount_due / 100, attempt_count: invoice.attempt_count })
  );

  // Update organization status to past_due
  const db = require('../database').db;
  db.prepare(`
    UPDATE organizations 
    SET subscription_status = 'past_due', updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(orgId);
}

export default router;

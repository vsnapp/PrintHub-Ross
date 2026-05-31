import { Router } from 'express';
import { 
  userQueries, 
  organizationQueries, 
  findOrganizationByEmailDomain,
  auditLogQueries 
} from '../database';
import { generateToken } from '../middleware/auth';

const router = Router();

// SAML Login initiation
router.get('/login', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email required' });
    }

    // Find organization by email domain
    const org = findOrganizationByEmailDomain(email) as any;

    if (!org) {
      return res.status(404).json({ 
        error: 'No organization found for this email domain',
        suggestion: 'Please use regular login or contact your administrator'
      });
    }

    if (!org.saml_enabled) {
      return res.status(400).json({ 
        error: 'SSO is not enabled for this organization',
        suggestion: 'Please use regular login'
      });
    }

    // In production, redirect to SAML IdP
    // const samlStrategy = new SamlStrategy({
    //   entryPoint: org.saml_sso_url,
    //   issuer: org.saml_entity_id,
    //   callbackUrl: `${process.env.BACKEND_URL}/api/saml/callback`,
    //   cert: org.saml_certificate
    // });
    
    // For now, return mock response
    res.json({
      redirectUrl: org.saml_sso_url,
      organizationId: org.id,
      organizationName: org.name,
      message: 'SAML integration pending - redirect to IdP would happen here'
    });
  } catch (error) {
    console.error('SAML login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// SAML Callback (assertion consumer service)
router.post('/callback', async (req, res) => {
  try {
    // In production, validate SAML assertion
    // const samlResponse = req.body.SAMLResponse;
    // const profile = await validateSAMLAssertion(samlResponse);
    
    // Mock SAML profile for now
    const profile = {
      nameID: req.body.email || 'user@example.edu',
      email: req.body.email || 'user@example.edu',
      firstName: req.body.firstName || 'Test',
      lastName: req.body.lastName || 'User',
      attributes: req.body.attributes || {}
    };

    const email = profile.email;
    const samlIdentifier = profile.nameID;

    // Find or create user
    let user = userQueries.findByEmail().get(email) as any;
    
    if (!user) {
      // Find organization
      const org = findOrganizationByEmailDomain(email);
      
      if (!org) {
        return res.status(400).json({ 
          error: 'No organization configured for this email domain' 
        });
      }

      const username = email.split('@')[0];
      
      // Create new user (no password for SAML users)
      const result = userQueries.create().run(
        username,
        email,
        null, // No password for SAML users
        'student',
        (org as any).id
      );

      // Update SAML identifier
      const db = require('../database').db;
      const userId = (result as any).lastInsertRowid;
      db.prepare('UPDATE users SET saml_identifier = ?, email_verified = 1 WHERE id = ?')
        .run(samlIdentifier, userId);

      user = {
        id: userId,
        username,
        email,
        role: 'student',
        organization_id: (org as any).id,
        is_org_admin: false,
        saml_identifier: samlIdentifier
      };

      // Audit log
      auditLogQueries.create().run(
        userId,
        (org as any).id,
        'user_created_via_saml',
        'user',
        userId.toString(),
        JSON.stringify({ email }),
        req.ip,
        req.headers['user-agent'] || null
      );
    } else {
      // Update SAML identifier if needed
      if (user.saml_identifier !== samlIdentifier) {
        const db = require('../database').db;
        db.prepare('UPDATE users SET saml_identifier = ?, email_verified = 1 WHERE id = ?')
          .run(samlIdentifier, user.id);
      }

      // Audit log
      auditLogQueries.create().run(
        user.id,
        user.organization_id,
        'user_login_via_saml',
        'user',
        user.id.toString(),
        JSON.stringify({ email }),
        req.ip,
        req.headers['user-agent'] || null
      );
    }

    const token = generateToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      organizationId: user.organization_id,
      isOrgAdmin: user.is_org_admin
    });

    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  } catch (error) {
    console.error('SAML callback error:', error);
    res.status(500).json({ error: 'SAML authentication failed' });
  }
});

// Get SAML metadata (for IdP configuration)
router.get('/metadata', (req, res) => {
  const { organizationId } = req.query;

  if (!organizationId) {
    return res.status(400).json({ error: 'Organization ID required' });
  }

  const org = organizationQueries.findById().get(parseInt(organizationId as string)) as any;

  if (!org) {
    return res.status(404).json({ error: 'Organization not found' });
  }

  // In production, generate proper SAML metadata XML
  const metadata = {
    entityId: org.saml_entity_id || `print-farm-org-${org.id}`,
    assertionConsumerServiceUrl: `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/saml/callback`,
    organizationName: org.name,
    organizationUrl: process.env.FRONTEND_URL || 'http://localhost:5173'
  };

  res.json(metadata);
});

// Check if email domain supports SSO
router.get('/check-domain', (req, res) => {
  const { email } = req.query;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email required' });
  }

  const org = findOrganizationByEmailDomain(email) as any;

  if (!org) {
    return res.json({ 
      ssoEnabled: false,
      message: 'No organization found for this domain'
    });
  }

  res.json({
    ssoEnabled: org.saml_enabled,
    organizationName: org.name,
    organizationId: org.id,
    requiresSso: org.saml_enabled
  });
});

export default router;

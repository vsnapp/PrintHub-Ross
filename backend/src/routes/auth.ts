import { Router } from 'express';
import bcrypt from 'bcrypt';
import { userQueries, findOrganizationByEmailDomain, getDomainFromEmail } from '../database';
import { generateToken, authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = userQueries.findByUsername().get(username) as any;

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        organizationId: user.organization_id,
        isOrgAdmin: user.is_org_admin
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register (students only, or by admin)
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password required' });
    }

    // Check if user already exists
    const existingUser = userQueries.findByUsername().get(username) || userQueries.findByEmail().get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Check if email domain matches an organization
    const organization = findOrganizationByEmailDomain(email);
    let organizationId = null;

    if (organization) {
      // If organization requires SAML, don't allow password registration
      if ((organization as any).saml_enabled) {
        return res.status(400).json({ 
          error: 'This email domain requires SSO login',
          ssoRequired: true,
          organizationId: (organization as any).id
        });
      }
      organizationId = (organization as any).id;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user (default role: student)
    const result = userQueries.create().run(username, email, passwordHash, 'student', organizationId);

    const newUser = {
      id: (result as any).lastInsertRowid,
      username,
      email,
      role: 'student',
      organizationId,
      isOrgAdmin: false
    };

    const token = generateToken(newUser);

    res.status(201).json({
      token,
      user: newUser
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
router.get('/me', authenticateToken, (req: AuthRequest, res) => {
  res.json({ user: req.user });
});

// Logout (client-side token removal, but we acknowledge it)
router.post('/logout', authenticateToken, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

export default router;

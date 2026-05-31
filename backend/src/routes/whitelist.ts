import { Router } from 'express';
import { userQueries, auditLogQueries } from '../database';
import { authenticateToken, AuthRequest, requireRole } from '../middleware/auth';

const router = Router();

// List all whitelisted users (system admin only)
router.get('/', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const whitelistedUsers = userQueries.listWhitelisted().all();
    
    res.json({
      count: whitelistedUsers.length,
      users: whitelistedUsers
    });
  } catch (error) {
    console.error('List whitelist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add user to whitelist (system admin only)
router.post('/add', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Find user by email
    const user = userQueries.findByEmail().get(email.toLowerCase());
    
    if (!user) {
      return res.status(404).json({ error: 'User not found with that email address' });
    }

    // Check if already whitelisted
    if (user.is_whitelisted) {
      return res.status(400).json({ error: 'User is already whitelisted' });
    }

    // Add to whitelist
    userQueries.updateWhitelist().run(1, user.id);

    // Audit log
    auditLogQueries.create().run(
      req.user!.id,
      user.organization_id || null,
      'user_whitelisted',
      'user',
      user.id.toString(),
      JSON.stringify({ email: user.email, username: user.username }),
      req.ip,
      req.headers['user-agent'] || null
    );

    res.json({ 
      message: 'User added to whitelist successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_whitelisted: true
      }
    });
  } catch (error) {
    console.error('Add whitelist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove user from whitelist (system admin only)
router.post('/remove', authenticateToken, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Find user by email
    const user = userQueries.findByEmail().get(email.toLowerCase());
    
    if (!user) {
      return res.status(404).json({ error: 'User not found with that email address' });
    }

    // Check if not whitelisted
    if (!user.is_whitelisted) {
      return res.status(400).json({ error: 'User is not whitelisted' });
    }

    // Remove from whitelist
    userQueries.updateWhitelist().run(0, user.id);

    // Audit log
    auditLogQueries.create().run(
      req.user!.id,
      user.organization_id || null,
      'user_whitelist_removed',
      'user',
      user.id.toString(),
      JSON.stringify({ email: user.email, username: user.username }),
      req.ip,
      req.headers['user-agent'] || null
    );

    res.json({ 
      message: 'User removed from whitelist successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_whitelisted: false
      }
    });
  } catch (error) {
    console.error('Remove whitelist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if email is whitelisted (public endpoint for registration)
router.get('/check/:email', async (req, res) => {
  try {
    const email = req.params.email.toLowerCase();
    
    const user = userQueries.findByEmail().get(email);
    
    res.json({
      email,
      isWhitelisted: user ? user.is_whitelisted === 1 : false,
      exists: !!user
    });
  } catch (error) {
    console.error('Check whitelist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

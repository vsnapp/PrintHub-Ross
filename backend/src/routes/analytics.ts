import { Router, Request, Response } from 'express';
import { getDatabase } from '../database';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

// Super admin analytics endpoint - platform-wide statistics
router.get('/platform-stats', authenticateToken, requireRole(['admin']), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    
    // Total revenue calculation
    const revenueQuery = db.prepare(`
      SELECT 
        COUNT(DISTINCT o.id) as total_organizations,
        SUM(
          CASE 
            WHEN o.custom_pricing = 1 THEN o.custom_monthly_fee
            ELSE (o.num_printers * o.price_per_printer) + (o.num_additional_users * o.price_per_additional_user)
          END
        ) as monthly_recurring_revenue,
        SUM(o.num_printers) as total_printers,
        SUM(o.num_additional_users) as total_billable_users
      FROM organizations o
      WHERE o.subscription_status = 'active'
    `);
    
    const revenue = revenueQuery.get() as any;
    
    // User statistics
    const userStatsQuery = db.prepare(`
      SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_users,
        SUM(CASE WHEN is_org_admin = 1 THEN 1 ELSE 0 END) as total_admins,
        SUM(CASE WHEN email_verified = 1 THEN 1 ELSE 0 END) as verified_users,
        SUM(CASE WHEN saml_identifier IS NOT NULL THEN 1 ELSE 0 END) as sso_users
      FROM users
    `);
    
    const userStats = userStatsQuery.get() as any;
    
    // Organization breakdown
    const orgBreakdownQuery = db.prepare(`
      SELECT 
        subscription_status,
        subscription_plan,
        COUNT(*) as count
      FROM organizations
      GROUP BY subscription_status, subscription_plan
    `);
    
    const orgBreakdown = orgBreakdownQuery.all();
    
    // Recent sign-ups (last 30 days)
    const recentSignupsQuery = db.prepare(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM users
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
    
    const recentSignups = recentSignupsQuery.all();
    
    // Top organizations by size
    const topOrgsQuery = db.prepare(`
      SELECT 
        o.id,
        o.name,
        o.domain,
        o.subscription_plan,
        o.num_printers,
        o.num_additional_users,
        COUNT(u.id) as total_users,
        CASE 
          WHEN o.custom_pricing = 1 THEN o.custom_monthly_fee
          ELSE (o.num_printers * o.price_per_printer) + (o.num_additional_users * o.price_per_additional_user)
        END as monthly_revenue
      FROM organizations o
      LEFT JOIN users u ON u.organization_id = o.id
      WHERE o.subscription_status = 'active'
      GROUP BY o.id
      ORDER BY monthly_revenue DESC
      LIMIT 10
    `);
    
    const topOrganizations = topOrgsQuery.all();
    
    // Growth metrics (comparing current month to previous month)
    const currentMonthQuery = db.prepare(`
      SELECT 
        COUNT(*) as new_users,
        COUNT(DISTINCT organization_id) as new_orgs_with_users
      FROM users
      WHERE created_at >= datetime('now', 'start of month')
    `);
    
    const previousMonthQuery = db.prepare(`
      SELECT 
        COUNT(*) as new_users,
        COUNT(DISTINCT organization_id) as new_orgs_with_users
      FROM users
      WHERE created_at >= datetime('now', '-1 month', 'start of month')
        AND created_at < datetime('now', 'start of month')
    `);
    
    const currentMonth = currentMonthQuery.get() as any;
    const previousMonth = previousMonthQuery.get() as any;
    
    // Calculate growth percentages
    const userGrowth = previousMonth.new_users > 0 
      ? ((currentMonth.new_users - previousMonth.new_users) / previousMonth.new_users * 100).toFixed(2)
      : '0.00';
    
    // Subscription transactions summary
    const transactionsQuery = db.prepare(`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_revenue_all_time,
        SUM(CASE WHEN status = 'completed' AND created_at >= datetime('now', 'start of month') THEN amount ELSE 0 END) as revenue_this_month
      FROM subscription_transactions
    `);
    
    const transactions = transactionsQuery.get() as any;
    
    // SAML/SSO usage
    const samlStatsQuery = db.prepare(`
      SELECT 
        COUNT(*) as saml_enabled_orgs,
        SUM(
          CASE 
            WHEN o.custom_pricing = 1 THEN o.custom_monthly_fee
            ELSE (o.num_printers * o.price_per_printer) + (o.num_additional_users * o.price_per_additional_user)
          END
        ) as saml_org_revenue
      FROM organizations o
      WHERE o.saml_enabled = 1 AND o.subscription_status = 'active'
    `);
    
    const samlStats = samlStatsQuery.get() as any;
    
    // Audit log activity (last 7 days)
    const auditActivityQuery = db.prepare(`
      SELECT 
        action,
        COUNT(*) as count
      FROM audit_logs
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY action
      ORDER BY count DESC
      LIMIT 10
    `);
    
    const auditActivity = auditActivityQuery.all();
    
    res.json({
      revenue: {
        monthlyRecurringRevenue: revenue.monthly_recurring_revenue || 0,
        totalRevenueAllTime: transactions.total_revenue_all_time || 0,
        revenueThisMonth: transactions.revenue_this_month || 0,
        totalOrganizations: revenue.total_organizations || 0,
        totalPrinters: revenue.total_printers || 0,
        totalBillableUsers: revenue.total_billable_users || 0,
        averageRevenuePerOrg: revenue.total_organizations > 0 
          ? (revenue.monthly_recurring_revenue / revenue.total_organizations).toFixed(2)
          : '0.00'
      },
      users: {
        totalUsers: userStats.total_users || 0,
        activeUsers: userStats.active_users || 0,
        totalAdmins: userStats.total_admins || 0,
        verifiedUsers: userStats.verified_users || 0,
        ssoUsers: userStats.sso_users || 0,
        inactiveUsers: (userStats.total_users || 0) - (userStats.active_users || 0)
      },
      organizations: {
        breakdown: orgBreakdown,
        topOrganizations: topOrganizations
      },
      growth: {
        currentMonth: {
          newUsers: currentMonth.new_users || 0,
          newOrgsWithUsers: currentMonth.new_orgs_with_users || 0
        },
        previousMonth: {
          newUsers: previousMonth.new_users || 0,
          newOrgsWithUsers: previousMonth.new_orgs_with_users || 0
        },
        userGrowthPercentage: userGrowth,
        recentSignups: recentSignups
      },
      saml: {
        enabledOrganizations: samlStats.saml_enabled_orgs || 0,
        samlOrgRevenue: samlStats.saml_org_revenue || 0
      },
      transactions: {
        total: transactions.total_transactions || 0,
        thisMonth: transactions.revenue_this_month || 0
      },
      activity: {
        recentAuditActions: auditActivity
      },
      generatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error fetching platform stats:', error);
    res.status(500).json({ error: 'Failed to fetch platform statistics' });
  }
});

// Real-time metrics endpoint - current active sessions, etc.
router.get('/real-time', authenticateToken, requireRole(['admin']), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    
    // Active users in last 15 minutes (based on recent audit logs or activity)
    const recentActivityQuery = db.prepare(`
      SELECT COUNT(DISTINCT user_id) as active_users_15min
      FROM audit_logs
      WHERE created_at >= datetime('now', '-15 minutes')
    `);
    
    const recentActivity = recentActivityQuery.get() as any;
    
    // Active users today
    const todayActivityQuery = db.prepare(`
      SELECT COUNT(DISTINCT user_id) as active_users_today
      FROM audit_logs
      WHERE created_at >= datetime('now', 'start of day')
    `);
    
    const todayActivity = todayActivityQuery.get() as any;
    
    // Recent transactions (last hour)
    const recentTransactionsQuery = db.prepare(`
      SELECT 
        COUNT(*) as transactions_last_hour,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as revenue_last_hour
      FROM subscription_transactions
      WHERE created_at >= datetime('now', '-1 hour')
    `);
    
    const recentTransactions = recentTransactionsQuery.get() as any;
    
    res.json({
      activeUsers: {
        last15Minutes: recentActivity.active_users_15min || 0,
        today: todayActivity.active_users_today || 0
      },
      recentTransactions: {
        lastHour: recentTransactions.transactions_last_hour || 0,
        revenueLastHour: recentTransactions.revenue_last_hour || 0
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error fetching real-time stats:', error);
    res.status(500).json({ error: 'Failed to fetch real-time statistics' });
  }
});

// Export revenue report (CSV format)
router.get('/revenue-report', authenticateToken, requireRole(['admin']), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    
    const reportQuery = db.prepare(`
      SELECT 
        o.id as organization_id,
        o.name as organization_name,
        o.domain,
        o.subscription_plan,
        o.subscription_status,
        o.num_printers,
        o.num_additional_users,
        o.price_per_printer,
        o.price_per_additional_user,
        o.custom_pricing,
        o.custom_monthly_fee,
        CASE 
          WHEN o.custom_pricing = 1 THEN o.custom_monthly_fee
          ELSE (o.num_printers * o.price_per_printer) + (o.num_additional_users * o.price_per_additional_user)
        END as monthly_revenue,
        COUNT(u.id) as total_users,
        o.created_at
      FROM organizations o
      LEFT JOIN users u ON u.organization_id = o.id
      GROUP BY o.id
      ORDER BY monthly_revenue DESC
    `);
    
    const data = reportQuery.all() as any[];
    
    // Convert to CSV
    const headers = [
      'Organization ID', 'Name', 'Domain', 'Plan', 'Status',
      'Printers', 'Billable Users', 'Price/Printer', 'Price/User',
      'Custom Pricing', 'Custom Fee', 'Monthly Revenue', 'Total Users', 'Created At'
    ];
    
    let csv = headers.join(',') + '\n';
    
    data.forEach(row => {
      csv += [
        row.organization_id,
        `"${row.organization_name}"`,
        row.domain || '',
        row.subscription_plan || '',
        row.subscription_status,
        row.num_printers,
        row.num_additional_users,
        row.price_per_printer,
        row.price_per_additional_user,
        row.custom_pricing ? 'Yes' : 'No',
        row.custom_monthly_fee || '',
        row.monthly_revenue || 0,
        row.total_users,
        row.created_at
      ].join(',') + '\n';
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=revenue-report-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error: any) {
    console.error('Error generating revenue report:', error);
    res.status(500).json({ error: 'Failed to generate revenue report' });
  }
});

export default router;

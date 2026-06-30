const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/schema');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const { MODULES, LEVELS, defaultPermissionsFor } = require('../permissions');
const router = express.Router();

function logAction(req, action, target_type, target_id, details) {
  db.prepare('INSERT INTO audit_logs (id,org_id,actor_user_id,actor_role,action,target_type,target_id,details) VALUES (?,?,?,?,?,?,?,?)')
    .run(uuidv4(), req.user.org_id || null, req.user.id, req.user.role, action, target_type || null, target_id || null, details ? JSON.stringify(details) : null);
}

// Expose the module/level catalog so the frontend can render the checkbox grid
// without hardcoding module names in two places.
router.get('/permission-catalog', auth, (req, res) => {
  res.json({ modules: MODULES, levels: LEVELS });
});

// ═══════════════ SUPER ADMIN ═══════════════

router.get('/organizations', auth, requireRole('super_admin'), (req, res) => {
  const orgs = db.prepare('SELECT * FROM organizations ORDER BY created_at DESC').all();
  const withCounts = orgs.map(o => {
    const userCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE org_id=?').get(o.id).c;
    const agentCount = db.prepare('SELECT COUNT(*) as c FROM agents WHERE org_id=?').get(o.id).c;
    const callCount = db.prepare('SELECT COUNT(*) as c FROM calls WHERE org_id=?').get(o.id).c;
    return { ...o, userCount, agentCount, callCount };
  });
  res.json(withCounts);
});

router.put('/organizations/:id/status', auth, requireRole('super_admin'), (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE organizations SET status=? WHERE id=?').run(status, req.params.id);
  logAction(req, 'org_status_change', 'organization', req.params.id, { status });
  res.json({ success: true });
});

router.put('/organizations/:id/plan', auth, requireRole('super_admin'), (req, res) => {
  const { plan } = req.body;
  db.prepare('UPDATE organizations SET plan=? WHERE id=?').run(plan, req.params.id);
  logAction(req, 'org_plan_change', 'organization', req.params.id, { plan });
  res.json({ success: true });
});

router.get('/all-users', auth, requireRole('super_admin'), (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.status, u.created_at, o.name as org_name, o.id as org_id
    FROM users u LEFT JOIN organizations o ON u.org_id = o.id
    ORDER BY u.created_at DESC
  `).all();
  res.json(rows);
});

router.put('/all-users/:id/role', auth, requireRole('super_admin'), (req, res) => {
  const { role } = req.body;
  db.prepare('UPDATE users SET role=? WHERE id=?').run(role, req.params.id);
  logAction(req, 'force_role_change', 'user', req.params.id, { role });
  res.json({ success: true });
});

router.get('/audit-logs', auth, requireRole('super_admin'), (req, res) => {
  res.json(db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 300').all());
});

// ═══════════════ ORG ADMIN / MANAGER — team management with granular permissions ═══════════════

router.get('/team', auth, requireRole('admin', 'manager'), (req, res) => {
  const rows = db.prepare('SELECT id,name,email,role,permissions,status,created_at FROM users WHERE org_id=? ORDER BY created_at DESC').all(req.user.org_id);
  res.json(rows.map(r => ({ ...r, permissions: r.permissions ? JSON.parse(r.permissions) : {} })));
});

router.get('/team/:id', auth, requireRole('admin', 'manager'), (req, res) => {
  const row = db.prepare('SELECT id,name,email,role,permissions,status FROM users WHERE id=? AND org_id=?').get(req.params.id, req.user.org_id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ ...row, permissions: row.permissions ? JSON.parse(row.permissions) : {} });
});

// Admin/Manager invites a new team member — permissions object is explicit,
// e.g. { dashboard: 'view', campaigns: 'edit', recordings: 'view', ... }
router.post('/team', auth, requireRole('admin', 'manager'), (req, res) => {
  const { name, email, password, role, permissions } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, password required' });

  if (req.user.role === 'manager' && role !== 'agent') {
    return res.status(403).json({ error: 'Managers can only create Agent accounts' });
  }
  if (!['manager', 'agent'].includes(role)) {
    return res.status(400).json({ error: 'Can only invite manager or agent roles' });
  }

  // Clamp every supplied level to a known value; fall back to role defaults for anything missing
  const defaults = defaultPermissionsFor(role);
  const finalPerms = { ...defaults };
  if (permissions && typeof permissions === 'object') {
    for (const m of MODULES) {
      if (permissions[m.key] && LEVELS.includes(permissions[m.key])) {
        finalPerms[m.key] = permissions[m.key];
      }
    }
  }
  // Team module is never delegable below admin — managers/agents can't manage team regardless of checkboxes
  finalPerms.team = 'none';

  try {
    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (id,org_id,name,email,password,role,permissions) VALUES (?,?,?,?,?,?,?)')
      .run(id, req.user.org_id, name, email, hash, role, JSON.stringify(finalPerms));
    logAction(req, 'invite_team_member', 'user', id, { role, permissions: finalPerms });
    res.json({ id, name, email, role, status: 'active', permissions: finalPerms });
  } catch (e) {
    res.status(400).json({ error: 'Email already exists' });
  }
});

router.put('/team/:id', auth, requireRole('admin', 'manager'), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id=? AND org_id=?').get(req.params.id, req.user.org_id);
  if (!target) return res.status(404).json({ error: 'Not found' });
  if (target.role === 'admin') return res.status(403).json({ error: 'Cannot modify the organization admin' });

  if (req.user.role === 'manager' && target.role !== 'agent') {
    return res.status(403).json({ error: 'Managers can only edit Agent accounts' });
  }

  const { name, role, permissions, status } = req.body;
  const finalPerms = { ...(permissions || JSON.parse(target.permissions || '{}')) };
  finalPerms.team = 'none';

  db.prepare('UPDATE users SET name=?,role=?,permissions=?,status=? WHERE id=? AND org_id=?')
    .run(name, role, JSON.stringify(finalPerms), status, req.params.id, req.user.org_id);
  logAction(req, 'update_team_member', 'user', req.params.id, { role, status, permissions: finalPerms });
  res.json({ success: true });
});

router.delete('/team/:id', auth, requireRole('admin', 'manager'), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id=? AND org_id=?').get(req.params.id, req.user.org_id);
  if (!target) return res.status(404).json({ error: 'Not found' });
  if (target.role === 'admin') return res.status(403).json({ error: 'Cannot delete the organization admin' });
  if (req.user.role === 'manager' && target.role !== 'agent') {
    return res.status(403).json({ error: 'Managers can only remove Agent accounts' });
  }

  db.prepare('DELETE FROM users WHERE id=? AND org_id=?').run(req.params.id, req.user.org_id);
  logAction(req, 'delete_team_member', 'user', req.params.id);
  res.json({ success: true });
});

router.get('/team/audit-logs', auth, requireRole('admin', 'manager'), (req, res) => {
  res.json(db.prepare('SELECT * FROM audit_logs WHERE org_id=? ORDER BY created_at DESC LIMIT 200').all(req.user.org_id));
});

module.exports = router;

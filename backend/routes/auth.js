const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/schema');
const { defaultPermissionsFor } = require('../permissions');
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'smai_v2_secret';

function signToken(user) {
  const permissions = user.permissions
    ? (typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions)
    : defaultPermissionsFor(user.role);
  return jwt.sign(
    { id: user.id, org_id: user.org_id, email: user.email, role: user.role, permissions },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// New self-signup → creates a brand new Organization, user becomes its "admin"
router.post('/register', (req, res) => {
  const { name, email, password, company } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
  try {
    const orgId = uuidv4();
    const userId = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    const perms = defaultPermissionsFor('admin');

    db.prepare('INSERT INTO organizations (id,name,created_by) VALUES (?,?,?)')
      .run(orgId, company || (name + "'s Organization"), userId);

    db.prepare('INSERT INTO users (id,org_id,name,email,password,role,permissions) VALUES (?,?,?,?,?,?,?)')
      .run(userId, orgId, name, email, hash, 'admin', JSON.stringify(perms));

    const user = { id: userId, org_id: orgId, email, role: 'admin', permissions: perms };
    res.json({ token: signToken(user), user: { id: userId, name, email, role: 'admin', org_id: orgId, permissions: perms } });
  } catch (e) {
    res.status(400).json({ error: 'Email already exists' });
  }
});

// ─── SUPER ADMIN SIGNUP — gated by a server-side secret, never exposed in the UI ───
// This is meant to be used once (or rarely) by SmartTech's own team to bootstrap
// the platform-level account. It deliberately has NO organization attached —
// super_admin operates above the org layer.
router.post('/register-super-admin', (req, res) => {
  const { name, email, password, secret } = req.body;
  const expected = process.env.SUPER_ADMIN_SECRET;

  if (!expected) {
    return res.status(500).json({ error: 'Super admin signup is not configured on this server' });
  }
  if (!secret || secret !== expected) {
    return res.status(403).json({ error: 'Invalid setup secret' });
  }
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });

  try {
    const userId = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    const perms = defaultPermissionsFor('admin'); // super_admin bypasses module checks anyway

    db.prepare('INSERT INTO users (id,org_id,name,email,password,role,permissions) VALUES (?,?,?,?,?,?,?)')
      .run(userId, null, name, email, hash, 'super_admin', JSON.stringify(perms));

    const user = { id: userId, org_id: null, email, role: 'super_admin', permissions: perms };
    res.json({ token: signToken(user), user: { id: userId, name, email, role: 'super_admin', org_id: null, permissions: perms } });
  } catch (e) {
    res.status(400).json({ error: 'Email already exists' });
  }
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid credentials' });
  if (user.status === 'suspended') return res.status(403).json({ error: 'This account has been suspended' });

  const permissions = user.permissions ? JSON.parse(user.permissions) : defaultPermissionsFor(user.role);

  res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email, role: user.role, org_id: user.org_id, permissions }
  });
});

module.exports = router;

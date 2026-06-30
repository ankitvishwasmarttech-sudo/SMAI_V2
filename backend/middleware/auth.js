const jwt = require('jsonwebtoken');
const { hasAccess } = require('../permissions');
const JWT_SECRET = process.env.JWT_SECRET || 'smai_v2_secret';

// Standard auth — verifies token, attaches { id, org_id, role, email, permissions } to req.user
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Role gate — use after auth(). Pass allowed roles, e.g. requireRole('super_admin', 'admin')
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    next();
  };
}

// Module-level permission gate — use after auth().
// requirePermission('agents', 'edit') blocks anyone whose permission for "agents"
// is below "edit" (i.e. 'view' or 'none').
function requirePermission(moduleKey, level = 'view') {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No token' });
    if (!hasAccess(req.user, moduleKey, level)) {
      return res.status(403).json({ error: `You don't have ${level} access to ${moduleKey}` });
    }
    next();
  };
}

module.exports = auth;
module.exports.requireRole = requireRole;
module.exports.requirePermission = requirePermission;

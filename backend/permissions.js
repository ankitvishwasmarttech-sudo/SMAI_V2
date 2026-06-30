const MODULES = [
  { key: 'dashboard',     label: 'Dashboard' },
  { key: 'agents',        label: 'AI Agents' },
  { key: 'flows',         label: 'Flow Builder' },
  { key: 'ivr',           label: 'IVR Menus' },
  { key: 'dispositions',  label: 'Dispositions' },
  { key: 'telephony',     label: 'Trunks & Numbers' },
  { key: 'campaigns',     label: 'Campaigns' },
  { key: 'calls',         label: 'Call Logs' },
  { key: 'reports',       label: 'Reports' },
  { key: 'recordings',    label: 'Recordings' },
  { key: 'quality',       label: 'Quality Audit' },
  { key: 'dnd',           label: 'DND List' },
  { key: 'team',          label: 'Team' },
];

const LEVELS = ['none', 'view', 'edit', 'full'];

const ROLE_DEFAULTS = {
  admin: Object.fromEntries(MODULES.map(m => [m.key, 'full'])),
  manager: {
    dashboard: 'view', agents: 'edit', flows: 'edit', ivr: 'edit',
    dispositions: 'edit', telephony: 'view', campaigns: 'full',
    calls: 'view', reports: 'view', recordings: 'view', quality: 'edit', dnd: 'edit', team: 'none',
  },
  agent: {
    dashboard: 'view', agents: 'none', flows: 'none', ivr: 'none',
    dispositions: 'none', telephony: 'none', campaigns: 'view',
    calls: 'view', reports: 'none', recordings: 'view', quality: 'none', dnd: 'none', team: 'none',
  },
};

function defaultPermissionsFor(role) {
  return ROLE_DEFAULTS[role] || ROLE_DEFAULTS.agent;
}

function hasAccess(user, moduleKey, requiredLevel = 'view') {
  if (user.role === 'super_admin' || user.role === 'admin') return true;
  const perms = user.permissions || {};
  const have = perms[moduleKey] || 'none';
  const order = LEVELS.indexOf(have);
  const need = LEVELS.indexOf(requiredLevel);
  return order >= need;
}

module.exports = { MODULES, LEVELS, ROLE_DEFAULTS, defaultPermissionsFor, hasAccess };

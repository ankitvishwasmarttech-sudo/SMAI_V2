// Central definition of every controllable module and what each access level means.
// This is the single source of truth — both backend enforcement and frontend UI
// pull from this list so they never drift out of sync.

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
  { key: 'dnd',           label: 'DND List' },
  { key: 'team',          label: 'Team' },
];

// none  = module is fully hidden from this user
// view  = can see data, cannot create/edit/delete
// edit  = can see + create + edit, cannot delete
// full  = complete control including delete
const LEVELS = ['none', 'view', 'edit', 'full'];

// Default permission sets per role — used when a new team member is created
// and no explicit permissions were chosen by the inviting Admin/Manager.
const ROLE_DEFAULTS = {
  admin: Object.fromEntries(MODULES.map(m => [m.key, 'full'])),
  manager: {
    dashboard: 'view', agents: 'edit', flows: 'edit', ivr: 'edit',
    dispositions: 'edit', telephony: 'view', campaigns: 'full',
    calls: 'view', reports: 'view', recordings: 'view', dnd: 'edit', team: 'none',
  },
  agent: {
    dashboard: 'view', agents: 'none', flows: 'none', ivr: 'none',
    dispositions: 'none', telephony: 'none', campaigns: 'view',
    calls: 'view', reports: 'none', recordings: 'view', dnd: 'none', team: 'none',
  },
};

function defaultPermissionsFor(role) {
  return ROLE_DEFAULTS[role] || ROLE_DEFAULTS.agent;
}

// Check if a permission set allows at least `requiredLevel` for `moduleKey`.
// super_admin and org admin always pass (full system / full org control).
function hasAccess(user, moduleKey, requiredLevel = 'view') {
  if (user.role === 'super_admin' || user.role === 'admin') return true;
  const perms = user.permissions || {};
  const have = perms[moduleKey] || 'none';
  const order = LEVELS.indexOf(have);
  const need = LEVELS.indexOf(requiredLevel);
  return order >= need;
}

module.exports = { MODULES, LEVELS, ROLE_DEFAULTS, defaultPermissionsFor, hasAccess };

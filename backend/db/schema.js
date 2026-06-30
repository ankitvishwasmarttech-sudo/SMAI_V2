const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../db/smai.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    plan TEXT DEFAULT 'starter',
    status TEXT DEFAULT 'active',
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    org_id TEXT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    permissions TEXT DEFAULT '[]',
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS flows (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    nodes TEXT DEFAULT '[]',
    edges TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ivr_menus (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    options TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    voice TEXT DEFAULT 'alloy',
    language TEXT DEFAULT 'hinglish',
    provider TEXT DEFAULT 'groq',
    api_key_encrypted TEXT,
    api_key_last4 TEXT,
    key_status TEXT DEFAULT 'missing',
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS dispositions (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6366f1',
    sub_dispositions TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    agent_id TEXT,
    flow_id TEXT,
    ivr_id TEXT,
    trunk_id TEXT,
    mode TEXT DEFAULT 'preview',
    cps INTEGER DEFAULT 1,
    status TEXT DEFAULT 'draft',
    leads TEXT DEFAULT '[]',
    queue TEXT DEFAULT '[]',
    recycle_list TEXT DEFAULT '[]',
    dnd_list TEXT DEFAULT '[]',
    schedule_start TEXT,
    schedule_end TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS calls (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    campaign_id TEXT,
    agent_id TEXT,
    lead_id TEXT,
    did_id TEXT,
    trunk_id TEXT,
    direction TEXT DEFAULT 'outbound',
    phone TEXT,
    duration INTEGER DEFAULT 0,
    outcome TEXT,
    disposition_id TEXT,
    sub_disposition TEXT,
    transcript TEXT,
    recording_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS dnd_numbers (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS trunks (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    server_type TEXT DEFAULT 'freeswitch',
    sip_host TEXT NOT NULL,
    sip_port INTEGER DEFAULT 5060,
    sip_user TEXT,
    sip_pass TEXT,
    transport TEXT DEFAULT 'udp',
    register INTEGER DEFAULT 1,
    status TEXT DEFAULT 'inactive',
    max_channels INTEGER DEFAULT 10,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS did_numbers (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    trunk_id TEXT,
    number TEXT NOT NULL,
    label TEXT,
    type TEXT DEFAULT 'both',
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS routes (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    trunk_id TEXT,
    did_id TEXT,
    direction TEXT DEFAULT 'inbound',
    destination_type TEXT DEFAULT 'ivr',
    destination_id TEXT,
    priority INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    org_id TEXT,
    actor_user_id TEXT NOT NULL,
    actor_role TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS recording_meta (
    call_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    notes TEXT DEFAULT '',
    category TEXT DEFAULT 'general',
    retention_days INTEGER DEFAULT 90,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ====== QUALITY AUDIT — call scoring, compliance review, remarks ======
  CREATE TABLE IF NOT EXISTS quality_audits (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    call_id TEXT NOT NULL,
    reviewer_id TEXT,
    transcript TEXT DEFAULT '',
    score INTEGER DEFAULT 0,
    quality_points TEXT DEFAULT '[]',
    compliance_points TEXT DEFAULT '[]',
    remarks TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    ai_generated INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Customizable scoring checklist per organization
  CREATE TABLE IF NOT EXISTS quality_criteria (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    category TEXT DEFAULT 'quality',
    label TEXT NOT NULL,
    weight INTEGER DEFAULT 10,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = db;

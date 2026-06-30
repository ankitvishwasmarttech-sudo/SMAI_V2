const express = require('express');
const db = require('../db/schema');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/auth');
const router = express.Router();

function withMeta(call) {
  const meta = db.prepare('SELECT * FROM recording_meta WHERE call_id=?').get(call.id);
  return {
    ...call,
    tags: meta ? JSON.parse(meta.tags || '[]') : [],
    notes: meta ? meta.notes : '',
    category: meta ? meta.category : 'general',
    retention_days: meta ? meta.retention_days : 90,
  };
}

// Search recordings — by phone, campaign, lead, agent, category, tag, or date range
router.get('/', auth, requirePermission('recordings', 'view'), (req, res) => {
  const { phone, campaign_id, lead_id, agent_id, category, tag, from, to } = req.query;
  let q = "SELECT * FROM calls WHERE org_id=? AND recording_path IS NOT NULL AND recording_path != ''";
  const params = [req.user.org_id];

  if (phone)       { q += ' AND phone LIKE ?'; params.push(`%${phone}%`); }
  if (campaign_id) { q += ' AND campaign_id = ?'; params.push(campaign_id); }
  if (lead_id)      { q += ' AND lead_id = ?'; params.push(lead_id); }
  if (agent_id)     { q += ' AND agent_id = ?'; params.push(agent_id); }
  if (from)         { q += ' AND created_at >= ?'; params.push(from); }
  if (to)           { q += ' AND created_at <= ?'; params.push(to); }

  q += ' ORDER BY created_at DESC LIMIT 300';
  let rows = db.prepare(q).all(...params).map(withMeta);

  // Filter by category/tag in JS since they live in a separate metadata table
  if (category) rows = rows.filter(r => r.category === category);
  if (tag) rows = rows.filter(r => r.tags.includes(tag));

  res.json(rows);
});

router.get('/:callId', auth, requirePermission('recordings', 'view'), (req, res) => {
  const call = db.prepare('SELECT * FROM calls WHERE id=? AND org_id=?').get(req.params.callId, req.user.org_id);
  if (!call) return res.status(404).json({ error: 'Not found' });
  res.json(withMeta(call));
});

// Update tags / notes / category / retention — requires edit access
router.put('/:callId/meta', auth, requirePermission('recordings', 'edit'), (req, res) => {
  const call = db.prepare('SELECT * FROM calls WHERE id=? AND org_id=?').get(req.params.callId, req.user.org_id);
  if (!call) return res.status(404).json({ error: 'Not found' });

  const { tags, notes, category, retention_days } = req.body;
  db.prepare(`INSERT INTO recording_meta (call_id, org_id, tags, notes, category, retention_days, updated_at)
    VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(call_id) DO UPDATE SET
      tags=excluded.tags, notes=excluded.notes, category=excluded.category,
      retention_days=excluded.retention_days, updated_at=CURRENT_TIMESTAMP`)
    .run(req.params.callId, req.user.org_id, JSON.stringify(tags||[]), notes||'', category||'general', retention_days||90);

  res.json({ success: true });
});

// Generate a one-time share link (signed, short-lived) — placeholder using existing auth for now.
// In production this should be a separate signed token with expiry, not the user's own JWT.
router.get('/:callId/share-url', auth, requirePermission('recordings', 'view'), (req, res) => {
  const call = db.prepare('SELECT * FROM calls WHERE id=? AND org_id=?').get(req.params.callId, req.user.org_id);
  if (!call || !call.recording_path) return res.status(404).json({ error: 'No recording for this call' });
  res.json({ url: call.recording_path, note: 'Share links currently reuse the recording path; implement signed URLs before production rollout.' });
});

// Delete a recording (file stays on disk for now; only removes the DB reference + metadata)
router.delete('/:callId', auth, requirePermission('recordings', 'full'), (req, res) => {
  db.prepare('UPDATE calls SET recording_path=NULL WHERE id=? AND org_id=?').run(req.params.callId, req.user.org_id);
  db.prepare('DELETE FROM recording_meta WHERE call_id=?').run(req.params.callId);
  res.json({ success: true });
});

module.exports = router;

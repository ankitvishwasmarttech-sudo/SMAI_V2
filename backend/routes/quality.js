const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/schema');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/auth');
const { decrypt } = require('../utils/crypto');
const router = express.Router();

function withCall(audit) {
  const call = db.prepare('SELECT phone, duration, outcome, recording_path, created_at FROM calls WHERE id=?').get(audit.call_id);
  return {
    ...audit,
    quality_points: JSON.parse(audit.quality_points || '[]'),
    compliance_points: JSON.parse(audit.compliance_points || '[]'),
    call,
  };
}

// ───────── LIST / VIEW ─────────
router.get('/', auth, requirePermission('quality', 'view'), (req, res) => {
  const { status } = req.query;
  let q = 'SELECT * FROM quality_audits WHERE org_id=?';
  const params = [req.user.org_id];
  if (status) { q += ' AND status=?'; params.push(status); }
  q += ' ORDER BY created_at DESC LIMIT 200';
  res.json(db.prepare(q).all(...params).map(withCall));
});

router.get('/:id', auth, requirePermission('quality', 'view'), (req, res) => {
  const row = db.prepare('SELECT * FROM quality_audits WHERE id=? AND org_id=?').get(req.params.id, req.user.org_id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(withCall(row));
});

// Calls that have a recording but no audit yet — the queue to review
router.get('/queue/pending', auth, requirePermission('quality', 'view'), (req, res) => {
  const rows = db.prepare(`
    SELECT c.* FROM calls c
    WHERE c.org_id = ? AND c.recording_path IS NOT NULL AND c.recording_path != ''
    AND c.id NOT IN (SELECT call_id FROM quality_audits WHERE org_id = ?)
    ORDER BY c.created_at DESC LIMIT 100
  `).all(req.user.org_id, req.user.org_id);
  res.json(rows);
});

// ───────── CREATE / UPDATE ─────────
router.post('/', auth, requirePermission('quality', 'edit'), (req, res) => {
  const { call_id, transcript, score, quality_points, compliance_points, remarks, status } = req.body;
  if (!call_id) return res.status(400).json({ error: 'call_id required' });
  const id = uuidv4();
  db.prepare(`INSERT INTO quality_audits
    (id,org_id,call_id,reviewer_id,transcript,score,quality_points,compliance_points,remarks,status)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.user.org_id, call_id, req.user.id, transcript||'', score||0,
         JSON.stringify(quality_points||[]), JSON.stringify(compliance_points||[]), remarks||'', status||'pending');
  res.json(withCall(db.prepare('SELECT * FROM quality_audits WHERE id=?').get(id)));
});

router.put('/:id', auth, requirePermission('quality', 'edit'), (req, res) => {
  const existing = db.prepare('SELECT * FROM quality_audits WHERE id=? AND org_id=?').get(req.params.id, req.user.org_id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { transcript, score, quality_points, compliance_points, remarks, status } = req.body;
  db.prepare(`UPDATE quality_audits SET transcript=?,score=?,quality_points=?,compliance_points=?,remarks=?,status=?,reviewer_id=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND org_id=?`)
    .run(transcript??existing.transcript, score??existing.score,
         JSON.stringify(quality_points ?? JSON.parse(existing.quality_points||'[]')),
         JSON.stringify(compliance_points ?? JSON.parse(existing.compliance_points||'[]')),
         remarks??existing.remarks, status??existing.status, req.user.id, req.params.id, req.user.org_id);
  res.json(withCall(db.prepare('SELECT * FROM quality_audits WHERE id=?').get(req.params.id)));
});

router.delete('/:id', auth, requirePermission('quality', 'full'), (req, res) => {
  db.prepare('DELETE FROM quality_audits WHERE id=? AND org_id=?').run(req.params.id, req.user.org_id);
  res.json({ success: true });
});

// ───────── CUSTOMIZABLE CRITERIA (checklist templates) ─────────
router.get('/criteria/list', auth, requirePermission('quality', 'view'), (req, res) => {
  res.json(db.prepare('SELECT * FROM quality_criteria WHERE org_id=? ORDER BY category, created_at').all(req.user.org_id));
});

router.post('/criteria', auth, requirePermission('quality', 'full'), (req, res) => {
  const { category, label, weight } = req.body;
  if (!label) return res.status(400).json({ error: 'Label required' });
  const id = uuidv4();
  db.prepare('INSERT INTO quality_criteria (id,org_id,category,label,weight) VALUES (?,?,?,?,?)')
    .run(id, req.user.org_id, category||'quality', label, weight||10);
  res.json({ id, category, label, weight });
});

router.delete('/criteria/:id', auth, requirePermission('quality', 'full'), (req, res) => {
  db.prepare('DELETE FROM quality_criteria WHERE id=? AND org_id=?').run(req.params.id, req.user.org_id);
  res.json({ success: true });
});

// ───────── AI-ASSISTED DRAFT ─────────
// Uses an org agent's stored Groq key (if available) to read the call transcript
// and propose a score + remarks. The reviewer can edit everything before saving —
// this never auto-submits, it only pre-fills the form to save typing time.
router.post('/:callId/ai-draft', auth, requirePermission('quality', 'edit'), async (req, res) => {
  const call = db.prepare('SELECT * FROM calls WHERE id=? AND org_id=?').get(req.params.callId, req.user.org_id);
  if (!call) return res.status(404).json({ error: 'Call not found' });
  if (!call.transcript) return res.json({ error: 'No transcript available for this call yet' });

  // Find any agent in the org with a working Groq key to use as the analysis engine
  const agent = db.prepare("SELECT * FROM agents WHERE org_id=? AND provider='groq' AND key_status='connected' LIMIT 1").get(req.user.org_id);
  if (!agent) return res.json({ error: 'No connected Groq agent found in this organization to run AI analysis. Add one in AI Agents, or fill this in manually.' });

  const key = decrypt(agent.api_key_encrypted);
  const criteria = db.prepare('SELECT * FROM quality_criteria WHERE org_id=?').all(req.user.org_id);
  const criteriaText = criteria.length
    ? criteria.map(c => `- [${c.category}] ${c.label} (weight ${c.weight})`).join('\n')
    : '- Greeting and tone\n- Compliance with script\n- Resolution achieved\n- Call closure quality';

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3-70b-8192',
        messages: [
          { role: 'system', content: 'You are a call quality auditor. Given a call transcript and a scoring checklist, respond ONLY with valid JSON: {"score": 0-100, "quality_points": [{"label":"...","met":true/false}], "compliance_points": [{"label":"...","met":true/false}], "remarks": "2-3 sentence summary"}' },
          { role: 'user', content: `Checklist:\n${criteriaText}\n\nTranscript:\n${call.transcript}` }
        ],
        max_tokens: 500,
        temperature: 0.3,
      })
    });
    const data = await r.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    res.json({ ...parsed, ai_generated: true });
  } catch (e) {
    res.json({ error: 'AI draft failed: ' + e.message + ' — please fill this in manually.' });
  }
});

module.exports = router;

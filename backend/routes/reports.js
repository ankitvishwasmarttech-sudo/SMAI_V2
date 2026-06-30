const express = require('express');
const db = require('../db/schema');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/cdr', auth, (req, res) => {
  const { from, to, campaign_id, agent_id, outcome, phone, did_id, limit } = req.query;
  let q = 'SELECT * FROM calls WHERE org_id=?';
  const params = [req.user.org_id];

  if (from)        { q += ' AND created_at >= ?'; params.push(from); }
  if (to)          { q += ' AND created_at <= ?'; params.push(to); }
  if (campaign_id) { q += ' AND campaign_id = ?'; params.push(campaign_id); }
  if (agent_id)     { q += ' AND agent_id = ?'; params.push(agent_id); }
  if (outcome)      { q += ' AND outcome = ?'; params.push(outcome); }
  if (phone)        { q += ' AND phone LIKE ?'; params.push(`%${phone}%`); }
  if (did_id)       { q += ' AND did_id = ?'; params.push(did_id); }

  q += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit) || 500);

  res.json(db.prepare(q).all(...params));
});

router.get('/by-did', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT
      COALESCE(c.did_id, 'unassigned') as did_id,
      d.number as did_number,
      d.label as did_label,
      COUNT(*) as total_calls,
      SUM(CASE WHEN c.outcome='INTERESTED' THEN 1 ELSE 0 END) as interested,
      SUM(CASE WHEN c.outcome='TRANSFER' THEN 1 ELSE 0 END) as transferred,
      SUM(CASE WHEN c.outcome='NOT_INTERESTED' THEN 1 ELSE 0 END) as not_interested,
      ROUND(AVG(c.duration),1) as avg_duration,
      SUM(c.duration) as total_duration
    FROM calls c
    LEFT JOIN did_numbers d ON c.did_id = d.id
    WHERE c.org_id = ?
    GROUP BY c.did_id
    ORDER BY total_calls DESC
  `).all(req.user.org_id);
  res.json(rows);
});

router.get('/by-disposition', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT
      COALESCE(c.disposition_id,'none') as disposition_id,
      dp.name as disposition_name,
      dp.color as disposition_color,
      c.sub_disposition,
      COUNT(*) as total_calls,
      ROUND(AVG(c.duration),1) as avg_duration
    FROM calls c
    LEFT JOIN dispositions dp ON c.disposition_id = dp.id
    WHERE c.org_id = ?
    GROUP BY c.disposition_id, c.sub_disposition
    ORDER BY total_calls DESC
  `).all(req.user.org_id);
  res.json(rows);
});

router.get('/by-agent', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT
      COALESCE(c.agent_id,'unassigned') as agent_id,
      a.name as agent_name,
      COUNT(*) as total_calls,
      SUM(CASE WHEN c.outcome='INTERESTED' THEN 1 ELSE 0 END) as interested,
      SUM(CASE WHEN c.outcome='TRANSFER' THEN 1 ELSE 0 END) as transferred,
      ROUND(AVG(c.duration),1) as avg_duration,
      SUM(c.duration) as total_talk_time
    FROM calls c
    LEFT JOIN agents a ON c.agent_id = a.id
    WHERE c.org_id = ?
    GROUP BY c.agent_id
    ORDER BY total_calls DESC
  `).all(req.user.org_id);
  res.json(rows);
});

router.get('/by-campaign', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT
      COALESCE(c.campaign_id,'unassigned') as campaign_id,
      cp.name as campaign_name,
      cp.mode as campaign_mode,
      COUNT(*) as total_calls,
      SUM(CASE WHEN c.outcome='INTERESTED' THEN 1 ELSE 0 END) as interested,
      SUM(CASE WHEN c.outcome='TRANSFER' THEN 1 ELSE 0 END) as transferred,
      SUM(CASE WHEN c.outcome='NOT_INTERESTED' THEN 1 ELSE 0 END) as not_interested,
      ROUND(AVG(c.duration),1) as avg_duration
    FROM calls c
    LEFT JOIN campaigns cp ON c.campaign_id = cp.id
    WHERE c.org_id = ?
    GROUP BY c.campaign_id
    ORDER BY total_calls DESC
  `).all(req.user.org_id);
  res.json(rows);
});

router.get('/by-number', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT
      phone,
      COUNT(*) as total_calls,
      SUM(CASE WHEN outcome='INTERESTED' THEN 1 ELSE 0 END) as interested,
      MAX(created_at) as last_call_at,
      SUM(duration) as total_duration
    FROM calls
    WHERE org_id = ? AND phone IS NOT NULL AND phone != ''
    GROUP BY phone
    ORDER BY total_calls DESC
    LIMIT 500
  `).all(req.user.org_id);
  res.json(rows);
});

module.exports = router;

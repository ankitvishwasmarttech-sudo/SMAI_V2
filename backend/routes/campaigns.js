const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/schema');
const auth = require('../middleware/auth');
const multer = require('multer');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM campaigns WHERE user_id=? ORDER BY created_at DESC').all(req.user.id);
  res.json(rows.map(r => ({
    ...r,
    leads: JSON.parse(r.leads||'[]'),
    queue: JSON.parse(r.queue||'[]'),
    recycle_list: JSON.parse(r.recycle_list||'[]'),
    dnd_list: JSON.parse(r.dnd_list||'[]'),
  })));
});

router.get('/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM campaigns WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({
    ...row,
    leads: JSON.parse(row.leads||'[]'),
    queue: JSON.parse(row.queue||'[]'),
    recycle_list: JSON.parse(row.recycle_list||'[]'),
    dnd_list: JSON.parse(row.dnd_list||'[]'),
  });
});

router.post('/', auth, (req, res) => {
  const { name, agent_id, flow_id, ivr_id, trunk_id, mode, cps, schedule_start, schedule_end } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = uuidv4();
  db.prepare(`INSERT INTO campaigns (id,user_id,name,agent_id,flow_id,ivr_id,trunk_id,mode,cps,schedule_start,schedule_end)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id,req.user.id,name,agent_id||null,flow_id||null,ivr_id||null,trunk_id||null,mode||'preview',cps||1,schedule_start||null,schedule_end||null);
  res.json({ id, name, status: 'draft' });
});

router.put('/:id', auth, (req, res) => {
  const c = req.body;
  db.prepare(`UPDATE campaigns SET name=?,agent_id=?,flow_id=?,ivr_id=?,trunk_id=?,mode=?,cps=?,status=?,schedule_start=?,schedule_end=?
    WHERE id=? AND user_id=?`)
    .run(c.name,c.agent_id||null,c.flow_id||null,c.ivr_id||null,c.trunk_id||null,c.mode||'preview',c.cps||1,c.status||'draft',c.schedule_start||null,c.schedule_end||null,req.params.id,req.user.id);
  res.json({ success: true });
});

router.put('/:id/status', auth, (req, res) => {
  db.prepare('UPDATE campaigns SET status=? WHERE id=? AND user_id=?').run(req.body.status,req.params.id,req.user.id);
  res.json({ success: true });
});

router.post('/:id/clone', auth, (req, res) => {
  const src = db.prepare('SELECT * FROM campaigns WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!src) return res.status(404).json({ error: 'Not found' });
  const id = uuidv4();
  db.prepare(`INSERT INTO campaigns (id,user_id,name,agent_id,flow_id,ivr_id,trunk_id,mode,cps,status,schedule_start,schedule_end)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.user.id, src.name + ' (Copy)', src.agent_id, src.flow_id, src.ivr_id, src.trunk_id, src.mode, src.cps, 'draft', src.schedule_start, src.schedule_end);
  res.json({ id, name: src.name + ' (Copy)' });
});

router.post('/:id/leads', auth, upload.single('file'), (req, res) => {
  const camp = db.prepare('SELECT * FROM campaigns WHERE id=? AND user_id=?').get(req.params.id,req.user.id);
  if (!camp) return res.status(404).json({ error: 'Campaign not found' });
  const text = req.file.buffer.toString('utf8');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const leads = lines.map(l => ({ phone: l.split(',')[0].trim(), name: l.split(',')[1]?.trim()||'', status: 'pending' }));
  const existing = JSON.parse(camp.leads||'[]');
  const all = [...existing, ...leads];
  db.prepare('UPDATE campaigns SET leads=?,queue=? WHERE id=?').run(JSON.stringify(all),JSON.stringify(all.filter(l=>l.status==='pending')),req.params.id);
  res.json({ added: leads.length, total: all.length });
});

router.post('/:id/dnd', auth, (req, res) => {
  const { phone } = req.body;
  const camp = db.prepare('SELECT * FROM campaigns WHERE id=? AND user_id=?').get(req.params.id,req.user.id);
  if (!camp) return res.status(404).json({ error: 'Not found' });
  const dnd = JSON.parse(camp.dnd_list||'[]');
  if (!dnd.includes(phone)) dnd.push(phone);
  db.prepare('UPDATE campaigns SET dnd_list=? WHERE id=?').run(JSON.stringify(dnd),req.params.id);
  const id = uuidv4();
  db.prepare('INSERT OR IGNORE INTO dnd_numbers (id,user_id,phone) VALUES (?,?,?)').run(id,req.user.id,phone);
  res.json({ success: true });
});

router.delete('/:id', auth, (req, res) => {
  db.prepare('DELETE FROM campaigns WHERE id=? AND user_id=?').run(req.params.id,req.user.id);
  res.json({ success: true });
});

module.exports = router;

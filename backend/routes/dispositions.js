const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/schema');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM dispositions WHERE user_id=?').all(req.user.id);
  res.json(rows.map(r => ({ ...r, sub_dispositions: JSON.parse(r.sub_dispositions||'[]') })));
});

router.get('/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM dispositions WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ ...row, sub_dispositions: JSON.parse(row.sub_dispositions||'[]') });
});

router.post('/', auth, (req, res) => {
  const { name, color, sub_dispositions } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO dispositions (id,user_id,name,color,sub_dispositions) VALUES (?,?,?,?,?)').run(id,req.user.id,name,color||'#6366f1',JSON.stringify(sub_dispositions||[]));
  res.json({ id, name, color, sub_dispositions: sub_dispositions||[] });
});

router.put('/:id', auth, (req, res) => {
  const { name, color, sub_dispositions } = req.body;
  db.prepare('UPDATE dispositions SET name=?,color=?,sub_dispositions=? WHERE id=? AND user_id=?')
    .run(name, color, JSON.stringify(sub_dispositions||[]), req.params.id, req.user.id);
  res.json({ success: true });
});

router.post('/:id/clone', auth, (req, res) => {
  const src = db.prepare('SELECT * FROM dispositions WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!src) return res.status(404).json({ error: 'Not found' });
  const id = uuidv4();
  db.prepare('INSERT INTO dispositions (id,user_id,name,color,sub_dispositions) VALUES (?,?,?,?,?)')
    .run(id, req.user.id, src.name + ' (Copy)', src.color, src.sub_dispositions);
  res.json({ id, name: src.name + ' (Copy)' });
});

router.delete('/:id', auth, (req, res) => {
  db.prepare('DELETE FROM dispositions WHERE id=? AND user_id=?').run(req.params.id,req.user.id);
  res.json({ success: true });
});

module.exports = router;

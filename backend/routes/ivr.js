const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/schema');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM ivr_menus WHERE user_id=?').all(req.user.id);
  res.json(rows.map(r => ({ ...r, options: JSON.parse(r.options||'[]') })));
});

router.get('/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM ivr_menus WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ ...row, options: JSON.parse(row.options||'[]') });
});

router.post('/', auth, (req, res) => {
  const { name, options } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO ivr_menus (id,user_id,name,options) VALUES (?,?,?,?)').run(id,req.user.id,name,JSON.stringify(options||[]));
  res.json({ id, name, options: options||[] });
});

router.put('/:id', auth, (req, res) => {
  const { name, options } = req.body;
  db.prepare('UPDATE ivr_menus SET name=?,options=? WHERE id=? AND user_id=?').run(name,JSON.stringify(options||[]),req.params.id,req.user.id);
  res.json({ success: true });
});

router.post('/:id/clone', auth, (req, res) => {
  const src = db.prepare('SELECT * FROM ivr_menus WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!src) return res.status(404).json({ error: 'Not found' });
  const id = uuidv4();
  db.prepare('INSERT INTO ivr_menus (id,user_id,name,options) VALUES (?,?,?,?)')
    .run(id, req.user.id, src.name + ' (Copy)', src.options);
  res.json({ id, name: src.name + ' (Copy)' });
});

router.delete('/:id', auth, (req, res) => {
  db.prepare('DELETE FROM ivr_menus WHERE id=? AND user_id=?').run(req.params.id,req.user.id);
  res.json({ success: true });
});

module.exports = router;

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/schema');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/', auth, (req, res) => res.json(db.prepare('SELECT * FROM flows WHERE org_id=? ORDER BY created_at DESC').all(req.user.org_id)));

router.get('/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM flows WHERE id=? AND org_id=?').get(req.params.id, req.user.org_id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ ...row, nodes: JSON.parse(row.nodes||'[]'), edges: JSON.parse(row.edges||'[]') });
});

router.post('/', auth, (req, res) => {
  const { name, nodes, edges } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO flows (id,org_id,user_id,name,nodes,edges) VALUES (?,?,?,?,?,?)')
    .run(id, req.user.org_id, req.user.id, name, JSON.stringify(nodes||[]), JSON.stringify(edges||[]));
  res.json({ id, name, nodes: nodes||[], edges: edges||[] });
});

router.put('/:id', auth, (req, res) => {
  const { name, nodes, edges } = req.body;
  db.prepare('UPDATE flows SET name=?,nodes=?,edges=? WHERE id=? AND org_id=?')
    .run(name, JSON.stringify(nodes||[]), JSON.stringify(edges||[]), req.params.id, req.user.org_id);
  res.json({ success: true });
});

router.post('/:id/clone', auth, (req, res) => {
  const src = db.prepare('SELECT * FROM flows WHERE id=? AND org_id=?').get(req.params.id, req.user.org_id);
  if (!src) return res.status(404).json({ error: 'Not found' });
  const id = uuidv4();
  db.prepare('INSERT INTO flows (id,org_id,user_id,name,nodes,edges) VALUES (?,?,?,?,?,?)')
    .run(id, req.user.org_id, req.user.id, src.name + ' (Copy)', src.nodes, src.edges);
  res.json({ id, name: src.name + ' (Copy)' });
});

router.delete('/:id', auth, (req, res) => {
  db.prepare('DELETE FROM flows WHERE id=? AND org_id=?').run(req.params.id, req.user.org_id);
  res.json({ success: true });
});

module.exports = router;

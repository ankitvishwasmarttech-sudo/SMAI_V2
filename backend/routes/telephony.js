const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/schema');
const auth = require('../middleware/auth');
const multer = require('multer');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/trunks', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM trunks WHERE org_id=? ORDER BY created_at DESC').all(req.user.org_id);
  res.json(rows.map(r => ({ ...r, sip_pass: r.sip_pass ? '••••••••' : '' })));
});

router.post('/trunks', auth, (req, res) => {
  const { name, server_type, sip_host, sip_port, sip_user, sip_pass, transport, register, max_channels } = req.body;
  if (!name || !sip_host) return res.status(400).json({ error: 'Name and SIP host required' });
  const id = uuidv4();
  db.prepare(`INSERT INTO trunks
    (id,org_id,user_id,name,server_type,sip_host,sip_port,sip_user,sip_pass,transport,register,max_channels,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.user.org_id, req.user.id, name, server_type||'freeswitch', sip_host, sip_port||5060, sip_user||'', sip_pass||'', transport||'udp', register?1:0, max_channels||10, 'active');
  res.json({ id, name, server_type, sip_host, status: 'active' });
});

router.put('/trunks/:id', auth, (req, res) => {
  const t = req.body;
  db.prepare(`UPDATE trunks SET name=?,server_type=?,sip_host=?,sip_port=?,sip_user=?,
    sip_pass=COALESCE(?,sip_pass),transport=?,register=?,max_channels=?,status=?
    WHERE id=? AND org_id=?`)
    .run(t.name,t.server_type,t.sip_host,t.sip_port,t.sip_user,
         t.sip_pass==='••••••••'?null:t.sip_pass,t.transport,t.register?1:0,t.max_channels,t.status,
         req.params.id, req.user.org_id);
  res.json({ success: true });
});

router.delete('/trunks/:id', auth, (req, res) => {
  db.prepare('DELETE FROM trunks WHERE id=? AND org_id=?').run(req.params.id, req.user.org_id);
  db.prepare('DELETE FROM routes WHERE trunk_id=? AND org_id=?').run(req.params.id, req.user.org_id);
  res.json({ success: true });
});

router.get('/numbers', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM did_numbers WHERE org_id=? ORDER BY created_at DESC').all(req.user.org_id));
});

router.post('/numbers', auth, (req, res) => {
  const { trunk_id, number, label, type } = req.body;
  if (!number) return res.status(400).json({ error: 'Number required' });
  const id = uuidv4();
  db.prepare('INSERT INTO did_numbers (id,org_id,user_id,trunk_id,number,label,type) VALUES (?,?,?,?,?,?,?)')
    .run(id, req.user.org_id, req.user.id, trunk_id||null, number, label||'', type||'both');
  res.json({ id, number, label, type });
});

router.post('/numbers/bulk', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File required' });
  const { trunk_id, type } = req.body;
  const text = req.file.buffer.toString('utf8');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const insert = db.prepare('INSERT INTO did_numbers (id,org_id,user_id,trunk_id,number,label,type) VALUES (?,?,?,?,?,?,?)');
  let count = 0;
  const tx = db.transaction(() => {
    for (const line of lines) {
      const [number, label] = line.split(',').map(s => s.trim());
      if (number) {
        insert.run(uuidv4(), req.user.org_id, req.user.id, trunk_id||null, number, label||'', type||'both');
        count++;
      }
    }
  });
  tx();
  res.json({ added: count });
});

router.delete('/numbers/:id', auth, (req, res) => {
  db.prepare('DELETE FROM did_numbers WHERE id=? AND org_id=?').run(req.params.id, req.user.org_id);
  res.json({ success: true });
});

router.get('/routes', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM routes WHERE org_id=? ORDER BY priority ASC').all(req.user.org_id));
});

router.post('/routes', auth, (req, res) => {
  const { trunk_id, did_id, direction, destination_type, destination_id, priority } = req.body;
  if (!trunk_id) return res.status(400).json({ error: 'Trunk required' });
  const id = uuidv4();
  db.prepare(`INSERT INTO routes (id,org_id,user_id,trunk_id,did_id,direction,destination_type,destination_id,priority)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, req.user.org_id, req.user.id, trunk_id, did_id||null, direction||'inbound', destination_type||'ivr', destination_id||null, priority||1);
  res.json({ id, direction, destination_type });
});

router.delete('/routes/:id', auth, (req, res) => {
  db.prepare('DELETE FROM routes WHERE id=? AND org_id=?').run(req.params.id, req.user.org_id);
  res.json({ success: true });
});

module.exports = router;

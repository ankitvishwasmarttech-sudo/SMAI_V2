const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const db = require('../db/schema');
const auth = require('../middleware/auth');
const multer = require('multer');
const router = express.Router();

// Recordings stored under /recordings/<user_id>/<call_id>.wav
const RECORDINGS_DIR = path.join(__dirname, '../../recordings');
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(RECORDINGS_DIR, req.user?.id || 'system');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`)
});
const upload = multer({ storage });

router.get('/', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM calls WHERE user_id=? ORDER BY created_at DESC LIMIT 200').all(req.user.id));
});

router.get('/stats', auth, (req, res) => {
  res.json(db.prepare(`SELECT
    COUNT(*) as total,
    SUM(CASE WHEN outcome='INTERESTED' THEN 1 ELSE 0 END) as interested,
    SUM(CASE WHEN outcome='TRANSFER' THEN 1 ELSE 0 END) as transferred,
    SUM(CASE WHEN outcome='NOT_INTERESTED' THEN 1 ELSE 0 END) as not_interested,
    AVG(duration) as avg_duration
    FROM calls WHERE user_id=?`).get(req.user.id));
});

// Webhook from AI bridge — log call outcome (extended fields)
router.post('/webhook', (req, res) => {
  const {
    uuid, outcome, user_id, campaign_id, agent_id, lead_id,
    did_id, trunk_id, direction, duration, transcript, phone,
    disposition_id, sub_disposition, recording_path
  } = req.body;

  db.prepare(`INSERT OR REPLACE INTO calls
    (id,user_id,campaign_id,agent_id,lead_id,did_id,trunk_id,direction,phone,duration,outcome,disposition_id,sub_disposition,transcript,recording_path)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(uuid||uuidv4(), user_id||'system', campaign_id||null, agent_id||null, lead_id||null,
         did_id||null, trunk_id||null, direction||'outbound', phone||'', duration||0, outcome,
         disposition_id||null, sub_disposition||null, transcript||'', recording_path||null);

  res.json({ success: true });
});

// Manual disposition update (agent reviews after call)
router.put('/:id/disposition', auth, (req, res) => {
  const { disposition_id, sub_disposition } = req.body;
  db.prepare('UPDATE calls SET disposition_id=?, sub_disposition=? WHERE id=? AND user_id=?')
    .run(disposition_id, sub_disposition, req.params.id, req.user.id);
  res.json({ success: true });
});

// Upload a recording file for a call
router.post('/:id/recording', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File required' });
  const relPath = `/recordings/${req.user.id}/${req.file.filename}`;
  db.prepare('UPDATE calls SET recording_path=? WHERE id=? AND user_id=?').run(relPath, req.params.id, req.user.id);
  res.json({ recording_path: relPath });
});

// Stream/download a recording
router.get('/recording/:userId/:filename', auth, (req, res) => {
  if (req.params.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  const filePath = path.join(RECORDINGS_DIR, req.params.userId, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.sendFile(filePath);
});

module.exports = router;

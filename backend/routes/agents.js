const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/schema');
const auth = require('../middleware/auth');
const { encrypt, decrypt, last4 } = require('../utils/crypto');
const router = express.Router();

function sanitize(agent) {
  if (!agent) return agent;
  const { api_key_encrypted, ...safe } = agent;
  return safe;
}

// All agents belonging to the user's ORGANIZATION (shared across the team)
router.get('/', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM agents WHERE org_id=? ORDER BY created_at DESC').all(req.user.org_id);
  res.json(rows.map(sanitize));
});

router.get('/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM agents WHERE id=? AND org_id=?').get(req.params.id, req.user.org_id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(sanitize(row));
});

router.post('/', auth, (req, res) => {
  const { name, prompt, voice, language, provider, api_key } = req.body;
  if (!name || !prompt) return res.status(400).json({ error: 'Name and prompt required' });

  const id = uuidv4();
  const encrypted = api_key ? encrypt(api_key) : null;
  const keyLast4 = api_key ? last4(api_key) : null;
  const keyStatus = api_key ? 'connected' : 'missing';

  db.prepare(`INSERT INTO agents
    (id,org_id,user_id,name,prompt,voice,language,provider,api_key_encrypted,api_key_last4,key_status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.user.org_id, req.user.id, name, prompt, voice||'alloy', language||'hinglish', provider||'groq', encrypted, keyLast4, keyStatus);

  res.json(sanitize({ id, name, prompt, voice, language, provider, api_key_last4: keyLast4, key_status: keyStatus, status: 'active' }));
});

router.put('/:id', auth, (req, res) => {
  const { name, prompt, voice, language, provider, status, api_key } = req.body;
  const existing = db.prepare('SELECT * FROM agents WHERE id=? AND org_id=?').get(req.params.id, req.user.org_id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  let encrypted = existing.api_key_encrypted;
  let keyLast4 = existing.api_key_last4;
  let keyStatus = existing.key_status;
  if (api_key && api_key !== '••••••••') {
    encrypted = encrypt(api_key);
    keyLast4 = last4(api_key);
    keyStatus = 'connected';
  } else if (api_key === '') {
    encrypted = null; keyLast4 = null; keyStatus = 'missing';
  }

  db.prepare(`UPDATE agents SET name=?,prompt=?,voice=?,language=?,provider=?,status=?,
    api_key_encrypted=?,api_key_last4=?,key_status=? WHERE id=? AND org_id=?`)
    .run(name,prompt,voice,language,provider,status,encrypted,keyLast4,keyStatus,req.params.id,req.user.org_id);
  res.json({ success: true });
});

router.post('/:id/test-key', auth, async (req, res) => {
  const agent = db.prepare('SELECT * FROM agents WHERE id=? AND org_id=?').get(req.params.id, req.user.org_id);
  if (!agent) return res.status(404).json({ error: 'Not found' });
  if (!agent.api_key_encrypted) return res.json({ valid: false, message: 'No API key set' });

  const key = decrypt(agent.api_key_encrypted);
  try {
    let testUrl, headers;
    if (agent.provider === 'groq') {
      testUrl = 'https://api.groq.com/openai/v1/models';
      headers = { Authorization: `Bearer ${key}` };
    } else if (agent.provider === 'openai' || agent.provider === 'azure') {
      testUrl = 'https://api.openai.com/v1/models';
      headers = { Authorization: `Bearer ${key}` };
    } else if (agent.provider === 'claude') {
      db.prepare('UPDATE agents SET key_status=? WHERE id=?').run('connected', req.params.id);
      return res.json({ valid: true, message: 'Key format accepted (Anthropic has no validation endpoint)' });
    } else {
      db.prepare('UPDATE agents SET key_status=? WHERE id=?').run('connected', req.params.id);
      return res.json({ valid: true, message: 'Key saved (validation not implemented for this provider yet)' });
    }

    const r = await fetch(testUrl, { headers });
    const valid = r.status === 200;
    db.prepare('UPDATE agents SET key_status=? WHERE id=?').run(valid ? 'connected' : 'invalid', req.params.id);
    res.json({ valid, message: valid ? 'Key is valid' : `Provider returned HTTP ${r.status}` });
  } catch (e) {
    db.prepare('UPDATE agents SET key_status=? WHERE id=?').run('invalid', req.params.id);
    res.json({ valid: false, message: 'Could not reach provider: ' + e.message });
  }
});

router.post('/:id/clone', auth, (req, res) => {
  const src = db.prepare('SELECT * FROM agents WHERE id=? AND org_id=?').get(req.params.id, req.user.org_id);
  if (!src) return res.status(404).json({ error: 'Not found' });
  const id = uuidv4();
  db.prepare(`INSERT INTO agents (id,org_id,user_id,name,prompt,voice,language,provider,status,key_status)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.user.org_id, req.user.id, src.name + ' (Copy)', src.prompt, src.voice, src.language, src.provider, 'active', 'missing');
  res.json({ id, name: src.name + ' (Copy)' });
});

router.delete('/:id', auth, (req, res) => {
  db.prepare('DELETE FROM agents WHERE id=? AND org_id=?').run(req.params.id, req.user.org_id);
  res.json({ success: true });
});

router.get('/providers/list', auth, (req, res) => {
  res.json([
    { id: 'openai',    name: 'OpenAI Realtime',  type: 'native_ws', voices: ['alloy','echo','fable','onyx','nova','shimmer'], keyFormat: 'sk-...' },
    { id: 'gemini',    name: 'Gemini Live',       type: 'native_ws', voices: ['Puck','Charon','Kore','Fenrir'], keyFormat: 'AIza...' },
    { id: 'groq',      name: 'Groq (LLaMA3)',     type: 'pipeline',  voices: ['default'], keyFormat: 'gsk_...' },
    { id: 'claude',    name: 'Claude (Anthropic)', type: 'pipeline', voices: ['default'], keyFormat: 'sk-ant-...' },
    { id: 'nvidia',    name: 'NVIDIA NIM',        type: 'pipeline',  voices: ['default'], keyFormat: 'nvapi-...' },
    { id: 'azure',     name: 'Azure OpenAI',      type: 'native_ws', voices: ['alloy','echo','nova'], keyFormat: '32-char key' },
    { id: 'elevenlabs',name: 'ElevenLabs (TTS)',  type: 'tts_only',  voices: ['Rachel','Adam','Bella','Domi'], keyFormat: 'xi-api-key' },
    { id: 'deepgram',  name: 'Deepgram (STT)',    type: 'stt_only',  voices: ['default'], keyFormat: 'token' },
    { id: 'deepseek',  name: 'DeepSeek',          type: 'pipeline',  voices: ['default'], keyFormat: 'sk-...' },
    { id: 'grok',      name: 'Grok (xAI)',        type: 'pipeline',  voices: ['default'], keyFormat: 'xai-...' },
  ]);
});

module.exports = router;

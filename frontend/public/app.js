// ============================================================
// SMAI — Complete Frontend Application
// ============================================================

let token = localStorage.getItem('smai_token');
let user  = JSON.parse(localStorage.getItem('smai_user') || '{}');
let isLogin = true;

let agentsCache = [], flowsCache = [], ivrCache = [], dispoCache = [];
let campaignsCache = [], trunksCache = [], numbersCache = [];
let ivrOptions = [], selectedMode = 'preview', cmDndList = [];
let editingAgentId = null, editingFlowId = null, editingIvrId = null;
let editingDispoId = null, editingCampaignId = null, editingTrunkId = null;
let providersCache = [], permissionCatalog = null, currentGridPerms = {};
let fbInstance = null;
let currentReport = 'cdr';

if (token) { showApp(); loadEverything(); }

// ── AUTH ──────────────────────────────────────────────────────────────────
function toggleAuth() {
  isLogin = !isLogin;
  document.getElementById('auth-box-label').textContent = isLogin ? '— Sign In' : '— Get Started';
  document.getElementById('auth-title').textContent = isLogin ? 'Welcome back' : 'Create your account';
  document.getElementById('auth-switch-text').textContent = isLogin ? "No account yet?" : 'Already registered?';
  document.getElementById('auth-switch-link').textContent = isLogin ? 'Create one' : 'Sign in';
  document.getElementById('auth-submit-btn').textContent = isLogin ? 'Sign In' : 'Create Account';
  document.getElementById('name-field').classList.toggle('hidden', isLogin);
  document.getElementById('company-field').classList.toggle('hidden', isLogin);
  document.getElementById('auth-error').textContent = '';
}

async function handleAuth() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const name = document.getElementById('auth-name').value.trim();
  const company = document.getElementById('auth-company').value.trim();
  const errEl = document.getElementById('auth-error');
  errEl.textContent = '';

  if (!email || !password) { errEl.textContent = 'Email and password required'; return; }
  if (!isLogin && !name) { errEl.textContent = 'Name is required'; return; }

  const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
  const body = isLogin ? { email, password } : { name, email, password, company };

  try {
    const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (d.error) { errEl.textContent = d.error; return; }
    token = d.token; user = d.user;
    localStorage.setItem('smai_token', token);
    localStorage.setItem('smai_user', JSON.stringify(user));
    showApp();
    loadEverything();
  } catch (e) {
    errEl.textContent = 'Connection error — check server';
  }
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  document.getElementById('user-name').textContent = user.name || 'User';
  document.getElementById('user-email').textContent = user.email || '';
  document.getElementById('user-avatar').textContent = (user.name || 'U')[0].toUpperCase();
  applyRoleVisibility();
}

function applyRoleVisibility() {
  const role = user.role;
  const navTeam = document.getElementById('nav-team');
  const navOrgs = document.getElementById('nav-orgs');
  const navAdminLabel = document.getElementById('nav-admin-label');
  navTeam.style.display = (role === 'admin' || role === 'manager') ? 'flex' : 'none';
  navOrgs.style.display = (role === 'super_admin') ? 'flex' : 'none';
  navAdminLabel.style.display = (role === 'admin' || role === 'manager' || role === 'super_admin') ? 'block' : 'none';
}

function logout() {
  localStorage.clear();
  token = null; user = {};
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
}

async function api(path, method = 'GET', body = null, isForm = false) {
  const headers = { 'Authorization': 'Bearer ' + token };
  if (!isForm) headers['Content-Type'] = 'application/json';
  const opts = { method, headers };
  if (body) opts.body = isForm ? body : JSON.stringify(body);
  const r = await fetch(path, opts);
  return r.json();
}

// ── NAVIGATION ────────────────────────────────────────────────────────────
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');
  const titles = { dashboard:'Dashboard', agents:'AI Agents', flows:'Flow Builder', ivr:'IVR Menus', dispositions:'Dispositions', telephony:'Trunks & Numbers', campaigns:'Campaigns', calls:'Call Logs', reports:'Reports', recordings:'Recordings', dnd:'DND List', team:'Team', organizations:'Organizations' };
  document.getElementById('topbar-title').textContent = titles[page];
  document.getElementById('topbar-crumb-page').textContent = titles[page];

  if (page === 'dashboard') loadDashboard();
  if (page === 'agents') loadAgents();
  if (page === 'flows') loadFlows();
  if (page === 'ivr') loadIvrList();
  if (page === 'dispositions') loadDispositions();
  if (page === 'campaigns') loadCampaigns();
  if (page === 'calls') loadCalls();
  if (page === 'telephony') loadTelephony();
  if (page === 'team') loadTeam();
  if (page === 'organizations') loadOrganizations();
  if (page === 'recordings') loadRecordings();
  if (page === 'quality') loadQualityPage();
}

async function loadEverything() {
  await Promise.all([loadAgents(), loadFlows(), loadIvrList(), loadDispositions(), loadTrunks()]);
  loadDashboard();
  loadCampaigns();
  loadCalls();
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────
async function loadDashboard() {
  const stats = await api('/api/calls/stats');
  document.getElementById('s-total').textContent = stats.total || 0;
  document.getElementById('s-interested').textContent = stats.interested || 0;
  document.getElementById('s-transferred').textContent = stats.transferred || 0;
  document.getElementById('s-duration').textContent = Math.round(stats.avg_duration || 0) + 's';

  const active = campaignsCache.filter(c => c.status === 'active');
  const el = document.getElementById('dash-campaigns-mini');
  if (!active.length) {
    el.innerHTML = '<div class="empty"><div class="ico">&#128226;</div><div class="ttl">No campaigns running</div></div>';
  } else {
    el.innerHTML = active.map(c => `
      <div class="queue-mini">
        <div class="qm-item"><div class="qm-val">${c.name}</div><div class="qm-lbl">Campaign</div></div>
        <div class="qm-item"><div class="qm-val">${(c.queue||[]).length}</div><div class="qm-lbl">In Queue</div></div>
        <div class="qm-item"><div class="qm-val">${c.cps}</div><div class="qm-lbl">CPS</div></div>
        <div class="qm-item"><div class="qm-val">${c.mode}</div><div class="qm-lbl">Mode</div></div>
      </div>
    `).join('');
  }
}

// ── AGENTS (with BYOAI) ─────────────────────────────────────────────────
const PROVIDER_VOICES = {
  openai: ['alloy','echo','fable','onyx','nova','shimmer'],
  gemini: ['Puck','Charon','Kore','Fenrir'],
  groq: ['default (Groq pipeline — no native TTS voice)'],
  claude: ['default (Claude pipeline — pair with a TTS provider)'],
  nvidia: ['default'],
  azure: ['alloy','echo','nova'],
  elevenlabs: ['Rachel','Adam','Bella','Domi','Antoni','Elli'],
  deepgram: ['default (STT only)'],
  deepseek: ['default (pipeline)'],
  grok: ['default (pipeline)'],
};

async function loadAgents() {
  agentsCache = await api('/api/agents');
  const grid = document.getElementById('agents-grid');
  if (!agentsCache.length) {
    grid.innerHTML = '<div class="empty"><div class="ico">&#9678;</div><div class="ttl">No agents yet</div><div class="sub">Create your first AI agent to get started</div></div>';
    return;
  }
  grid.innerHTML = agentsCache.map(a => `
    <div class="entity-card">
      <div class="entity-card-top">
        <div class="entity-icon">&#9678;</div>
        <span class="badge ${a.status==='active'?'badge-green':'badge-gray'}">${a.status}</span>
      </div>
      <div class="entity-name">${a.name}</div>
      <div class="entity-meta">${a.provider} &middot; ${a.voice} &middot; ${a.language}</div>
      <div class="entity-meta"><span class="badge ${a.key_status==='connected'?'key-status-connected':a.key_status==='invalid'?'key-status-invalid':'key-status-missing'}">API key: ${a.key_status||'missing'}</span></div>
      <div class="entity-actions">
        <button class="btn-ghost btn-sm" onclick="openAgentModal('${a.id}')">Edit</button>
        <button class="btn-ghost btn-sm" onclick="cloneAgent('${a.id}')">Clone</button>
        <button class="btn-ghost btn-sm" onclick="deleteAgent('${a.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

async function loadProviders() {
  if (providersCache.length) return providersCache;
  providersCache = await api('/api/agents/providers/list');
  return providersCache;
}

async function openAgentModal(agentId) {
  editingAgentId = agentId || null;
  const agent = agentId ? agentsCache.find(a => a.id === agentId) : null;

  document.getElementById('ag-name').value = agent ? agent.name : '';
  document.getElementById('ag-prompt').value = agent ? agent.prompt : '';
  document.getElementById('ag-language').value = agent ? agent.language : 'hinglish';
  document.getElementById('ag-provider').value = agent ? agent.provider : 'groq';

  const keyInput = document.getElementById('ag-api-key');
  const statusBadge = document.getElementById('ag-key-status');
  document.getElementById('ag-test-result').textContent = '';

  if (agent && agent.key_status === 'connected') {
    keyInput.value = '••••••••';
    keyInput.placeholder = `Key on file (****${agent.api_key_last4 || ''})`;
    statusBadge.textContent = 'connected'; statusBadge.className = 'badge key-status-connected';
  } else if (agent && agent.key_status === 'invalid') {
    keyInput.value = ''; keyInput.placeholder = 'Previous key failed — paste a new one';
    statusBadge.textContent = 'invalid'; statusBadge.className = 'badge key-status-invalid';
  } else {
    keyInput.value = ''; keyInput.placeholder = 'Paste your provider API key';
    statusBadge.textContent = 'missing'; statusBadge.className = 'badge key-status-missing';
  }

  document.querySelector('#agent-modal .modal-head h3').textContent = agent ? 'Edit AI Agent' : 'Create AI Agent';
  document.querySelector('#agent-modal .modal-foot .btn:not(.btn-outline)').textContent = agent ? 'Save Changes' : 'Create Agent';

  await loadProviders();
  renderProviderGrid(providersCache, agent ? agent.provider : 'groq');
  updateVoiceList(agent ? agent.provider : 'groq', agent ? agent.voice : null);
  updateKeyHint(providersCache, agent ? agent.provider : 'groq');
  document.getElementById('agent-modal').classList.remove('hidden');
}

function updateKeyHint(list, providerId) {
  const p = list.find(x => x.id === providerId);
  document.getElementById('ag-key-hint').textContent = `Your key is encrypted and stored only for this agent. Expected format: ${p ? p.keyFormat : '...'}`;
}

function updateVoiceList(providerId, selectedVoice) {
  const sel = document.getElementById('ag-voice');
  const voices = PROVIDER_VOICES[providerId] || ['default'];
  sel.innerHTML = voices.map(v => `<option value="${v}" ${v===selectedVoice?'selected':''}>${v}</option>`).join('');
}

const PROVIDER_TYPE_NOTES = {
  native_ws: 'Handles speech-to-text, conversation, and voice generation all in one — nothing else needed.',
  pipeline:  'Conversation only (text). You also need a separate Speech-to-Text and Text-to-Speech provider to handle a phone call.',
  tts_only:  'Converts text to voice only. Pair this with a "pipeline" provider above for the conversation.',
  stt_only:  'Converts voice to text only. Pair this with a "pipeline" provider above for the conversation.',
};

function renderProviderGrid(list, selected) {
  const sel = document.getElementById('ag-provider');
  sel.innerHTML = list.map(p => `<option value="${p.id}" ${p.id===selected?'selected':''}>${p.name} — ${p.type.replace('_',' ')}</option>`).join('');
  updateProviderTypeNote(list, selected);
}

function updateProviderTypeNote(list, pid) {
  const p = list.find(x => x.id === pid);
  const note = document.getElementById('ag-provider-type-note');
  if (p) note.textContent = PROVIDER_TYPE_NOTES[p.type] || '';
}

function selectProvider(pid) {
  document.getElementById('ag-provider').value = pid;
  updateVoiceList(pid, null);
  loadProviders().then(list => { updateKeyHint(list, pid); updateProviderTypeNote(list, pid); });
}

async function testAgentKey() {
  if (!editingAgentId) { document.getElementById('ag-test-result').textContent = 'Save the agent first, then test the key.'; return; }
  const keyVal = document.getElementById('ag-api-key').value;
  const resultEl = document.getElementById('ag-test-result');

  if (keyVal && keyVal !== '••••••••') {
    await api('/api/agents/' + editingAgentId, 'PUT', {
      name: document.getElementById('ag-name').value, prompt: document.getElementById('ag-prompt').value,
      voice: document.getElementById('ag-voice').value, language: document.getElementById('ag-language').value,
      provider: document.getElementById('ag-provider').value, status: 'active', api_key: keyVal
    });
  }
  resultEl.textContent = 'Testing...';
  const res = await api('/api/agents/' + editingAgentId + '/test-key', 'POST');
  resultEl.textContent = (res.valid ? '✓ Verified — ' : '✗ Failed — ') + res.message;
  resultEl.style.color = res.valid ? 'var(--green)' : 'var(--red)';
  resultEl.style.fontWeight = '700';
  const statusBadge = document.getElementById('ag-key-status');
  statusBadge.textContent = res.valid ? 'connected' : 'invalid';
  statusBadge.className = 'badge ' + (res.valid ? 'key-status-connected' : 'key-status-invalid');
  loadAgents();
}

async function createAgent() {
  const name = document.getElementById('ag-name').value.trim();
  const prompt = document.getElementById('ag-prompt').value.trim();
  const voice = document.getElementById('ag-voice').value;
  const language = document.getElementById('ag-language').value;
  const provider = document.getElementById('ag-provider').value;
  const apiKeyVal = document.getElementById('ag-api-key').value;
  if (!name || !prompt) { alert('Name and prompt are required'); return; }

  const payload = { name, prompt, voice, language, provider };
  if (apiKeyVal !== '••••••••') payload.api_key = apiKeyVal;

  const btn = document.querySelector('#agent-modal .modal-foot .btn:not(.btn-outline)');
  const originalLabel = btn.textContent;
  btn.textContent = 'Saving...'; btn.disabled = true;

  let agentId = editingAgentId;
  let res;
  try {
    if (editingAgentId) { payload.status = 'active'; res = await api('/api/agents/' + editingAgentId, 'PUT', payload); }
    else { res = await api('/api/agents', 'POST', payload); agentId = res.id; }
  } catch (e) {
    btn.textContent = originalLabel; btn.disabled = false;
    alert('Could not save agent — check your connection and try again.');
    return;
  }

  if (res && res.error) {
    btn.textContent = originalLabel; btn.disabled = false;
    alert(res.error);
    return;
  }

  // If a real key was supplied, verify it automatically right here — no separate step for the client.
  if (apiKeyVal && apiKeyVal !== '••••••••' && agentId) {
    btn.textContent = 'Verifying key...';
    const testRes = await api('/api/agents/' + agentId + '/test-key', 'POST');
    if (!testRes.valid) {
      btn.textContent = originalLabel; btn.disabled = false;
      alert('Agent saved, but the API key could not be verified:\n\n' + testRes.message + '\n\nYou can fix the key by editing this agent.');
      editingAgentId = null;
      closeModal('agent-modal');
      loadAgents();
      return;
    }
  }

  btn.textContent = originalLabel; btn.disabled = false;
  editingAgentId = null;
  closeModal('agent-modal');
  loadAgents();
}

async function cloneAgent(id) { await api('/api/agents/' + id + '/clone', 'POST'); loadAgents(); }
async function deleteAgent(id) { if (!confirm('Delete this agent?')) return; await api('/api/agents/' + id, 'DELETE'); loadAgents(); }

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ── FLOW BUILDER ──────────────────────────────────────────────────────────
async function loadFlows() {
  flowsCache = await api('/api/flows');
  const grid = document.getElementById('flows-grid');
  if (!flowsCache.length) {
    grid.innerHTML = '<div class="empty"><div class="ico">&#8997;</div><div class="ttl">No flows yet</div><div class="sub">Build a flow to define call logic</div></div>';
    return;
  }
  grid.innerHTML = flowsCache.map(f => {
    const nodeCount = (typeof f.nodes === 'string' ? JSON.parse(f.nodes||'[]') : (f.nodes||[])).length;
    return `
    <div class="entity-card">
      <div class="entity-card-top"><div class="entity-icon">&#8997;</div></div>
      <div class="entity-name">${f.name}</div>
      <div class="entity-meta">${nodeCount} nodes</div>
      <div class="entity-actions">
        <button class="btn-ghost btn-sm" onclick="openFlowModal('${f.id}')">Edit</button>
        <button class="btn-ghost btn-sm" onclick="cloneFlow('${f.id}')">Clone</button>
        <button class="btn-ghost btn-sm" onclick="deleteFlow('${f.id}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function seedDefaultFlow() {
  return [{ id: 'start1', type: 'start', label: 'Start', color: '#15171A', x: 40, y: 40, config: {} }];
}

function openFlowModal(flowId) {
  editingFlowId = flowId || null;
  const flow = flowId ? flowsCache.find(f => f.id === flowId) : null;
  const nodes = flow ? (typeof flow.nodes === 'string' ? JSON.parse(flow.nodes) : flow.nodes) : [];
  const edges = flow ? (typeof flow.edges === 'string' ? JSON.parse(flow.edges) : flow.edges) : [];
  document.getElementById('fl-name').value = flow ? flow.name : '';
  document.querySelector('#flow-modal .modal-head h3').textContent = flow ? 'Edit Flow' : 'Flow Builder';
  document.querySelector('#flow-modal .modal-foot .btn:not(.btn-outline)').textContent = flow ? 'Save Changes' : 'Save Flow';
  document.getElementById('flow-modal').classList.remove('hidden');
  const container = document.getElementById('fb-container');
  fbInstance = FlowBuilder(container, { nodes: nodes.length ? nodes : seedDefaultFlow(), edges, onChange: () => {} });
}

async function cloneFlow(id) { await api('/api/flows/' + id + '/clone', 'POST'); loadFlows(); }

async function createFlow() {
  const name = document.getElementById('fl-name').value.trim();
  if (!name) { alert('Flow name required'); return; }
  if (!fbInstance) { alert('Flow canvas not ready'); return; }
  const { nodes, edges } = fbInstance.getData();
  if (editingFlowId) await api('/api/flows/' + editingFlowId, 'PUT', { name, nodes, edges });
  else await api('/api/flows', 'POST', { name, nodes, edges });
  editingFlowId = null;
  closeModal('flow-modal');
  loadFlows();
}

async function deleteFlow(id) { if (!confirm('Delete this flow?')) return; await api('/api/flows/' + id, 'DELETE'); loadFlows(); }

// ── IVR ───────────────────────────────────────────────────────────────────
async function loadIvrList() {
  ivrCache = await api('/api/ivr');
  const grid = document.getElementById('ivr-grid');
  if (!ivrCache.length) {
    grid.innerHTML = '<div class="empty"><div class="ico">&#9742;</div><div class="ttl">No IVR menus yet</div><div class="sub">Create a menu with keypad options</div></div>';
    return;
  }
  grid.innerHTML = ivrCache.map(i => `
    <div class="entity-card">
      <div class="entity-card-top"><div class="entity-icon">&#9742;</div></div>
      <div class="entity-name">${i.name}</div>
      <div class="entity-meta">${(i.options||[]).length} keypad options</div>
      <div class="entity-actions">
        <button class="btn-ghost btn-sm" onclick="openIvrModal('${i.id}')">Edit</button>
        <button class="btn-ghost btn-sm" onclick="cloneIvr('${i.id}')">Clone</button>
        <button class="btn-ghost btn-sm" onclick="deleteIvr('${i.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function openIvrModal(ivrId) {
  editingIvrId = ivrId || null;
  const ivr = ivrId ? ivrCache.find(i => i.id === ivrId) : null;
  ivrOptions = ivr ? (ivr.options||[]).map(o => ({ ...o, id: o.id || Date.now()+Math.random() })) : [];
  document.getElementById('ivr-name').value = ivr ? ivr.name : '';
  document.querySelector('#ivr-modal .modal-head h3').textContent = ivr ? 'Edit IVR Menu' : 'Create IVR Menu';
  document.querySelector('#ivr-modal .modal-foot .btn:not(.btn-outline)').textContent = ivr ? 'Save Changes' : 'Save Menu';
  renderIvrOptions();
  document.getElementById('ivr-modal').classList.remove('hidden');
}

function addIvrOption() { ivrOptions.push({ id: Date.now(), key: ivrOptions.length+1, action: 'Transfer to Agent' }); renderIvrOptions(); }
function removeIvrOption(id) { ivrOptions = ivrOptions.filter(o => o.id !== id); renderIvrOptions(); }
function renderIvrOptions() {
  document.getElementById('ivr-options-list').innerHTML = ivrOptions.map(o => `
    <div class="field-row" style="align-items:center;margin-bottom:8px">
      <input type="text" value="${o.key}" style="max-width:60px" onchange="updateIvrKey(${o.id}, this.value)" placeholder="Key"/>
      <div class="inline-flex">
        <input type="text" value="${o.action}" onchange="updateIvrAction(${o.id}, this.value)" placeholder="Action description" style="flex:1"/>
        <button class="btn-ghost btn-sm" onclick="removeIvrOption(${o.id})">&times;</button>
      </div>
    </div>
  `).join('');
}
function updateIvrKey(id,val) { const o = ivrOptions.find(x=>x.id===id); if(o) o.key=val; }
function updateIvrAction(id,val) { const o = ivrOptions.find(x=>x.id===id); if(o) o.action=val; }

async function createIvr() {
  const name = document.getElementById('ivr-name').value.trim();
  if (!name) { alert('Menu name required'); return; }
  if (editingIvrId) await api('/api/ivr/' + editingIvrId, 'PUT', { name, options: ivrOptions });
  else await api('/api/ivr', 'POST', { name, options: ivrOptions });
  editingIvrId = null;
  closeModal('ivr-modal');
  loadIvrList();
}
async function cloneIvr(id) { await api('/api/ivr/' + id + '/clone', 'POST'); loadIvrList(); }
async function deleteIvr(id) { if (!confirm('Delete this IVR menu?')) return; await api('/api/ivr/' + id, 'DELETE'); loadIvrList(); }

// ── DISPOSITIONS ──────────────────────────────────────────────────────────
async function loadDispositions() {
  dispoCache = await api('/api/dispositions');
  const tbody = document.getElementById('dispo-table');
  if (!dispoCache.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--ink-soft)">No dispositions configured</td></tr>'; return; }
  tbody.innerHTML = dispoCache.map(d => `
    <tr>
      <td><strong>${d.name}</strong></td>
      <td><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${d.color}"></span></td>
      <td>${(d.sub_dispositions||[]).join(', ') || '—'}</td>
      <td>
        <button class="btn-ghost btn-sm" onclick="openDispoModal('${d.id}')">Edit</button>
        <button class="btn-ghost btn-sm" onclick="cloneDispo('${d.id}')">Clone</button>
        <button class="btn-ghost btn-sm" onclick="deleteDispo('${d.id}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

function openDispoModal(dispoId) {
  editingDispoId = dispoId || null;
  const dispo = dispoId ? dispoCache.find(d => d.id === dispoId) : null;
  document.getElementById('dp-name').value = dispo ? dispo.name : '';
  document.getElementById('dp-color').value = dispo ? dispo.color : '#FF6B00';
  document.getElementById('dp-subs').value = dispo ? (dispo.sub_dispositions||[]).join(', ') : '';
  document.querySelector('#dispo-modal .modal-head h3').textContent = dispo ? 'Edit Disposition' : 'New Disposition';
  document.querySelector('#dispo-modal .modal-foot .btn:not(.btn-outline)').textContent = dispo ? 'Save Changes' : 'Create';
  document.getElementById('dispo-modal').classList.remove('hidden');
}

async function createDispo() {
  const name = document.getElementById('dp-name').value.trim();
  const color = document.getElementById('dp-color').value;
  const subs = document.getElementById('dp-subs').value.split(',').map(s=>s.trim()).filter(Boolean);
  if (!name) { alert('Name required'); return; }
  if (editingDispoId) await api('/api/dispositions/' + editingDispoId, 'PUT', { name, color, sub_dispositions: subs });
  else await api('/api/dispositions', 'POST', { name, color, sub_dispositions: subs });
  editingDispoId = null;
  closeModal('dispo-modal');
  loadDispositions();
}
async function cloneDispo(id) { await api('/api/dispositions/' + id + '/clone', 'POST'); loadDispositions(); }
async function deleteDispo(id) { if (!confirm('Delete this disposition?')) return; await api('/api/dispositions/' + id, 'DELETE'); loadDispositions(); }

// ── TELEPHONY ─────────────────────────────────────────────────────────────
function showTelSubPage(sub) {
  document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.sub-page').forEach(p => p.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.getElementById('tel-' + sub).classList.add('active');
  if (sub === 'numbers') loadNumbers();
  if (sub === 'routes') loadRoutes();
}
async function loadTelephony() { await loadTrunks(); }

async function loadTrunks() {
  trunksCache = await api('/api/telephony/trunks');
  const el = document.getElementById('trunks-list');
  if (!trunksCache.length) { el.innerHTML = '<div class="empty"><div class="ico">&#9742;</div><div class="ttl">No trunks configured</div></div>'; return; }
  el.innerHTML = trunksCache.map(t => `
    <div class="trunk-card">
      <div class="trunk-info">
        <div class="trunk-server-badge">${t.server_type==='asterisk'?'AST':'FS'}</div>
        <div><div class="trunk-name">${t.name}</div><div class="trunk-meta">${t.sip_host}:${t.sip_port} &middot; ${t.transport.toUpperCase()} &middot; Max ${t.max_channels} channels</div></div>
      </div>
      <div class="trunk-actions">
        <span class="badge ${t.status==='active'?'badge-green':'badge-gray'}">${t.status}</span>
        <button class="btn-ghost btn-sm" onclick="openTrunkModal('${t.id}')">Edit</button>
        <button class="btn-ghost btn-sm" onclick="deleteTrunk('${t.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function openTrunkModal(trunkId) {
  editingTrunkId = trunkId || null;
  const trunk = trunkId ? trunksCache.find(t => t.id === trunkId) : null;
  document.getElementById('tr-name').value = trunk ? trunk.name : '';
  document.getElementById('tr-server-type').value = trunk ? trunk.server_type : 'freeswitch';
  document.getElementById('tr-host').value = trunk ? trunk.sip_host : '';
  document.getElementById('tr-port').value = trunk ? trunk.sip_port : 5060;
  document.getElementById('tr-user').value = trunk ? trunk.sip_user : '';
  document.getElementById('tr-pass').value = '';
  document.getElementById('tr-transport').value = trunk ? trunk.transport : 'udp';
  document.getElementById('tr-max-channels').value = trunk ? trunk.max_channels : 10;
  document.getElementById('tr-register').checked = trunk ? !!trunk.register : true;
  document.querySelector('#trunk-modal .modal-head h3').textContent = trunk ? 'Edit SIP Trunk' : 'Add SIP Trunk';
  document.querySelector('#trunk-modal .modal-foot .btn:not(.btn-outline)').textContent = trunk ? 'Save Changes' : 'Add Trunk';
  document.getElementById('trunk-modal').classList.remove('hidden');
}

async function createTrunk() {
  const name = document.getElementById('tr-name').value.trim();
  const server_type = document.getElementById('tr-server-type').value;
  const sip_host = document.getElementById('tr-host').value.trim();
  const sip_port = parseInt(document.getElementById('tr-port').value) || 5060;
  const sip_user = document.getElementById('tr-user').value.trim();
  const sip_pass = document.getElementById('tr-pass').value;
  const transport = document.getElementById('tr-transport').value;
  const max_channels = parseInt(document.getElementById('tr-max-channels').value) || 10;
  const register = document.getElementById('tr-register').checked;
  if (!name || !sip_host) { alert('Name and SIP host required'); return; }
  if (editingTrunkId) await api('/api/telephony/trunks/' + editingTrunkId, 'PUT', { name, server_type, sip_host, sip_port, sip_user, sip_pass, transport, register, max_channels, status: 'active' });
  else await api('/api/telephony/trunks', 'POST', { name, server_type, sip_host, sip_port, sip_user, sip_pass, transport, register, max_channels });
  editingTrunkId = null;
  closeModal('trunk-modal');
  loadTrunks();
}
async function deleteTrunk(id) { if (!confirm('Delete this trunk?')) return; await api('/api/telephony/trunks/' + id, 'DELETE'); loadTrunks(); }

async function loadNumbers() {
  numbersCache = await api('/api/telephony/numbers');
  await loadTrunks();
  document.getElementById('num-bulk-trunk').innerHTML = '<option value="">- Unassigned -</option>' + trunksCache.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  const tbody = document.getElementById('numbers-table');
  if (!numbersCache.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--ink-soft)">No numbers added yet</td></tr>'; return; }
  tbody.innerHTML = numbersCache.map(n => `
    <tr><td><strong>${n.number}</strong></td><td>${n.label||'—'}</td><td><span class="badge badge-blue">${n.type}</span></td>
    <td><span class="badge ${n.status==='active'?'badge-green':'badge-gray'}">${n.status}</span></td>
    <td><button class="btn-ghost btn-sm" onclick="deleteNumber('${n.id}')">Delete</button></td></tr>
  `).join('');
}
async function addSingleNumber() {
  const number = document.getElementById('num-single-input').value.trim();
  const label = document.getElementById('num-single-label').value.trim();
  if (!number) { alert('Enter a number'); return; }
  await api('/api/telephony/numbers', 'POST', { number, label, type: 'both' });
  document.getElementById('num-single-input').value = ''; document.getElementById('num-single-label').value = '';
  loadNumbers();
}
async function bulkUploadNumbers() {
  const fileInput = document.getElementById('num-bulk-file');
  if (!fileInput.files.length) { alert('Choose a CSV file'); return; }
  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  formData.append('trunk_id', document.getElementById('num-bulk-trunk').value);
  formData.append('type', document.getElementById('num-bulk-type').value);
  const res = await api('/api/telephony/numbers/bulk', 'POST', formData, true);
  alert(`Added ${res.added || 0} numbers`);
  fileInput.value = ''; loadNumbers();
}
async function deleteNumber(id) { if (!confirm('Delete this number?')) return; await api('/api/telephony/numbers/' + id, 'DELETE'); loadNumbers(); }

async function loadRoutes() {
  const routes = await api('/api/telephony/routes');
  await loadTrunks();
  const tbody = document.getElementById('routes-table');
  if (!routes.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--ink-soft)">No routes configured</td></tr>'; return; }
  tbody.innerHTML = routes.map(r => {
    const trunk = trunksCache.find(t => t.id === r.trunk_id);
    const did = numbersCache.find(n => n.id === r.did_id);
    return `<tr><td><span class="badge ${r.direction==='inbound'?'badge-blue':'badge-purple'}">${r.direction}</span></td>
      <td>${trunk?trunk.name:'—'}</td><td>${did?did.number:'—'}</td>
      <td>${r.destination_type} ${r.destination_id?'('+r.destination_id.slice(0,8)+')':''}</td>
      <td>${r.priority}</td><td><button class="btn-ghost btn-sm" onclick="deleteRoute('${r.id}')">Delete</button></td></tr>`;
  }).join('');
}
function toggleRouteFields() {
  const dir = document.getElementById('rt-direction').value;
  document.getElementById('rt-did-field').style.display = dir==='inbound'?'block':'none';
  document.getElementById('rt-dest-field').style.display = dir==='inbound'?'block':'none';
}
async function openRouteModal() {
  await loadTrunks();
  numbersCache = await api('/api/telephony/numbers');
  document.getElementById('rt-trunk').innerHTML = trunksCache.map(t => `<option value="${t.id}">${t.name}</option>`).join('') || '<option value="">No trunks — add one first</option>';
  document.getElementById('rt-did').innerHTML = '<option value="">- Any -</option>' + numbersCache.map(n => `<option value="${n.id}">${n.number}</option>`).join('');
  document.getElementById('rt-dest-id').innerHTML = ivrCache.map(i => `<option value="${i.id}">${i.name}</option>`).join('') + agentsCache.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  toggleRouteFields();
  document.getElementById('route-modal').classList.remove('hidden');
}
async function createRoute() {
  const trunk_id = document.getElementById('rt-trunk').value;
  if (!trunk_id) { alert('Select a trunk'); return; }
  await api('/api/telephony/routes', 'POST', {
    trunk_id, did_id: document.getElementById('rt-did').value,
    direction: document.getElementById('rt-direction').value,
    destination_type: document.getElementById('rt-dest-type').value,
    destination_id: document.getElementById('rt-dest-id').value,
    priority: parseInt(document.getElementById('rt-priority').value) || 1
  });
  closeModal('route-modal');
  loadRoutes();
}
async function deleteRoute(id) { if (!confirm('Delete this route?')) return; await api('/api/telephony/routes/' + id, 'DELETE'); loadRoutes(); }

// ── CAMPAIGNS ─────────────────────────────────────────────────────────────
async function loadCampaigns() {
  campaignsCache = await api('/api/campaigns');
  const tbody = document.getElementById('campaigns-table');
  if (!campaignsCache.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--ink-soft)">No campaigns yet</td></tr>'; return; }
  tbody.innerHTML = campaignsCache.map(c => `
    <tr><td><strong>${c.name}</strong></td><td><span class="badge badge-blue">${c.mode}</span></td><td>${c.cps}</td><td>${(c.queue||[]).length}</td>
    <td><span class="badge ${c.status==='active'?'badge-green':c.status==='paused'?'badge-orange':'badge-gray'}">${c.status}</span></td>
    <td>
      ${c.status==='draft'?`<button class="btn-sm btn" onclick="updateCampaignStatus('${c.id}','active')">Launch</button>`:''}
      ${c.status==='active'?`<button class="btn-sm btn-outline" onclick="updateCampaignStatus('${c.id}','paused')">Pause</button>`:''}
      ${c.status==='paused'?`<button class="btn-sm btn" onclick="updateCampaignStatus('${c.id}','active')">Resume</button>`:''}
      <button class="btn-ghost btn-sm" onclick="openCampaignModal('${c.id}')">Edit</button>
      <button class="btn-ghost btn-sm" onclick="cloneCampaign('${c.id}')">Clone</button>
      <button class="btn-ghost btn-sm" onclick="deleteCampaign('${c.id}')">Delete</button>
    </td></tr>
  `).join('');
}

function selectMode(mode) { selectedMode = mode; document.querySelectorAll('#cm-mode-group .pill').forEach(p => p.classList.toggle('active', p.dataset.mode === mode)); }
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}
function addDndToCampaign() {
  const val = document.getElementById('cm-dnd-input').value.trim();
  if (!val) return;
  cmDndList.push(val);
  document.getElementById('cm-dnd-input').value = '';
  renderCmDndChips();
}
function renderCmDndChips() {
  document.getElementById('cm-dnd-chips').innerHTML = cmDndList.map((n,i) => `<div class="chip"><span class="dot" style="background:var(--red)"></span>${n} <span class="x" onclick="removeCmDnd(${i})">&times;</span></div>`).join('');
}
function removeCmDnd(i) { cmDndList.splice(i,1); renderCmDndChips(); }

function checkNewAgentOption(sel) { if (sel.value === '__new__') { closeModal('campaign-modal'); openAgentModal(); } }

function openCampaignModal(campaignId) {
  editingCampaignId = campaignId || null;
  const camp = campaignId ? campaignsCache.find(c => c.id === campaignId) : null;
  document.getElementById('cm-name').value = camp ? camp.name : '';
  document.getElementById('cm-cps').value = camp ? camp.cps : 1;
  document.getElementById('cm-status').value = camp ? camp.status : 'draft';
  selectedMode = camp ? camp.mode : 'preview';
  cmDndList = camp ? [...(camp.dnd_list||[])] : [];
  document.querySelectorAll('#cm-mode-group .pill').forEach(p => p.classList.toggle('active', p.dataset.mode === selectedMode));
  renderCmDndChips();

  const agentSel = document.getElementById('cm-agent');
  agentSel.innerHTML = (agentsCache.length?agentsCache.map(a=>`<option value="${a.id}">${a.name}</option>`).join(''):'') + '<option value="__new__">+ Create New Agent...</option>';
  if (camp && camp.agent_id) agentSel.value = camp.agent_id;

  const flowSel = document.getElementById('cm-flow');
  flowSel.innerHTML = '<option value="">- None -</option>' + flowsCache.map(f=>`<option value="${f.id}">${f.name}</option>`).join('');
  if (camp && camp.flow_id) flowSel.value = camp.flow_id;

  const ivrSel = document.getElementById('cm-ivr');
  ivrSel.innerHTML = '<option value="">- None -</option>' + ivrCache.map(i=>`<option value="${i.id}">${i.name}</option>`).join('');
  if (camp && camp.ivr_id) ivrSel.value = camp.ivr_id;

  const trunkSel = document.getElementById('cm-trunk');
  trunkSel.innerHTML = '<option value="">- None -</option>' + trunksCache.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
  if (camp && camp.trunk_id) trunkSel.value = camp.trunk_id;

  if (camp) {
    document.getElementById('cm-queue-pending').textContent = (camp.queue||[]).length;
    document.getElementById('cm-queue-recycle').textContent = (camp.recycle_list||[]).length;
    document.getElementById('cm-queue-dnd').textContent = (camp.dnd_list||[]).length;
  }
  document.querySelector('#campaign-modal .modal-head h3').textContent = camp ? 'Edit Campaign' : 'New Campaign';
  document.querySelector('#campaign-modal .modal-foot .btn:not(.btn-outline)').textContent = camp ? 'Save Changes' : 'Create Campaign';
  document.getElementById('campaign-modal').classList.remove('hidden');
}

async function createCampaign() {
  const name = document.getElementById('cm-name').value.trim();
  const cps = parseInt(document.getElementById('cm-cps').value) || 1;
  const status = document.getElementById('cm-status').value;
  const agent_id = document.getElementById('cm-agent').value;
  const flow_id = document.getElementById('cm-flow').value;
  const ivr_id = document.getElementById('cm-ivr').value;
  const trunk_id = document.getElementById('cm-trunk').value;
  const schedule_start = document.getElementById('cm-sched-start').value;
  const schedule_end = document.getElementById('cm-sched-end').value;
  if (!name) { alert('Campaign name required'); return; }
  if (agent_id === '__new__') { alert('Please select an existing agent or create one first'); return; }

  let campaignId = editingCampaignId;
  if (editingCampaignId) await api('/api/campaigns/' + editingCampaignId, 'PUT', { name, agent_id, flow_id, ivr_id, trunk_id, mode: selectedMode, cps, status, schedule_start, schedule_end });
  else { const result = await api('/api/campaigns', 'POST', { name, agent_id, flow_id, ivr_id, trunk_id, mode: selectedMode, cps, status, schedule_start, schedule_end }); campaignId = result.id; }

  const fileInput = document.getElementById('cm-leads-file');
  if (fileInput.files.length && campaignId) { const fd = new FormData(); fd.append('file', fileInput.files[0]); await api('/api/campaigns/' + campaignId + '/leads', 'POST', fd, true); }
  for (const phone of cmDndList) { if (campaignId) await api('/api/campaigns/' + campaignId + '/dnd', 'POST', { phone }); }

  editingCampaignId = null;
  closeModal('campaign-modal');
  loadCampaigns();
  loadDashboard();
}
async function updateCampaignStatus(id, status) { await api('/api/campaigns/' + id + '/status', 'PUT', { status }); loadCampaigns(); loadDashboard(); }
async function cloneCampaign(id) { await api('/api/campaigns/' + id + '/clone', 'POST'); loadCampaigns(); }
async function deleteCampaign(id) { if (!confirm('Delete this campaign?')) return; await api('/api/campaigns/' + id, 'DELETE'); loadCampaigns(); }

// ── CALLS ─────────────────────────────────────────────────────────────────
async function loadCalls() {
  const calls = await api('/api/calls');
  const tbody = document.getElementById('calls-table');
  if (!calls.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--ink-soft)">No calls logged yet</td></tr>'; return; }
  tbody.innerHTML = calls.map(c => `
    <tr><td>${c.phone||'—'}</td><td><span class="badge ${c.outcome==='INTERESTED'?'badge-green':c.outcome==='TRANSFER'?'badge-blue':'badge-gray'}">${c.outcome||'—'}</span></td>
    <td>${c.duration}s</td><td>${new Date(c.created_at).toLocaleString()}</td></tr>
  `).join('');
}

// ── TEAM (with permission grid) ──────────────────────────────────────────
const ROLE_DEFAULT_GRID = {
  manager: { dashboard:'view', agents:'edit', flows:'edit', ivr:'edit', dispositions:'edit', telephony:'view', campaigns:'full', calls:'view', reports:'view', recordings:'view', dnd:'edit', team:'none' },
  agent:   { dashboard:'view', agents:'none', flows:'none', ivr:'none', dispositions:'none', telephony:'none', campaigns:'view', calls:'view', reports:'none', recordings:'view', dnd:'none', team:'none' },
};

async function loadPermissionCatalog() {
  if (permissionCatalog) return permissionCatalog;
  permissionCatalog = await api('/api/admin/permission-catalog');
  return permissionCatalog;
}

async function loadTeam() {
  const tbody = document.getElementById('team-table');
  try {
    const rows = await api('/api/admin/team');
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--ink-soft)">No team members yet</td></tr>'; return; }
    tbody.innerHTML = rows.map(r => `
      <tr><td><strong>${r.name}</strong></td><td>${r.email}</td>
      <td><span class="badge ${r.role==='admin'?'badge-purple':r.role==='manager'?'badge-blue':'badge-gray'}">${r.role}</span></td>
      <td><span class="badge ${r.status==='active'?'badge-green':'badge-red'}">${r.status}</span></td>
      <td>${new Date(r.created_at).toLocaleDateString()}</td>
      <td>${r.role!=='admin'?`<button class="btn-ghost btn-sm" onclick="toggleTeamStatus('${r.id}','${r.status==='active'?'suspended':'active'}')">${r.status==='active'?'Suspend':'Activate'}</button><button class="btn-ghost btn-sm" onclick="deleteTeamMember('${r.id}')">Remove</button>`:'<span style="color:var(--ink-soft);font-size:11px">Org Admin</span>'}</td></tr>
    `).join('');
  } catch (e) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--red)">Could not load team — check permissions</td></tr>'; }
}

async function openTeamModal() {
  document.getElementById('tm-name').value = ''; document.getElementById('tm-email').value = ''; document.getElementById('tm-password').value = '';
  const roleSel = document.getElementById('tm-role');
  roleSel.innerHTML = user.role === 'manager' ? '<option value="agent">Agent</option>' : '<option value="agent">Agent</option><option value="manager">Manager</option>';
  await loadPermissionCatalog();
  applyRoleDefaultsToGrid();
  document.getElementById('team-modal').classList.remove('hidden');
}

function applyRoleDefaultsToGrid() {
  const role = document.getElementById('tm-role').value;
  currentGridPerms = { ...ROLE_DEFAULT_GRID[role] };
  renderPermissionGrid();
}

function renderPermissionGrid() {
  if (!permissionCatalog) return;
  const { modules, levels } = permissionCatalog;
  document.getElementById('permission-grid').innerHTML = `<div class="perm-grid">` + modules.map(m => {
    const isTeam = m.key === 'team';
    const current = isTeam ? 'none' : (currentGridPerms[m.key] || 'none');
    return `<div class="perm-row"><div class="perm-label">${m.label}${isTeam?' <span style="color:var(--ink-soft);font-weight:400">(admin only)</span>':''}</div>
      <div class="perm-pills">${levels.map(lvl => `<div class="perm-pill ${current===lvl?'active':''} ${isTeam?'locked':''}" onclick="${isTeam?'':`setPermLevel('${m.key}','${lvl}')`}">${lvl}</div>`).join('')}</div></div>`;
  }).join('') + `</div>`;
}
function setPermLevel(moduleKey, level) { currentGridPerms[moduleKey] = level; renderPermissionGrid(); }

async function inviteTeamMember() {
  const name = document.getElementById('tm-name').value.trim();
  const email = document.getElementById('tm-email').value.trim();
  const password = document.getElementById('tm-password').value;
  const role = document.getElementById('tm-role').value;
  if (!name || !email || !password) { alert('All fields are required'); return; }
  if (password.length < 6) { alert('Password must be at least 6 characters'); return; }
  const res = await api('/api/admin/team', 'POST', { name, email, password, role, permissions: currentGridPerms });
  if (res.error) { alert(res.error); return; }
  closeModal('team-modal');
  loadTeam();
}
async function toggleTeamStatus(id, newStatus) { await api('/api/admin/team/' + id, 'PUT', { status: newStatus }); loadTeam(); }
async function deleteTeamMember(id) { if (!confirm('Remove this team member?')) return; await api('/api/admin/team/' + id, 'DELETE'); loadTeam(); }

// ── ORGANIZATIONS (Super Admin) ──────────────────────────────────────────
async function loadOrganizations() {
  const tbody = document.getElementById('orgs-table');
  try {
    const rows = await api('/api/admin/organizations');
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--ink-soft)">No organizations yet</td></tr>'; return; }
    tbody.innerHTML = rows.map(o => `
      <tr><td><strong>${o.name}</strong></td>
      <td><select onchange="updateOrgPlan('${o.id}', this.value)" style="padding:4px 8px;font-size:11px;border:1px solid var(--line);border-radius:4px">
        <option value="starter" ${o.plan==='starter'?'selected':''}>Starter</option>
        <option value="growth" ${o.plan==='growth'?'selected':''}>Growth</option>
        <option value="enterprise" ${o.plan==='enterprise'?'selected':''}>Enterprise</option>
      </select></td>
      <td>${o.userCount}</td><td>${o.agentCount}</td><td>${o.callCount}</td>
      <td><span class="badge ${o.status==='active'?'badge-green':'badge-red'}">${o.status}</span></td>
      <td><button class="btn-ghost btn-sm" onclick="toggleOrgStatus('${o.id}','${o.status==='active'?'suspended':'active'}')">${o.status==='active'?'Suspend':'Activate'}</button></td></tr>
    `).join('');
  } catch (e) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--red)">Could not load organizations — check permissions</td></tr>'; }
}
async function toggleOrgStatus(id, newStatus) { await api('/api/admin/organizations/' + id + '/status', 'PUT', { status: newStatus }); loadOrganizations(); }
async function updateOrgPlan(id, plan) { await api('/api/admin/organizations/' + id + '/plan', 'PUT', { plan }); loadOrganizations(); }

// ── REPORTS ───────────────────────────────────────────────────────────────
function showReport(type) {
  currentReport = type;
  document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.getElementById('report-cdr-filters').style.display = (type === 'cdr') ? 'flex' : 'none';
  loadReport();
}

async function loadReport() {
  const out = document.getElementById('report-output');
  out.innerHTML = '<div class="empty"><div class="ico">&#9203;</div><div class="ttl">Loading...</div></div>';
  if (currentReport === 'cdr') {
    const params = new URLSearchParams();
    const phone = document.getElementById('rf-phone').value;
    const outcome = document.getElementById('rf-outcome').value;
    if (phone) params.append('phone', phone);
    if (outcome) params.append('outcome', outcome);
    renderCdrTable(await api('/api/reports/cdr?' + params.toString()));
  } else if (currentReport === 'by-did') {
    renderGenericTable(await api('/api/reports/by-did'), [['did_number','DID Number'],['did_label','Label'],['total_calls','Total Calls'],['interested','Interested'],['transferred','Transferred'],['avg_duration','Avg Duration (s)']]);
  } else if (currentReport === 'by-disposition') {
    renderGenericTable(await api('/api/reports/by-disposition'), [['disposition_name','Disposition'],['sub_disposition','Sub-Disposition'],['total_calls','Total Calls'],['avg_duration','Avg Duration (s)']]);
  } else if (currentReport === 'by-agent') {
    renderGenericTable(await api('/api/reports/by-agent'), [['agent_name','Agent'],['total_calls','Total Calls'],['interested','Interested'],['transferred','Transferred'],['total_talk_time','Total Talk Time (s)']]);
  } else if (currentReport === 'by-campaign') {
    renderGenericTable(await api('/api/reports/by-campaign'), [['campaign_name','Campaign'],['campaign_mode','Mode'],['total_calls','Total Calls'],['interested','Interested'],['transferred','Transferred'],['not_interested','Not Interested']]);
  } else if (currentReport === 'by-number') {
    renderGenericTable(await api('/api/reports/by-number'), [['phone','Phone'],['total_calls','Total Calls'],['interested','Interested'],['total_duration','Total Duration (s)'],['last_call_at','Last Call']]);
  }
}
function renderCdrTable(rows) {
  const out = document.getElementById('report-output');
  if (!rows.length) { out.innerHTML = '<div class="empty"><div class="ico">&#9776;</div><div class="ttl">No call records found</div></div>'; return; }
  out.innerHTML = `<table class="cdr-table"><thead><tr><th>Phone</th><th>Direction</th><th>Outcome</th><th>Duration</th><th>Date</th></tr></thead><tbody>${rows.map(r => `
    <tr><td>${r.phone||'—'}</td><td>${r.direction||'—'}</td><td><span class="badge ${r.outcome==='INTERESTED'?'badge-green':r.outcome==='TRANSFER'?'badge-blue':'badge-gray'}">${r.outcome||'—'}</span></td>
    <td>${r.duration}s</td><td>${new Date(r.created_at).toLocaleString()}</td></tr>`).join('')}</tbody></table>`;
}
function renderGenericTable(rows, cols) {
  const out = document.getElementById('report-output');
  if (!rows.length) { out.innerHTML = '<div class="empty"><div class="ico">&#9776;</div><div class="ttl">No data available</div></div>'; return; }
  out.innerHTML = `<table class="cdr-table"><thead><tr>${cols.map(c=>`<th>${c[1]}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c=>`<td>${r[c[0]] ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

// ── RECORDINGS ────────────────────────────────────────────────────────────
async function loadRecordings() {
  const out = document.getElementById('recordings-output');
  out.innerHTML = '<div class="empty"><div class="ico">&#9203;</div><div class="ttl">Loading...</div></div>';
  const params = new URLSearchParams();
  const phone = document.getElementById('rec-phone')?.value || '';
  const category = document.getElementById('rec-category')?.value || '';
  if (phone) params.append('phone', phone);
  if (category) params.append('category', category);
  const rows = await api('/api/recordings?' + params.toString());
  if (!rows.length) { out.innerHTML = '<div class="empty"><div class="ico">&#127911;</div><div class="ttl">No recordings found</div></div>'; return; }
  out.innerHTML = rows.map(r => `
    <div class="rec-card"><div class="rec-card-info"><div class="rec-card-phone">${r.phone || 'Unknown number'}</div>
    <div class="rec-card-meta">${r.outcome||'—'} &middot; ${r.duration}s &middot; ${new Date(r.created_at).toLocaleString()} &middot; <span class="badge badge-gray">${r.category}</span></div>
    <div class="rec-tags">${(r.tags||[]).map(t => `<span class="rec-tag">${t}</span>`).join('')}</div></div>
    <audio controls src="${r.recording_path}" style="height:32px;max-width:200px"></audio>
    <button class="btn-ghost btn-sm" onclick="openRecordingMeta('${r.id}')">Edit</button></div>
  `).join('');
}
async function openRecordingMeta(callId) {
  const rec = await api('/api/recordings/' + callId);
  const tags = prompt('Tags (comma separated):', (rec.tags||[]).join(', '));
  if (tags === null) return;
  const notes = prompt('Notes:', rec.notes || '');
  if (notes === null) return;
  const category = prompt('Category (general/sales/support/complaint):', rec.category || 'general');
  if (category === null) return;
  await api('/api/recordings/' + callId + '/meta', 'PUT', { tags: tags.split(',').map(t=>t.trim()).filter(Boolean), notes, category });
  loadRecordings();
}

// Refresh dashboard periodically
setInterval(() => { if (!document.getElementById('app-screen').classList.contains('hidden')) loadDashboard(); }, 20000);

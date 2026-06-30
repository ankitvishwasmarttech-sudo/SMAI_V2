// ============================================================
// QUALITY AUDIT MODULE
// ============================================================

let qaCallsCache = [];
let qaCriteriaCache = [];
let qaCurrentCallId = null;
let qaCurrentAuditId = null;
let qaQualityChecks = [];
let qaComplianceChecks = [];

function showQASubPage(sub) {
  document.querySelectorAll('#page-quality .sub-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#page-quality .sub-page').forEach(p => p.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.getElementById('qa-' + sub).classList.add('active');
  if (sub === 'pending') loadQaPending();
  if (sub === 'audited') loadQaAudited();
}

async function loadQualityPage() {
  await loadQaCriteria();
  loadQaPending();
}

async function loadQaPending() {
  qaCallsCache = await api('/api/quality/queue/pending');
  const tbody = document.getElementById('qa-pending-table');
  if (!qaCallsCache.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--ink-soft)">No recordings waiting for review</td></tr>'; return; }
  tbody.innerHTML = qaCallsCache.map(c => `
    <tr><td>${c.phone||'—'}</td><td><span class="badge badge-gray">${c.outcome||'—'}</span></td><td>${c.duration}s</td>
    <td>${new Date(c.created_at).toLocaleString()}</td>
    <td><button class="btn-sm btn" onclick="openAuditModal('${c.id}')">Audit Call</button></td></tr>
  `).join('');
}

async function loadQaAudited() {
  const rows = await api('/api/quality?status=reviewed');
  const all = await api('/api/quality');
  const tbody = document.getElementById('qa-audited-table');
  if (!all.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--ink-soft)">No audits completed yet</td></tr>'; return; }
  tbody.innerHTML = all.map(a => `
    <tr><td>${a.call?.phone||'—'}</td>
    <td><strong>${a.score}</strong>/100</td>
    <td><span class="badge ${a.status==='reviewed'?'badge-green':a.status==='escalated'?'badge-red':'badge-orange'}">${a.status}</span></td>
    <td>${new Date(a.updated_at).toLocaleString()}</td>
    <td><button class="btn-sm btn-outline" onclick="openAuditModal('${a.call_id}','${a.id}')">View / Edit</button></td></tr>
  `).join('');
}

// ── Criteria management ──────────────────────────────────────────────────
async function loadQaCriteria() {
  qaCriteriaCache = await api('/api/quality/criteria/list');
}

function openCriteriaModal() {
  renderCriteriaList();
  document.getElementById('criteria-modal').classList.remove('hidden');
}

function renderCriteriaList() {
  const el = document.getElementById('criteria-list');
  if (!qaCriteriaCache.length) { el.innerHTML = '<p class="help-text">No checklist items yet — using a sensible default until you add your own.</p>'; return; }
  el.innerHTML = qaCriteriaCache.map(c => `
    <div class="perm-row" style="margin-bottom:6px">
      <div class="perm-label">[${c.category}] ${c.label} <span style="color:var(--ink-soft)">(weight ${c.weight})</span></div>
      <button class="btn-ghost btn-sm" onclick="deleteCriterion('${c.id}')">Remove</button>
    </div>
  `).join('');
}

async function addCriterion() {
  const label = document.getElementById('cr-label').value.trim();
  const category = document.getElementById('cr-category').value;
  const weight = parseInt(document.getElementById('cr-weight').value) || 10;
  if (!label) { alert('Enter a checklist item'); return; }
  await api('/api/quality/criteria', 'POST', { category, label, weight });
  document.getElementById('cr-label').value = '';
  await loadQaCriteria();
  renderCriteriaList();
}

async function deleteCriterion(id) {
  await api('/api/quality/criteria/' + id, 'DELETE');
  await loadQaCriteria();
  renderCriteriaList();
}

// ── Audit modal ───────────────────────────────────────────────────────────
async function openAuditModal(callId, auditId) {
  qaCurrentCallId = callId;
  qaCurrentAuditId = auditId || null;

  const call = await api('/api/calls').then(list => list.find(c => c.id === callId)) || {};
  document.getElementById('audit-call-meta').innerHTML = `
    <div class="qm-item"><div class="qm-val">${call.phone||'—'}</div><div class="qm-lbl">Phone</div></div>
    <div class="qm-item"><div class="qm-val">${call.duration||0}s</div><div class="qm-lbl">Duration</div></div>
    <div class="qm-item"><div class="qm-val">${call.outcome||'—'}</div><div class="qm-lbl">Outcome</div></div>
  `;
  document.getElementById('audit-audio').src = call.recording_path || '';

  let existing = null;
  if (auditId) existing = await api('/api/quality/' + auditId);

  document.getElementById('audit-transcript').value = existing ? existing.transcript : (call.transcript || '');
  document.getElementById('audit-score').value = existing ? existing.score : 0;
  document.getElementById('audit-status').value = existing ? existing.status : 'pending';
  document.getElementById('audit-remarks').value = existing ? existing.remarks : '';
  document.getElementById('audit-ai-status').textContent = '';

  await loadQaCriteria();
  const qualityCriteria = qaCriteriaCache.filter(c => c.category === 'quality');
  const complianceCriteria = qaCriteriaCache.filter(c => c.category === 'compliance');

  qaQualityChecks = (existing ? existing.quality_points : []);
  qaComplianceChecks = (existing ? existing.compliance_points : []);
  if (!qaQualityChecks.length) qaQualityChecks = qualityCriteria.map(c => ({ label: c.label, met: false }));
  if (!qaComplianceChecks.length) qaComplianceChecks = complianceCriteria.map(c => ({ label: c.label, met: false }));
  if (!qualityCriteria.length && !qaQualityChecks.length) qaQualityChecks = [{label:'Greeting and tone',met:false},{label:'Followed script',met:false},{label:'Resolution achieved',met:false}];
  if (!complianceCriteria.length && !qaComplianceChecks.length) qaComplianceChecks = [{label:'Identity verification',met:false},{label:'Disclosure statements made',met:false}];

  renderCheckGroup('audit-quality-points', qaQualityChecks, 'qaQualityChecks');
  renderCheckGroup('audit-compliance-points', qaComplianceChecks, 'qaComplianceChecks');

  document.getElementById('audit-modal').classList.remove('hidden');
}

function renderCheckGroup(elId, items, varName) {
  document.getElementById(elId).innerHTML = items.map((it, i) => `
    <div class="perm-row" style="margin-bottom:6px">
      <div class="perm-label">${it.label}</div>
      <label class="switch"><input type="checkbox" ${it.met?'checked':''} onchange="toggleCheck('${varName}', ${i}, this.checked)"/><span class="slider"></span></label>
    </div>
  `).join('');
}

function toggleCheck(varName, idx, val) {
  const arr = varName === 'qaQualityChecks' ? qaQualityChecks : qaComplianceChecks;
  arr[idx].met = val;
}

async function generateAiDraft() {
  const statusEl = document.getElementById('audit-ai-status');
  statusEl.textContent = 'Generating...';
  const res = await api('/api/quality/' + qaCurrentCallId + '/ai-draft', 'POST');
  if (res.error) { statusEl.textContent = res.error; statusEl.style.color = 'var(--red)'; return; }

  document.getElementById('audit-score').value = res.score || 0;
  document.getElementById('audit-remarks').value = res.remarks || '';
  if (res.quality_points?.length) { qaQualityChecks = res.quality_points; renderCheckGroup('audit-quality-points', qaQualityChecks, 'qaQualityChecks'); }
  if (res.compliance_points?.length) { qaComplianceChecks = res.compliance_points; renderCheckGroup('audit-compliance-points', qaComplianceChecks, 'qaComplianceChecks'); }
  statusEl.textContent = 'AI draft applied — review and adjust before saving.';
  statusEl.style.color = 'var(--green)';
}

async function saveAudit() {
  const payload = {
    call_id: qaCurrentCallId,
    transcript: document.getElementById('audit-transcript').value,
    score: parseInt(document.getElementById('audit-score').value) || 0,
    status: document.getElementById('audit-status').value,
    remarks: document.getElementById('audit-remarks').value,
    quality_points: qaQualityChecks,
    compliance_points: qaComplianceChecks,
  };
  if (qaCurrentAuditId) await api('/api/quality/' + qaCurrentAuditId, 'PUT', payload);
  else await api('/api/quality', 'POST', payload);

  closeModal('audit-modal');
  loadQaPending();
  loadQaAudited();
}

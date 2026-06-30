const FB_NODE_CATALOG = {
  'Communication': [
    { type: 'voice_call', label: 'Voice Call', color: '#FF6B00' },
    { type: 'whatsapp', label: 'WhatsApp', color: '#25D366' },
    { type: 'sms', label: 'SMS', color: '#3B82F6' },
    { type: 'email', label: 'Email', color: '#6366F1' },
    { type: 'telegram', label: 'Telegram', color: '#0EA5E9' },
    { type: 'messenger', label: 'Facebook Messenger', color: '#1877F2' },
    { type: 'instagram_dm', label: 'Instagram DM', color: '#E1306C' },
    { type: 'web_chat', label: 'Web Chat', color: '#8B5CF6' },
    { type: 'live_transfer', label: 'Live Agent Transfer', color: '#DC2626' },
  ],
  'AI': [
    { type: 'ai_agent', label: 'AI Agent', color: '#FF6B00' },
    { type: 'intent', label: 'Intent Detection', color: '#7C3AED' },
    { type: 'sentiment', label: 'Sentiment Analysis', color: '#7C3AED' },
    { type: 'translate', label: 'Translation', color: '#7C3AED' },
    { type: 'summarize', label: 'Summarization', color: '#7C3AED' },
    { type: 'kb_search', label: 'Knowledge Base Search', color: '#7C3AED' },
    { type: 'stt', label: 'Speech-to-Text', color: '#7C3AED' },
    { type: 'tts', label: 'Text-to-Speech', color: '#7C3AED' },
  ],
  'Logic': [
    { type: 'condition', label: 'Condition', color: '#0EA5E9' },
    { type: 'if_else', label: 'If / Else', color: '#0EA5E9' },
    { type: 'switch', label: 'Switch', color: '#0EA5E9' },
    { type: 'delay', label: 'Delay', color: '#0EA5E9' },
    { type: 'loop', label: 'Loop', color: '#0EA5E9' },
    { type: 'retry', label: 'Retry', color: '#0EA5E9' },
    { type: 'schedule', label: 'Schedule', color: '#0EA5E9' },
  ],
  'CRM': [
    { type: 'create_lead', label: 'Create Lead', color: '#16A34A' },
    { type: 'update_lead', label: 'Update Lead', color: '#16A34A' },
    { type: 'update_contact', label: 'Update Contact', color: '#16A34A' },
    { type: 'create_ticket', label: 'Create Ticket', color: '#16A34A' },
    { type: 'crm_lookup', label: 'CRM Lookup', color: '#16A34A' },
  ],
  'Integration': [
    { type: 'webhook', label: 'Webhook', color: '#64748B' },
    { type: 'rest_api', label: 'REST API', color: '#64748B' },
    { type: 'db_query', label: 'Database Query', color: '#64748B' },
    { type: 'google_sheets', label: 'Google Sheets', color: '#64748B' },
    { type: 'slack', label: 'Slack', color: '#64748B' },
    { type: 'hubspot', label: 'HubSpot', color: '#64748B' },
    { type: 'salesforce', label: 'Salesforce', color: '#64748B' },
    { type: 'zoho', label: 'Zoho', color: '#64748B' },
  ],
  'Utility': [
    { type: 'variables', label: 'Variables', color: '#A16207' },
    { type: 'data_formatter', label: 'Data Formatter', color: '#A16207' },
    { type: 'logger', label: 'Logger', color: '#A16207' },
    { type: 'notification', label: 'Notification', color: '#A16207' },
    { type: 'file_upload', label: 'File Upload', color: '#A16207' },
  ],
  'Flow': [
    { type: 'start', label: 'Start', color: '#15171A' },
    { type: 'end', label: 'End / Hangup', color: '#15171A' },
  ],
};

function FlowBuilder(containerEl, opts = {}) {
  const state = {
    nodes: opts.nodes || [],
    edges: opts.edges || [],
    zoom: 1, panX: 40, panY: 40,
    selectedNodeId: null, dragNode: null, dragOffset: { x: 0, y: 0 },
    isPanning: false, panStart: { x: 0, y: 0 },
    connecting: null,
    onChange: opts.onChange || (() => {}),
  };

  containerEl.innerHTML = `
    <div class="fb-toolbar">
      <button class="btn-sm btn-outline" data-fb-action="zoomOut">−</button>
      <span class="fb-zoom-label" data-fb-zoom-label>100%</span>
      <button class="btn-sm btn-outline" data-fb-action="zoomIn">+</button>
      <button class="btn-sm btn-outline" data-fb-action="resetView">Fit</button>
      <div class="spacer"></div>
      <span style="font-size:11px;color:var(--ink-soft)">Drag from palette &middot; drag node edge to connect &middot; click edge to delete</span>
    </div>
    <div class="fb-wrapper">
      <div class="fb-palette" data-fb-palette></div>
      <div class="fb-canvas-outer" data-fb-canvas-outer>
        <div class="fb-canvas-inner" data-fb-canvas-inner>
          <svg class="fb-svg-layer" data-fb-svg width="3000" height="2000"></svg>
          <div data-fb-nodes-layer style="position:relative"></div>
        </div>
      </div>
      <div class="fb-inspector" data-fb-inspector>
        <div class="fb-inspector-empty">Click a node to configure it</div>
      </div>
    </div>
  `;

  const palette = containerEl.querySelector('[data-fb-palette]');
  const canvasOuter = containerEl.querySelector('[data-fb-canvas-outer]');
  const canvasInner = containerEl.querySelector('[data-fb-canvas-inner]');
  const svg = containerEl.querySelector('[data-fb-svg]');
  const nodesLayer = containerEl.querySelector('[data-fb-nodes-layer]');
  const inspector = containerEl.querySelector('[data-fb-inspector]');
  const zoomLabel = containerEl.querySelector('[data-fb-zoom-label]');

  Object.entries(FB_NODE_CATALOG).forEach(([cat, items]) => {
    const catEl = document.createElement('div');
    catEl.className = 'fb-palette-cat';
    catEl.textContent = cat;
    palette.appendChild(catEl);
    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'fb-palette-item';
      el.draggable = true;
      el.innerHTML = `<span class="dot" style="background:${item.color}"></span>${item.label}`;
      el.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', JSON.stringify(item)); });
      palette.appendChild(el);
    });
  });

  canvasOuter.addEventListener('dragover', e => e.preventDefault());
  canvasOuter.addEventListener('drop', e => {
    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain');
    if (!data) return;
    const item = JSON.parse(data);
    const rect = canvasOuter.getBoundingClientRect();
    const x = (e.clientX - rect.left - state.panX) / state.zoom;
    const y = (e.clientY - rect.top - state.panY) / state.zoom;
    addNode(item.type, item.label, item.color, x, y);
  });

  function addNode(type, label, color, x, y) {
    const id = 'n' + Date.now() + Math.floor(Math.random() * 1000);
    state.nodes.push({ id, type, label, color, x, y, config: {} });
    render(); notifyChange();
  }
  function removeNode(id) {
    state.nodes = state.nodes.filter(n => n.id !== id);
    state.edges = state.edges.filter(e => e.from !== id && e.to !== id);
    if (state.selectedNodeId === id) { state.selectedNodeId = null; renderInspector(); }
    render(); notifyChange();
  }
  function removeEdge(id) { state.edges = state.edges.filter(e => e.id !== id); render(); notifyChange(); }

  nodesLayer.addEventListener('mousedown', e => {
    const nodeEl = e.target.closest('.fb-node');
    if (!nodeEl) return;
    if (e.target.classList.contains('fb-port') || e.target.classList.contains('fb-node-del')) return;
    const id = nodeEl.dataset.id;
    state.selectedNodeId = id;
    const node = state.nodes.find(n => n.id === id);
    const rect = canvasOuter.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - state.panX) / state.zoom;
    const mouseY = (e.clientY - rect.top - state.panY) / state.zoom;
    state.dragNode = node;
    state.dragOffset = { x: mouseX - node.x, y: mouseY - node.y };
    render(); renderInspector(); e.stopPropagation();
  });

  nodesLayer.addEventListener('mousedown', e => {
    if (!e.target.classList.contains('fb-port') || !e.target.classList.contains('out')) return;
    const nodeEl = e.target.closest('.fb-node');
    const fromId = nodeEl.dataset.id;
    const node = state.nodes.find(n => n.id === fromId);
    state.connecting = { fromNodeId: fromId, fromX: node.x + 180, fromY: node.y + 22 };
    e.stopPropagation();
  });

  canvasOuter.addEventListener('mousedown', e => {
    if (e.target.closest('.fb-node')) return;
    state.isPanning = true;
    canvasOuter.classList.add('panning');
    state.panStart = { x: e.clientX - state.panX, y: e.clientY - state.panY };
  });

  window.addEventListener('mousemove', e => {
    if (state.dragNode) {
      const rect = canvasOuter.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - state.panX) / state.zoom;
      const mouseY = (e.clientY - rect.top - state.panY) / state.zoom;
      state.dragNode.x = mouseX - state.dragOffset.x;
      state.dragNode.y = mouseY - state.dragOffset.y;
      render();
    } else if (state.isPanning) {
      state.panX = e.clientX - state.panStart.x;
      state.panY = e.clientY - state.panStart.y;
      applyTransform();
    } else if (state.connecting) {
      const rect = canvasOuter.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - state.panX) / state.zoom;
      const mouseY = (e.clientY - rect.top - state.panY) / state.zoom;
      renderTempEdge(mouseX, mouseY);
    }
  });

  window.addEventListener('mouseup', e => {
    if (state.connecting) {
      const targetPort = e.target.closest('.fb-port.in');
      if (targetPort) {
        const toNodeEl = targetPort.closest('.fb-node');
        const toId = toNodeEl.dataset.id;
        if (toId !== state.connecting.fromNodeId) {
          state.edges.push({ id: 'e' + Date.now(), from: state.connecting.fromNodeId, to: toId });
          notifyChange();
        }
      }
      state.connecting = null; render();
    }
    if (state.dragNode) { state.dragNode = null; notifyChange(); }
    state.isPanning = false;
    canvasOuter.classList.remove('panning');
  });

  canvasOuter.addEventListener('wheel', e => {
    e.preventDefault();
    setZoom(state.zoom + (e.deltaY > 0 ? -0.1 : 0.1));
  }, { passive: false });

  function setZoom(z) {
    state.zoom = Math.max(0.3, Math.min(2, z));
    zoomLabel.textContent = Math.round(state.zoom * 100) + '%';
    applyTransform();
  }
  function applyTransform() { canvasInner.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`; }

  containerEl.querySelectorAll('[data-fb-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.fbAction;
      if (a === 'zoomIn') setZoom(state.zoom + 0.1);
      if (a === 'zoomOut') setZoom(state.zoom - 0.1);
      if (a === 'resetView') { state.panX = 40; state.panY = 40; setZoom(1); }
    });
  });

  function render() {
    nodesLayer.innerHTML = state.nodes.map(n => `
      <div class="fb-node ${n.id===state.selectedNodeId?'selected':''}" data-id="${n.id}" style="left:${n.x}px;top:${n.y}px">
        <div class="fb-node-head"><span class="dot" style="background:${n.color}"></span>${n.label}<span class="fb-node-del" data-del-id="${n.id}">&times;</span></div>
        <div class="fb-node-body">${nodeSummary(n)}</div>
        <div class="fb-port in"></div><div class="fb-port out"></div>
      </div>
    `).join('');
    nodesLayer.querySelectorAll('[data-del-id]').forEach(el => {
      el.addEventListener('mousedown', e => e.stopPropagation());
      el.addEventListener('click', e => { e.stopPropagation(); removeNode(el.dataset.delId); });
    });
    renderEdges();
  }

  function nodeSummary(n) {
    const c = n.config || {};
    if (c.text) return escapeHtml(c.text.slice(0,60));
    if (c.condition) return 'if ' + escapeHtml(c.condition.slice(0,50));
    if (c.target) return '&rarr; ' + escapeHtml(c.target);
    return 'Not configured yet — click to set up';
  }
  function escapeHtml(s) { return (s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function renderEdges() {
    svg.setAttribute('width', 3000); svg.setAttribute('height', 2000);
    let html = `<defs><marker id="fbarrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="#E05A00" stroke-width="1.5"/></marker></defs>`;
    state.edges.forEach(edge => {
      const from = state.nodes.find(n => n.id === edge.from);
      const to = state.nodes.find(n => n.id === edge.to);
      if (!from || !to) return;
      const x1 = from.x+180, y1 = from.y+22, x2 = to.x, y2 = to.y+22, mx = (x1+x2)/2;
      html += `<path class="fb-edge fb-edge-del" data-edge-id="${edge.id}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" marker-end="url(#fbarrow)" pointer-events="stroke"/>`;
    });
    svg.innerHTML = html;
    svg.querySelectorAll('[data-edge-id]').forEach(el => el.addEventListener('click', () => removeEdge(el.dataset.edgeId)));
  }

  function renderTempEdge(mouseX, mouseY) {
    renderEdges();
    const { fromX, fromY } = state.connecting;
    const mx = (fromX+mouseX)/2;
    svg.innerHTML += `<path class="fb-edge-temp" d="M${fromX},${fromY} C${mx},${fromY} ${mx},${mouseY} ${mouseX},${mouseY}"/>`;
  }

  function renderInspector() {
    const node = state.nodes.find(n => n.id === state.selectedNodeId);
    if (!node) { inspector.innerHTML = '<div class="fb-inspector-empty">Click a node to configure it</div>'; return; }
    node.config = node.config || {};
    inspector.innerHTML = `<h4>${node.label}</h4><div class="field"><label>Node Name</label><input type="text" data-cfg="label" value="${node.label}"/></div>${configFieldsFor(node)}`;
    inspector.querySelectorAll('[data-cfg]').forEach(input => {
      input.addEventListener('input', () => {
        const key = input.dataset.cfg;
        if (key === 'label') { node.label = input.value; render(); }
        else { node.config[key] = input.value; render(); }
        notifyChange();
      });
    });
  }

  function configFieldsFor(node) {
    const c = node.config || {}, t = node.type;
    if (['voice_call','whatsapp','sms','email','web_chat','live_transfer'].includes(t))
      return `<div class="field"><label>Message / Script</label><textarea data-cfg="text" rows="4">${c.text||''}</textarea></div>`;
    if (t === 'ai_agent') return `<div class="field"><label>Agent Prompt Override (optional)</label><textarea data-cfg="text" rows="4">${c.text||''}</textarea></div>`;
    if (['condition','if_else','switch'].includes(t)) return `<div class="field"><label>Condition Expression</label><input type="text" data-cfg="condition" value="${c.condition||''}" placeholder="user_says contains 'yes'"/></div>`;
    if (t === 'delay') return `<div class="field"><label>Delay (seconds)</label><input type="number" data-cfg="text" value="${c.text||'5'}"/></div>`;
    if (t === 'live_transfer') return `<div class="field"><label>Transfer Target</label><input type="text" data-cfg="target" value="${c.target||''}" placeholder="extension or queue"/></div>`;
    if (['webhook','rest_api'].includes(t)) return `<div class="field"><label>URL</label><input type="text" data-cfg="text" value="${c.text||''}" placeholder="https://..."/></div>`;
    return `<div class="field"><label>Notes</label><textarea data-cfg="text" rows="3">${c.text||''}</textarea></div>`;
  }

  function notifyChange() { state.onChange({ nodes: state.nodes, edges: state.edges }); }

  nodesLayer.addEventListener('click', e => {
    const nodeEl = e.target.closest('.fb-node');
    if (nodeEl) { state.selectedNodeId = nodeEl.dataset.id; render(); renderInspector(); }
  });

  applyTransform(); render(); renderInspector();

  return {
    getData: () => ({ nodes: state.nodes, edges: state.edges }),
    setData: (data) => { state.nodes = data.nodes || []; state.edges = data.edges || []; render(); },
    destroy: () => { containerEl.innerHTML = ''; },
  };
}

window.FlowBuilder = FlowBuilder;
window.FB_NODE_CATALOG = FB_NODE_CATALOG;

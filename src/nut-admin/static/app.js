const $ = id => document.getElementById(id);
let currentConfigFile = '';
let logPaused = false;
let es = null;
const MAX_LOG_LINES = 1000;

let _dialogResolve = null;
let _dialogTrigger = null;

let _upsSavePending = false;
let _userSavePending = false;
const _deletePending = {};
const _driverPending = {};
let _restartPending = false;

function showDialog(html) {
  return new Promise(resolve => {
    _dialogResolve = resolve;
    _dialogTrigger = document.activeElement;
    $('confirm-modal').innerHTML = html;
    $('confirm-overlay').classList.add('open');
    $('confirm-modal').focus();
  });
}
function dismissDialog(val) {
  $('confirm-overlay').classList.remove('open');
  if (_dialogResolve) { _dialogResolve(val); _dialogResolve = null; }
  if (_dialogTrigger) { _dialogTrigger.focus(); _dialogTrigger = null; }
}
function showConfirm(msg) {
  return showDialog(
    '<p>' + esc(msg) + '</p>' +
    '<div class="modal-actions">' +
      '<button class="secondary" onclick="dismissDialog(false)">Cancel</button>' +
      '<button class="primary" onclick="dismissDialog(true)">Confirm</button>' +
    '</div>'
  );
}
function showDangerConfirm(msg) {
  return showDialog(
    '<p>' + esc(msg) + '</p>' +
    '<div class="modal-actions">' +
      '<button class="secondary" onclick="dismissDialog(false)">Cancel</button>' +
      '<button class="primary danger" onclick="dismissDialog(true)">Delete</button>' +
    '</div>'
  );
}
function showAlert(msg, title) {
  return showDialog(
    (title ? '<h3>' + esc(title) + '</h3>' : '') +
    '<p>' + esc(msg) + '</p>' +
    '<div class="modal-actions">' +
      '<button class="primary" onclick="dismissDialog()">OK</button>' +
    '</div>'
  );
}

document.addEventListener('keydown', function(e) {
  if (!$('confirm-overlay').classList.contains('open')) return;
  if (e.key === 'Escape') { dismissDialog(false); e.preventDefault(); }
});

function toggleSidebar() {
  document.getElementById('app').classList.toggle('sidebar-open');
}

const _pageTitles = {
  dashboard: 'Dashboard',
  ups: 'UPS Devices',
  users: 'Users',
  notifications: 'Notifications',
  logs: 'Logs',
  config: 'Config Files',
  hooks: 'Hooks'
};

async function loadDashboard() {
  // UPS summary
  try {
    const upsList = await api('/ups');
    $('dash-ups-count').textContent = upsList.length;
    const upsHtml = upsList.map(u =>
      '<div class="dash-ups-item">' +
        '<span class="dash-ups-name">' + esc(u.name) + '</span>' +
        badge(u.status) +
      '</div>'
    ).join('');
    $('dash-ups-list').innerHTML = upsHtml || '<div class="empty">No UPS devices configured.</div>';
  } catch(e) {
    $('dash-ups-count').textContent = '?';
    $('dash-ups-list').innerHTML = '<div class="empty">Failed to load UPS data</div>';
  }

  // Users
  try {
    const users = await api('/users');
    $('dash-user-count').textContent = users.length;
  } catch(e) {
    $('dash-user-count').textContent = '?';
  }

  // Services
  try {
    const svcs = await api('/service/status-detailed');
    const svcNames = Object.keys(svcs);
    const activeCount = svcNames.filter(s => svcs[s].active).length;
    $('dash-svc-count').textContent = activeCount + '/' + svcNames.length;

    // Health: drivers are optional (NUT 2.8+ uses nut-driver-enumerator / nut-driver@ wrappers)
    const optionalPattern = /^nut-driver/;
    const coreServices = svcNames.filter(n => !optionalPattern.test(n));
    const coreActive = coreServices.filter(s => svcs[s].active).length;
    const hasFailed = svcNames.some(s => svcs[s].state === 'failed');

    let health, healthClass;
    if (hasFailed) { health = 'Failed'; healthClass = 'health-failed'; }
    else if (coreServices.length === 0) { health = 'Unknown'; healthClass = 'health-unknown'; }
    else if (coreActive === coreServices.length) { health = 'Healthy'; healthClass = 'health-healthy'; }
    else { health = 'Degraded'; healthClass = 'health-degraded'; }

    $('dash-health').innerHTML = '<span class="' + healthClass + '">' + health + '</span>';

    let svcHtml = '';
    for (const [svc, info] of Object.entries(svcs)) {
      const cls = info.active ? 'online' : (info.state === 'failed' ? 'offline' : 'unknown');
      svcHtml += '<div class="dash-svc-item"><span class="badge ' + cls + '">' + esc(svc) + '</span><span class="dash-svc-state">' + esc(info.state) + '</span></div>';
    }
    $('dash-svc-list').innerHTML = svcHtml;
  } catch(e) {
    $('dash-svc-count').textContent = '?';
    $('dash-health').textContent = 'Unknown';
    $('dash-svc-list').innerHTML = '<div class="empty">Status unavailable</div>';
  }
}

function showSection(id, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  $('sec-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
  const titleEl = $('page-title');
  if (titleEl && _pageTitles[id]) titleEl.textContent = _pageTitles[id];
  // Close sidebar on mobile after navigation
  document.getElementById('app').classList.remove('sidebar-open');
  if (id === 'dashboard') loadDashboard();
  if (id === 'logs' && !es) startLogStream();
  if (id === 'notifications') loadNotifications();
}

async function api(path, opts) {
  const res = await fetch('/api' + path, opts);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt);
  }
  if (res.headers.get('content-type')?.includes('application/json')) return res.json();
  return res.text();
}

function badge(status) {
  const allowed = ['online', 'onbatt', 'offline', 'unknown'];
  const raw = (status || 'unknown').toLowerCase();
  const s = allowed.includes(raw) ? raw : 'unknown';
  return '<span class="badge ' + s + '">' + s + '</span>';
}

async function loadServiceStatus() {
  const el = $('service-status');
  if (!el) return;
  try {
    const r = await api('/service/status-detailed');
    let html = '<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">';
    html += '<span style="color:var(--muted);font-size:0.85rem;">Services:</span>';
    for (const [svc, info] of Object.entries(r)) {
      const cls = info.active ? 'online' : (info.state === 'failed' ? 'offline' : 'unknown');
      html += '<span class="badge ' + cls + '">' + esc(svc) + ': ' + esc(info.state) + '</span>';
    }
    html += '</div>';
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = '<span class="badge unknown">status unavailable</span>';
  }
}

async function loadUps() {
  const list = await api('/ups');
  const grid = $('ups-grid');
  if (!list.length) { grid.innerHTML = '<div class="empty">No UPS devices configured.</div>'; return; }
  grid.innerHTML = list.map(u => {
    const dirs = (u.directives || []).map(d => esc(d[0]+'='+d[1])).join(', ');
    return '<div class="card">' +
      '<h3>' + esc(u.name) + ' ' + badge(u.status) + '</h3>' +
      '<div class="meta">driver: ' + esc(u.driver || '-') + '</div>' +
      '<div class="meta">port: ' + esc(u.port || '-') + '</div>' +
      '<div class="meta">desc: ' + esc(u.desc || '-') + '</div>' +
      (dirs ? '<div class="meta">' + dirs + '</div>' : '') +
      '<div class="actions">' +
        '<button class="secondary" onclick="openUpsModal(' + JSON.stringify(u).replace(/"/g,'&quot;') + ')">Edit</button>' +
        '<button class="secondary" onclick="openHooksSection(' + JSON.stringify(u.name).replace(/"/g,'&quot;') + ')">Hooks</button>' +
        '<button class="secondary" data-ups-name="' + esc(u.name) + '" data-action="start">Start driver</button>' +
        '<button class="secondary" data-ups-name="' + esc(u.name) + '" data-action="stop">Stop driver</button>' +
        '<button class="secondary danger" data-ups-name="' + esc(u.name) + '" data-action="delete">Delete</button>' +
      '</div></div>';
  }).join('');
}

async function driverAction(name, action) {
  const key = name + '|' + action;
  if (_driverPending[key]) return;
  _driverPending[key] = true;
  try {
    if (!await showConfirm(action + ' driver for ' + name + '?')) return;
    const r = await api('/driver/' + encodeURIComponent(name) + '/' + action, {method:'POST'});
    const title = r.returncode === 0 ? 'Driver Result' : 'Driver Error';
    await showAlert('Driver ' + action + ': rc=' + r.returncode + '\n' + (r.stdout || '') + '\n' + (r.stderr || ''), title);
    loadUps();
    loadServiceStatus();
  } catch(e) {
    await showAlert('Driver ' + action + ' failed:\n' + e.message, 'Error');
  } finally {
    delete _driverPending[key];
  }
}

async function deleteUps(name) {
  const key = 'ups:' + name;
  if (_deletePending[key]) return;
  _deletePending[key] = true;
  try {
    if (!await showDangerConfirm('Delete UPS "' + name + '"? This will stop the driver and remove all configuration.')) return;
    await api('/ups/' + encodeURIComponent(name), {method:'DELETE'});
  } catch(e) {
    await showAlert('Failed to delete UPS:\n' + e.message, 'Error');
    return;
  } finally {
    delete _deletePending[key];
  }

  try {
    const list = await api('/ups');
    const r = list.length === 0
      ? await api('/service/restart-monitor', {method:'POST'})
      : await api('/service/restart-all', {method:'POST'});
    if (r.returncode !== 0) {
      showAlert('Service restart warning:\n' + (r.stderr || r.stdout || ''), 'Restart Warning');
    }
  } catch(e) {
    console.error('restart failed:', e);
    showAlert('Restart failed — changes may not be fully applied:\n' + e.message, 'Restart Error');
  }
  loadUps();
  loadServiceStatus();
}

function openUpsModal(u) {
  u = u || {};
  const edit = !!u.name;
  let defaultDirectives = '';
  if (!edit) {
    defaultDirectives = 'pollinterval=5';
  } else {
    defaultDirectives = (u.directives||[]).map(d=>d[0]+'='+d[1]).join('\n');
  }
  $('modal').innerHTML =
    '<h3>' + (edit ? 'Edit' : 'Add') + ' UPS</h3>' +
    '<div class="field"><label>Name</label><input id="u-name" value="' + esc(u.name||'') + '"' + (edit?' readonly':'') + '></div>' +
    '<div class="field"><label>Driver</label><input id="u-driver" value="' + esc(u.driver||'usbhid-ups') + '"></div>' +
    '<div class="field"><label>Port</label><input id="u-port" value="' + esc(u.port||'auto') + '"></div>' +
    '<div class="field"><label>Description</label><input id="u-desc" value="' + esc(u.desc||'') + '"></div>' +
    '<div class="field"><label>Extra directives (key=value per line)</label>' +
      '<textarea id="u-directives" oninput="upsCheckWarnings()" style="height:80px;font-family:var(--mono);background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:0.4rem;width:100%;resize:vertical;">' + esc(defaultDirectives) + '</textarea>' +
      '<div id="u-warning" style="color:var(--yellow);font-size:0.8rem;margin-top:0.25rem;display:none;">Warning: pollinterval lower than 5 may cause instability.</div></div>' +
    '<div class="modal-actions">' +
      '<button class="secondary" onclick="closeModal()">Cancel</button>' +
      '<button class="secondary" onclick="applyRecommendedConfig()">Apply Recommended Config</button>' +
      '<button class="primary" onclick="saveUps(' + edit + ')">Save</button>' +
    '</div>';
  $('modal-overlay').classList.add('open');
  upsCheckWarnings();
}

function upsCheckWarnings() {
  const dirs = $('u-directives').value;
  const m = dirs.match(/^\s*pollinterval\s*=\s*(\d+)/m);
  const el = $('u-warning');
  if (el) {
    el.style.display = (m && parseInt(m[1],10) < 5) ? 'block' : 'none';
  }
}

function applyRecommendedConfig() {
  const map = {};
  $('u-directives').value.split('\n').forEach(line => {
    const idx = line.indexOf('=');
    if (idx > 0) map[line.slice(0,idx).trim()] = line.slice(idx+1).trim();
  });
  if (!map.pollinterval) map.pollinterval = '5';
  $('u-directives').value = Object.entries(map).map(e => e[0]+'='+e[1]).join('\n');
  upsCheckWarnings();
}

async function saveUps(edit) {
  if (_upsSavePending) return;
  _upsSavePending = true;
  try {
    const name = $('u-name').value.trim();
    const dirsText = $('u-directives').value;
    const m = dirsText.match(/^\s*pollinterval\s*=\s*(\d+)/m);
    if (m && parseInt(m[1],10) < 5) {
      if (!await showConfirm('pollinterval is set to ' + m[1] + ', which is lower than the recommended 5. Continue anyway?')) return;
    }
    const body = {
      driver: $('u-driver').value.trim(),
      port: $('u-port').value.trim(),
      desc: $('u-desc').value.trim(),
      directives: {}
    };
    $('u-directives').value.split('\n').forEach(line => {
      const idx = line.indexOf('=');
      if (idx > 0) body.directives[line.slice(0,idx).trim()] = line.slice(idx+1).trim();
    });
    if (edit) {
      await api('/ups/' + encodeURIComponent(name), {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
    } else {
      body.name = name;
      await api('/ups', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
    }
    closeModal(); loadUps(); loadServiceStatus();
    showRestartDriverModal(name);
  } catch(e) {
    await showAlert('Failed to save UPS:\n' + e.message, 'Error');
  } finally {
    _upsSavePending = false;
  }
}

function showRestartDriverModal(name) {
  $('modal').innerHTML =
    '<h3>UPS Saved</h3>' +
    '<p>Configuration saved for <strong>' + esc(name) + '</strong>.</p>' +
    '<p>Restart services and driver to apply changes immediately?</p>' +
    '<div class="modal-actions">' +
      '<button class="secondary" onclick="closeModal()">Close</button>' +
      '<button class="primary" onclick="restartAllThenDriver(' + JSON.stringify(name).replace(/"/g, '&quot;') + ')">Restart Driver</button>' +
    '</div>';
  $('modal-overlay').classList.add('open');
}

async function restartAllThenDriver(name) {
  if (_restartPending) return;
  _restartPending = true;
  $('modal').innerHTML = '<h3>Restarting...</h3><p>Please wait...</p>';
  let msg = '';
  try {
    const r1 = await api('/service/restart-all', {method:'POST'});
    if (r1.returncode !== 0) {
      msg += 'Service restart warning:\n' + (r1.stderr || r1.stdout || 'Unknown error') + '\n\n';
    }
  } catch(e) {
    msg += 'Service restart failed:\n' + e.message + '\n\n';
  }
  try {
    const r2 = await api('/driver/' + encodeURIComponent(name) + '/restart', {method:'POST'});
    msg += 'Driver restart: rc=' + r2.returncode + '\n' + (r2.stdout || '') + '\n' + (r2.stderr || '');
  } catch(e) {
    msg += 'Driver restart failed:\n' + e.message;
  }
  closeModal();
  try {
    await showAlert(msg, 'Restart Result');
    loadUps();
    loadServiceStatus();
  } finally {
    _restartPending = false;
  }
}

async function scanUps() {
  $('modal').innerHTML = '<h3>Scanning USB...</h3><div class="scan-output">Running nut-scanner -U...</div>';
  $('modal-overlay').classList.add('open');
  try {
    const r = await api('/ups/scan', {method:'POST'});
    const devices = r.devices || [];
    if (r.returncode !== 0 && !devices.length) {
      $('modal').innerHTML =
        '<h3>USB Scan Failed</h3>' +
        '<div class="scan-output">' + esc(r.stderr || 'Unknown error') + '</div>' +
        '<div class="modal-actions"><button class="secondary" onclick="closeModal()">Close</button></div>';
      return;
    }
    if (!devices.length) {
      $('modal').innerHTML =
        '<h3>USB Scan Result</h3>' +
        '<p class="empty">No USB UPS devices detected.</p>' +
        (r.stderr ? '<div class="scan-output">' + esc(r.stderr) + '</div>' : '') +
        '<div class="modal-actions"><button class="secondary" onclick="closeModal()">Close</button></div>';
      return;
    }
    let html = '<h3>Detected UPS Devices</h3>';
    devices.forEach((d, i) => {
      const extras = Object.entries(d.extra || {});
      html += '<div class="card" style="margin-bottom:0.75rem">' +
        '<h3>' + esc(d.scanner_name) + '</h3>' +
        (d.desc ? '<div class="meta">desc: ' + esc(d.desc) + '</div>' : '') +
        '<div class="meta">driver: ' + esc(d.driver || '-') + '</div>' +
        '<div class="meta">port: ' + esc(d.port || '-') + '</div>' +
        (d.vendorid ? '<div class="meta">vendorid: ' + esc(d.vendorid) + '</div>' : '') +
        (d.productid ? '<div class="meta">productid: ' + esc(d.productid) + '</div>' : '') +
        extras.map(e => '<div class="meta">' + esc(e[0]) + ': ' + esc(e[1]) + '</div>').join('') +
        '<div class="actions"><button class="primary" onclick="addScannedUps(' + i + ')">Add to NUT</button></div>' +
      '</div>';
    });
    html += '<details style="margin-top:0.75rem"><summary style="cursor:pointer;color:var(--muted);font-size:0.85rem">Raw output</summary>' +
      '<div class="scan-output">' + esc(r.stdout || '(no stdout)') + '\n' + esc(r.stderr || '') + '</div></details>' +
      '<div class="modal-actions"><button class="secondary" onclick="closeModal()">Close</button></div>';
    window._scanDevices = devices;
    $('modal').innerHTML = html;
  } catch (e) {
    $('modal').innerHTML = '<h3>Error</h3><div class="scan-output">' + esc(e.message) + '</div><div class="modal-actions"><button class="secondary" onclick="closeModal()">Close</button></div>';
  }
}

function addScannedUps(index) {
  const d = window._scanDevices[index];
  if (!d) return;
  const map = {};
  Object.entries(d.extra || {}).forEach(e => map[e[0]] = e[1]);
  if (d.vendorid) map.vendorid = d.vendorid;
  if (d.productid) map.productid = d.productid;
  if (!map.pollinterval) map.pollinterval = '5';
  const directives = Object.entries(map).map(e => e[0]+'='+e[1]).join('\n');
  $('modal').innerHTML =
    '<h3>Add Scanned UPS</h3>' +
    '<div class="field"><label>Name</label><input id="u-name" value="' + esc(d.scanner_name) + '"></div>' +
    '<div class="field"><label>Driver</label><input id="u-driver" value="' + esc(d.driver || 'usbhid-ups') + '"></div>' +
    '<div class="field"><label>Port</label><input id="u-port" value="' + esc(d.port || 'auto') + '"></div>' +
    '<div class="field"><label>Description</label><input id="u-desc" value="' + esc(d.desc || '') + '"></div>' +
    '<div class="field"><label>Extra directives (key=value per line)</label>' +
      '<textarea id="u-directives" oninput="upsCheckWarnings()" style="height:80px;font-family:var(--mono);background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:0.4rem;width:100%;resize:vertical;">' +
      esc(directives) +
      '</textarea>' +
      '<div id="u-warning" style="color:var(--yellow);font-size:0.8rem;margin-top:0.25rem;display:none;">Warning: pollinterval lower than 5 may cause instability.</div></div>' +
    '<div class="modal-actions">' +
      '<button class="secondary" onclick="closeModal()">Cancel</button>' +
      '<button class="secondary" onclick="applyRecommendedConfig()">Apply Recommended Config</button>' +
      '<button class="primary" onclick="saveUpsScanned()">Add UPS</button>' +
    '</div>';
  $('modal-overlay').classList.add('open');
  upsCheckWarnings();
}

async function saveUpsScanned() {
  await saveUps(false);
}

async function loadUsers() {
  const list = await api('/users');
  const tbody = $('users-body');
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty">No users.</td></tr>'; return; }
  tbody.innerHTML = list.map(u =>
    '<tr>' +
      '<td>' + esc(u.name) + '</td>' +
      '<td>' + esc(u.upsmon || '-') + '</td>' +
      '<td>' + esc(u.password) + '</td>' +
      '<td>' + esc(u.actions || '-') + '</td>' +
      '<td>' + esc(u.instcmds || '-') + '</td>' +
      '<td>' +
        '<button class="secondary" onclick="openUserModal(' + JSON.stringify(u).replace(/"/g,'&quot;') + ')">Edit</button>' +
        '<button class="secondary danger" data-user-name="' + esc(u.name) + '">Delete</button>' +
      '</td>' +
    '</tr>'
  ).join('');
}

async function deleteUser(name) {
  const key = 'user:' + name;
  if (_deletePending[key]) return;
  _deletePending[key] = true;
  try {
    if (!await showDangerConfirm('Delete user "' + name + '"?')) return;
    await api('/users/' + encodeURIComponent(name), {method:'DELETE'});
    loadUsers();
  } catch(e) {
    await showAlert('Failed to delete user:\n' + e.message, 'Error');
  } finally {
    delete _deletePending[key];
  }
}

function openUserModal(u) {
  u = u || {};
  const edit = !!u.name;
  $('modal').innerHTML =
    '<h3>' + (edit ? 'Edit' : 'Add') + ' User</h3>' +
    '<div class="field"><label>Username</label><input id="usr-name" value="' + esc(u.name||'') + '"' + (edit?' readonly':'') + '></div>' +
    '<div class="field"><label>Password ' + (edit?'(leave blank to keep current)':'') + '</label><input id="usr-pass" type="password" placeholder="******"></div>' +
    '<div class="field"><label>upsmon</label><input id="usr-upsmon" value="' + esc(u.upsmon||'') + '" placeholder="master / slave"></div>' +
    '<div class="field"><label>Actions</label><input id="usr-actions" value="' + esc(u.actions||'') + '" placeholder="SET"></div>' +
    '<div class="field"><label>Instcmds</label><input id="usr-instcmds" value="' + esc(u.instcmds||'') + '" placeholder="ALL"></div>' +
    '<div class="modal-actions">' +
      '<button class="secondary" onclick="closeModal()">Cancel</button>' +
      '<button class="primary" onclick="saveUser(' + edit + ')">Save</button>' +
    '</div>';
  $('modal-overlay').classList.add('open');
}

async function saveUser(edit) {
  if (_userSavePending) return;
  _userSavePending = true;
  try {
    const name = $('usr-name').value.trim();
    const body = {};
    const pass = $('usr-pass').value;
    if (pass) body.password = pass;
    const upsmon = $('usr-upsmon').value.trim(); if (upsmon) body.upsmon = upsmon;
    const actions = $('usr-actions').value.trim(); if (actions) body.actions = actions;
    const instcmds = $('usr-instcmds').value.trim(); if (instcmds) body.instcmds = instcmds;
    if (edit) {
      await api('/users/' + encodeURIComponent(name), {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
    } else {
      if (!pass) { await showAlert('Password is required for new users', 'Validation Error'); return; }
      body.name = name;
      body.password = pass;
      await api('/users', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
    }
    closeModal(); loadUsers();
  } catch(e) {
    await showAlert('Failed to save user:\n' + e.message, 'Error');
  } finally {
    _userSavePending = false;
  }
}

function startLogStream() {
  if (es) return;
  const box = $('log-box');
  es = new EventSource('/api/logs/stream');
  es.onmessage = ev => {
    if (logPaused) return;
    const line = document.createElement('div');
    line.className = 'log-line';
    const text = ev.data;
    if (/\berror\b|\bfail\b|\berr\b/i.test(text)) line.classList.add('error');
    else if (/\bwarn\b|\bwarning\b/i.test(text)) line.classList.add('warn');
    else if (/\binfo\b|\bstarted\b|\brunning\b/i.test(text)) line.classList.add('info');
    line.textContent = text;
    box.appendChild(line);
    while (box.children.length > MAX_LOG_LINES) box.removeChild(box.firstChild);
    if ($('log-autoscroll').checked) box.scrollTop = box.scrollHeight;
  };
  es.onerror = () => {
    const line = document.createElement('div');
    line.className = 'log-line error';
    line.textContent = '--- Log stream disconnected ---';
    box.appendChild(line);
    es.close(); es = null;
  };
}

function toggleLogPause() {
  logPaused = !logPaused;
  $('log-pause').textContent = logPaused ? 'Resume' : 'Pause';
}

async function loadRecentLogs() {
  const r = await api('/logs/recent?lines=100');
  const box = $('log-box');
  box.innerHTML = '';
  r.stdout.split('\n').forEach(text => {
    if (!text) return;
    const line = document.createElement('div');
    line.className = 'log-line';
    if (/\berror\b|\bfail\b|\berr\b/i.test(text)) line.classList.add('error');
    else if (/\bwarn\b|\bwarning\b/i.test(text)) line.classList.add('warn');
    else if (/\binfo\b|\bstarted\b|\brunning\b/i.test(text)) line.classList.add('info');
    line.textContent = text;
    box.appendChild(line);
    while (box.children.length > MAX_LOG_LINES) box.removeChild(box.firstChild);
  });
  if ($('log-autoscroll').checked) box.scrollTop = box.scrollHeight;
}

async function loadConfig(filename) {
  currentConfigFile = filename;
  $('config-filename').textContent = filename;
  const data = await api('/config/' + encodeURIComponent(filename));
  $('config-editor').value = data;
  $('config-editor').readOnly = filename === 'upsd.users';
}

async function saveConfig() {
  if (!currentConfigFile) { await showAlert('No config loaded', 'Error'); return; }
  if (currentConfigFile === 'upsd.users') { await showAlert('upsd.users is read-only', 'Error'); return; }
  const body = $('config-editor').value;
  try {
    await api('/config/' + encodeURIComponent(currentConfigFile), {method:'PUT', body});
    await showAlert('Saved ' + currentConfigFile, 'Config Saved');
  } catch(e) {
    await showAlert('Failed to save config:\n' + e.message, 'Error');
  }
}

function closeModal() {
  $('modal-overlay').classList.remove('open');
  $('modal').innerHTML = '';
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-ups-name]');
  if (!btn) return;
  var name = btn.dataset.upsName;
  var action = btn.dataset.action;
  if (action === 'delete') { deleteUps(name); }
  else { driverAction(name, action); }
});

document.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-user-name]');
  if (!btn) return;
  var name = btn.dataset.userName;
  deleteUser(name);
});

let _notificationsSavePending = false;
const NOTIFICATION_EVENTS = ['ONLINE','ONBATT','LOWBATT','COMMOK','COMMBAD','SHUTDOWN','REPLBATT','NOCOMM','NOPARENT'];

async function loadNotifications() {
  const container = $('notifications-form');
  try {
    const cfg = await api('/upsmon/config');
    const upsList = await api('/ups');
    const upsNames = upsList.map(u => u.name);
    _cachedUpsNames = upsNames;
    let html = '';

    // Monitor lines
    html += '<h3>Monitor Lines</h3>';
    html += '<div id="notify-monitors-wrap"><table id="notify-monitors-table"><thead><tr><th>UPS Name</th><th>Host</th><th>Power</th><th>Username</th><th>Password</th><th>Role</th><th></th></tr></thead><tbody id="notify-monitors-body">';
    if (cfg.monitors && cfg.monitors.length) {
      cfg.monitors.forEach((m, idx) => {
        html += monitorRowHtml(idx, m, upsNames);
      });
    }
    html += '</tbody></table></div>';
    html += '<div class="toolbar" style="margin-top:0.75rem;">';
    html += '<button class="secondary" onclick="addMonitorRow()">Add Monitor</button>';
    html += '</div>';

    // Global commands
    html += '<h3>Global Commands</h3>';
    html += '<div class="field"><label>MINSUPPLIES</label><input type="number" min="0" id="n-minsupplies" value="' + esc(cfg.minsupplies != null ? cfg.minsupplies : 1) + '"></div>';
    html += '<div class="field"><label>SHUTDOWNCMD</label><input id="n-shutdowncmd" value="' + esc(cfg.shutdowncmd || '') + '"></div>';
    html += '<div class="field"><label>NOTIFYCMD</label><input id="n-notifycmd" value="' + esc(cfg.notifycmd || '') + '"></div>';
    html += '<div class="field"><label>POWERDOWNFLAG</label><input id="n-powerdownflag" value="' + esc(cfg.powerdownflag || '') + '"></div>';

    // Timing parameters
    html += '<h3>Timing Parameters</h3>';
    html += '<div class="field-grid">';
    ['POLLFREQ','POLLFREQALERT','HOSTSYNC','DEADTIME','RBWARNTIME','NOCOMMWARNTIME','FINALDELAY'].forEach(key => {
      html += '<div class="field"><label>' + key + '</label><input type="number" min="1" id="n-timing-' + key + '" value="' + esc((cfg.timing && cfg.timing[key] != null ? cfg.timing[key] : '')) + '"></div>';
    });
    html += '</div>';

    // Notification messages & flags
    html += '<h3>Notification Messages &amp; Flags</h3>';
    html += '<div id="notify-events-wrap">';
    html += '<table id="notify-events-table"><thead><tr><th>Event</th><th>Message</th><th>SYSLOG</th><th>WALL</th><th>EXEC</th><th>IGNORE</th></tr></thead><tbody>';
    NOTIFICATION_EVENTS.forEach(evt => {
      const msg = (cfg.notify_msg && cfg.notify_msg[evt]) || '';
      const flags = (cfg.notify_flag && cfg.notify_flag[evt]) || [];
      html += '<tr>';
      html += '<td>' + esc(evt) + '</td>';
      html += '<td><input id="n-msg-' + evt + '" value="' + esc(msg) + '"></td>';
      ['SYSLOG','WALL','EXEC','IGNORE'].forEach(flag => {
        const checked = flags.includes(flag) ? 'checked' : '';
        html += '<td style="text-align:center;"><input type="checkbox" id="n-flag-' + evt + '-' + flag + '" ' + checked + ' onchange="flaggedOnly(this)"></td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    html += '</div>';

    // Hook info box
    html += '<div class="info-box" style="margin-top:1rem;font-size:0.9rem;">';
    html += '<p>A sample notify script is installed at <code>/etc/nut/notifycmd.sh</code>. It logs all UPS events and runs optional hook scripts placed in <code>/etc/nut/notify.d/</code>:</p>';
    html += '<ul><li><code>/etc/nut/notify.d/&lt;EVENT&gt;.sh</code> -- runs for a specific event from any UPS.</li>';
    html += '<li><code>/etc/nut/notify.d/&lt;UPSNAME&gt;_&lt;EVENT&gt;.sh</code> -- runs for a specific UPS + event.</li></ul>';
    html += '<p>To shut down another machine when UPS goes on battery, create a hook like: <code>/etc/nut/notify.d/myups_ONBATT.sh</code> containing <code>ssh root@other-machine shutdown -h now</code>.</p>';
    html += '</div>';

    container.innerHTML = html;
  } catch(e) {
    container.innerHTML = '<div class="empty">Failed to load notifications config: ' + esc(e.message) + '</div>';
  }
}

function monitorRowHtml(idx, m, upsNames) {
  let select = '<select id="n-mon-' + idx + '-upsname">';
  upsNames.forEach(name => {
    select += '<option value="' + esc(name) + '"' + (name === m.upsname ? ' selected' : '') + '>' + esc(name) + '</option>';
  });
  select += '</select>';
  return '<tr data-mon-idx="' + idx + '">' +
    '<td>' + select + '</td>' +
    '<td><input id="n-mon-' + idx + '-hostspec" value="' + esc(m.hostspec || '@localhost') + '"></td>' +
    '<td><input type="number" min="0" id="n-mon-' + idx + '-power" value="' + esc(m.power) + '"></td>' +
    '<td><input id="n-mon-' + idx + '-username" value="' + esc(m.username) + '"></td>' +
    '<td><input id="n-mon-' + idx + '-password" value="' + esc(m.password) + '" placeholder="******"></td>' +
    '<td><select id="n-mon-' + idx + '-role"><option value="master"' + (m.role==='master'?' selected':'') + '>master</option><option value="slave"' + (m.role==='slave'?' selected':'') + '>slave</option></select></td>' +
    '<td><button class="secondary danger" onclick="removeMonitorRow(this)">Remove</button></td>' +
    '</tr>';
}

function addMonitorRow() {
  const tbody = $('notify-monitors-body');
  if (!tbody) return;
  const idx = tbody.querySelectorAll('tr').length;
  const firstSelect = tbody.querySelector('select');
  let upsNames = firstSelect ? Array.from(firstSelect.options).map(o => o.value) : [];
  if (!upsNames.length) upsNames = _cachedUpsNames;
  const row = document.createElement('tr');
  row.setAttribute('data-mon-idx', idx);
  let select = '<select id="n-mon-' + idx + '-upsname">';
  upsNames.forEach(name => { select += '<option value="' + esc(name) + '">' + esc(name) + '</option>'; });
  select += '</select>';
  row.innerHTML =
    '<td>' + select + '</td>' +
    '<td><input id="n-mon-' + idx + '-hostspec" value="@localhost"></td>' +
    '<td><input type="number" min="0" id="n-mon-' + idx + '-power" value="1"></td>' +
    '<td><input id="n-mon-' + idx + '-username" value=""></td>' +
    '<td><input id="n-mon-' + idx + '-password" value=""></td>' +
    '<td><select id="n-mon-' + idx + '-role"><option value="master">master</option><option value="slave">slave</option></select></td>' +
    '<td><button class="secondary danger" onclick="removeMonitorRow(this)">Remove</button></td>';
  tbody.appendChild(row);
}

function removeMonitorRow(btn) {
  const row = btn.closest('tr');
  if (row) row.remove();
}

function flaggedOnly(checkbox) {
  const id = checkbox.id;
  const evt = id.split('-')[2];
  const flag = id.split('-')[3];
  if (flag === 'IGNORE' && checkbox.checked) {
    ['SYSLOG','WALL','EXEC'].forEach(f => {
      const cb = $('n-flag-' + evt + '-' + f);
      if (cb) { cb.checked = false; cb.disabled = true; }
    });
  } else if (flag === 'IGNORE' && !checkbox.checked) {
    ['SYSLOG','WALL','EXEC'].forEach(f => {
      const cb = $('n-flag-' + evt + '-' + f);
      if (cb) cb.disabled = false;
    });
  } else if (flag !== 'IGNORE' && checkbox.checked) {
    const ign = $('n-flag-' + evt + '-IGNORE');
    if (ign) { ign.checked = false; ign.disabled = false; }
    // enable other non-ignore checkboxes
    ['SYSLOG','WALL','EXEC'].forEach(f => {
      const cb = $('n-flag-' + evt + '-' + f);
      if (cb) cb.disabled = false;
    });
  }
}

async function saveNotifications() {
  if (_notificationsSavePending) return;
  _notificationsSavePending = true;
  try {
    const monitors = [];
    const tbody = $('notify-monitors-body');
    if (tbody) {
      tbody.querySelectorAll('tr').forEach(row => {
        const idx = row.getAttribute('data-mon-idx');
        monitors.push({
          upsname: $('n-mon-' + idx + '-upsname').value.trim(),
          hostspec: $('n-mon-' + idx + '-hostspec').value.trim(),
          power: parseInt($('n-mon-' + idx + '-power').value, 10) || 0,
          username: $('n-mon-' + idx + '-username').value.trim(),
          password: $('n-mon-' + idx + '-password').value.trim(),
          role: $('n-mon-' + idx + '-role').value,
        });
      });
    }

    const timing = {};
    ['POLLFREQ','POLLFREQALERT','HOSTSYNC','DEADTIME','RBWARNTIME','NOCOMMWARNTIME','FINALDELAY'].forEach(key => {
      const val = parseInt($('n-timing-' + key).value, 10);
      if (!isNaN(val) && val > 0) timing[key] = val;
    });

    const notify_msg = {};
    const notify_flag = {};
    NOTIFICATION_EVENTS.forEach(evt => {
      const msg = $('n-msg-' + evt).value.trim();
      if (msg) notify_msg[evt] = msg;
      const flags = [];
      ['SYSLOG','WALL','EXEC','IGNORE'].forEach(flag => {
        if ($('n-flag-' + evt + '-' + flag).checked) flags.push(flag);
      });
      if (flags.length) notify_flag[evt] = flags;
    });

    const minsuppliesVal = parseInt($('n-minsupplies').value, 10);
    const body = {
      monitors: monitors,
      minsupplies: isNaN(minsuppliesVal) ? 1 : minsuppliesVal,
      shutdowncmd: $('n-shutdowncmd').value.trim() || null,
      notifycmd: $('n-notifycmd').value.trim() || null,
      powerdownflag: $('n-powerdownflag').value.trim() || null,
      notify_msg: notify_msg,
      notify_flag: notify_flag,
      timing: timing,
    };

    await api('/upsmon/config', {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
    await showAlert('Notifications configuration saved.', 'Saved');
    showRestartMonitorModal();
  } catch(e) {
    await showAlert('Failed to save notifications:\n' + e.message, 'Error');
  } finally {
    _notificationsSavePending = false;
  }
}

function showRestartMonitorModal() {
  $('modal').innerHTML =
    '<h3>Notifications Saved</h3>' +
    '<p>Configuration saved successfully.</p>' +
    '<p>Restart nut-monitor to apply changes immediately?</p>' +
    '<div class="modal-actions">' +
      '<button class="secondary" onclick="closeModal()">Close</button>' +
      '<button class="primary" onclick="restartMonitorThenClose()">Restart nut-monitor</button>' +
    '</div>';
  $('modal-overlay').classList.add('open');
}

async function restartMonitorThenClose() {
  closeModal();
  try {
    const r = await api('/service/restart-monitor', {method:'POST'});
    if (r.returncode !== 0) {
      await showAlert('Restart warning:\n' + (r.stderr || r.stdout || ''), 'Restart Warning');
    } else {
      await showAlert('nut-monitor restarted successfully.', 'Restarted');
    }
    loadServiceStatus();
  } catch(e) {
    await showAlert('Restart failed:\n' + e.message, 'Restart Error');
  }
}

let _hooksSavePending = false;
let _currentHooksUps = '';
let _cachedUpsNames = [];

function openHooksSection(upsname) {
  _currentHooksUps = upsname;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  $('sec-hooks').classList.add('active');
  $('hooks-ups-title').textContent = 'Hooks for: ' + esc(upsname);
  loadHooksTable(upsname);
}

function closeHooksSection() {
  const btn = document.querySelector('nav button[onclick*="showSection(\'ups\'"]');
  showSection('ups', btn);
}

async function loadHooksTable(upsname) {
  const tbody = $('hooks-body');
  tbody.innerHTML = '';
  let hookEvents = [];
  try {
    const r = await api('/hooks/' + encodeURIComponent(upsname));
    hookEvents = r.hooks || [];
  } catch(e) {
    hookEvents = [];
  }
  for (const evt of NOTIFICATION_EVENTS) {
    const tr = document.createElement('tr');
    const hasHook = hookEvents.includes(evt);
    tr.innerHTML =
      '<td>' + esc(evt) + '</td>' +
      '<td>' + (hasHook ? '<span class="badge online">yes</span>' : '<span class="badge unknown">no</span>') + '</td>' +
      '<td>' +
        (hasHook
          ? '<button class="secondary" onclick="openHookEditor(' + JSON.stringify(upsname).replace(/"/g,'&quot;') + ',' + JSON.stringify(evt).replace(/"/g,'&quot;') + ')">Edit</button>' +
            '<button class="secondary danger" onclick="deleteHook(' + JSON.stringify(upsname).replace(/"/g,'&quot;') + ',' + JSON.stringify(evt).replace(/"/g,'&quot;') + ')">Delete</button>'
          : '<button class="secondary" onclick="openHookEditor(' + JSON.stringify(upsname).replace(/"/g,'&quot;') + ',' + JSON.stringify(evt).replace(/"/g,'&quot;') + ')">Add Hook</button>'
        ) +
      '</td>';
    tbody.appendChild(tr);
  }
}

async function openHookEditor(upsname, event) {
  let content = '';
  try {
    const r = await api('/hooks/' + encodeURIComponent(upsname) + '/' + event);
    content = r.content || '';
  } catch(e) {
    content = '';
  }
  $('modal').innerHTML =
    '<h3>' + (content ? 'Edit' : 'Add') + ' Hook</h3>' +
    '<div class="field"><label>UPS</label><input readonly value="' + esc(upsname) + '"></div>' +
    '<div class="field"><label>Event</label><input readonly value="' + esc(event) + '"></div>' +
    '<div class="field"><label>Script</label>' +
      '<textarea id="hook-script" class="script-editor" placeholder="#!/bin/bash\n# This script runs when ' + esc(event) + ' fires for ' + esc(upsname) + '.\n# Environment: $UPSNAME, $NOTIFYTYPE\n">' + esc(content) + '</textarea></div>' +
    '<div class="modal-actions">' +
      '<button class="secondary" onclick="closeModal()">Cancel</button>' +
      '<button class="primary" onclick="saveHook(' + JSON.stringify(upsname).replace(/"/g,'&quot;') + ',' + JSON.stringify(event).replace(/"/g,'&quot;') + ')">Save</button>' +
    '</div>';
  $('modal-overlay').classList.add('open');
  // Trap Tab key in textarea
  $('hook-script').addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = this.selectionStart;
      const end = this.selectionEnd;
      this.value = this.value.substring(0, start) + '\t' + this.value.substring(end);
      this.selectionStart = this.selectionEnd = start + 1;
    }
  });
}

async function saveHook(upsname, event) {
  if (_hooksSavePending) return;
  _hooksSavePending = true;
  try {
    const content = $('hook-script').value;
    await api('/hooks/' + encodeURIComponent(upsname) + '/' + event, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({content: content})
    });
    closeModal();
    loadHooksTable(upsname);
  } catch(e) {
    await showAlert('Failed to save hook:\n' + e.message, 'Error');
  } finally {
    _hooksSavePending = false;
  }
}

async function deleteHook(upsname, event) {
  if (!await showDangerConfirm('Delete hook for ' + upsname + ' on ' + event + '?')) return;
  try {
    await api('/hooks/' + encodeURIComponent(upsname) + '/' + event, {method: 'DELETE'});
    loadHooksTable(upsname);
  } catch(e) {
    await showAlert('Failed to delete hook:\n' + e.message, 'Error');
  }
}

loadDashboard();
loadUps();
loadUsers();
loadNotifications();
loadServiceStatus();
startLogStream();

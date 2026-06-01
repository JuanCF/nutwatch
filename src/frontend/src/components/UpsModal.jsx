import { useState, useRef, useCallback } from 'react';
import { api } from '../api';
import { useConfirm } from './ConfirmDialog';
import { useModal } from './Modal';

export default function UpsModal({ mode, ups, scanData, onSaved }) {
  const [name, setName] = useState(scanData ? scanData.scanner_name : (ups ? ups.name : ''));
  const [driver, setDriver] = useState(scanData ? (scanData.driver || 'usbhid-ups') : (ups ? ups.driver : 'usbhid-ups'));
  const [port, setPort] = useState(scanData ? (scanData.port || 'auto') : (ups ? ups.port : 'auto'));
  const [desc, setDesc] = useState(scanData ? (scanData.desc || '') : (ups ? ups.desc || '' : ''));
  const [directives, setDirectives] = useState(() => {
    if (scanData) {
      const map = {};
      Object.entries(scanData.extra || {}).forEach(e => map[e[0]] = e[1]);
      if (scanData.vendorid) map.vendorid = scanData.vendorid;
      if (scanData.productid) map.productid = scanData.productid;
      if (!map.pollinterval) map.pollinterval = '5';
      return Object.entries(map).map(e => e[0] + '=' + e[1]).join('\n');
    }
    if (ups) return (ups.directives || []).map(d => d[0] + '=' + d[1]).join('\n');
    return 'pollinterval=5';
  });
  const [showRestart, setShowRestart] = useState(false);
  const savePending = useRef(false);
  const { confirm, alert } = useConfirm();
  const { closeModal } = useModal();

  const isEdit = mode === 'edit';
  const pollintervalMatch = directives.match(/^\s*pollinterval\s*=\s*(\d+)/m);
  const showPollWarning = pollintervalMatch && parseInt(pollintervalMatch[1], 10) < 5;

  const applyRecommended = useCallback(() => {
    const map = {};
    directives.split('\n').forEach(line => {
      const idx = line.indexOf('=');
      if (idx > 0) map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    });
    if (!map.pollinterval) map.pollinterval = '5';
    setDirectives(Object.entries(map).map(e => e[0] + '=' + e[1]).join('\n'));
  }, [directives]);

  async function handleSave() {
    if (savePending.current) return;
    if (pollintervalMatch && parseInt(pollintervalMatch[1], 10) < 5) {
      const ok = await confirm(`pollinterval is set to ${pollintervalMatch[1]}, which is lower than the recommended 5. Continue anyway?`);
      if (!ok) return;
    }
    savePending.current = true;
    try {
      const dirs = {};
      directives.split('\n').forEach(line => {
        const idx = line.indexOf('=');
        if (idx > 0) dirs[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      });
      const body = { driver, port, desc, directives: dirs };
      const trimmedName = name.trim();
      if (isEdit) {
        await api('/ups/' + encodeURIComponent(trimmedName), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        body.name = trimmedName;
        await api('/ups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      setShowRestart(true);
    } catch (e) {
      await alert('Failed to save UPS:\n' + e.message, 'Error');
    } finally {
      savePending.current = false;
    }
  }

  async function handleRestart() {
    const trimmedName = name.trim();
    let msg = '';
    try {
      const r1 = await api('/service/restart-all', { method: 'POST' });
      if (r1.returncode !== 0) msg += 'Service restart warning:\n' + (r1.stderr || r1.stdout || 'Unknown error') + '\n\n';
    } catch (e) { msg += 'Service restart failed:\n' + e.message + '\n\n'; }
    try {
      const r2 = await api('/driver/' + encodeURIComponent(trimmedName) + '/restart', { method: 'POST' });
      msg += 'Driver restart: rc=' + r2.returncode + '\n' + (r2.stdout || '') + '\n' + (r2.stderr || '');
    } catch (e) { msg += 'Driver restart failed:\n' + e.message; }
    onSaved();
    await alert(msg, 'Restart Result');
  }

  if (showRestart) {
    return (
      <>
        <h3>UPS Saved</h3>
        <p>Configuration saved for <strong>{name}</strong>.</p>
        <p>Restart services and driver to apply changes immediately?</p>
        <div className="modal-actions">
          <button className="secondary" onClick={onSaved}>Close</button>
          <button className="primary" onClick={handleRestart}>Restart Driver</button>
        </div>
      </>
    );
  }

  return (
    <>
      <h3>{isEdit ? 'Edit' : 'Add'} UPS</h3>
      <div className="field">
        <label>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} readOnly={isEdit} />
      </div>
      <div className="field">
        <label>Driver</label>
        <input value={driver} onChange={e => setDriver(e.target.value)} />
      </div>
      <div className="field">
        <label>Port</label>
        <input value={port} onChange={e => setPort(e.target.value)} />
      </div>
      <div className="field">
        <label>Description</label>
        <input value={desc} onChange={e => setDesc(e.target.value)} />
      </div>
      <div className="field">
        <label>Extra directives (key=value per line)</label>
        <textarea
          value={directives}
          onChange={e => setDirectives(e.target.value)}
          style={{ height: '80px', fontFamily: 'var(--mono)', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.4rem', width: '100%', resize: 'vertical' }}
        />
        {showPollWarning && <div style={{ color: 'var(--yellow)', fontSize: '0.8rem', marginTop: '0.25rem' }}>Warning: pollinterval lower than 5 may cause instability.</div>}
      </div>
      <div className="modal-actions">
        <button className="secondary" onClick={closeModal}>Cancel</button>
        <button className="secondary" onClick={applyRecommended}>Apply Recommended Config</button>
        <button className="primary" onClick={handleSave}>Save</button>
      </div>
    </>
  );
}

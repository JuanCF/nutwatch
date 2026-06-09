import { useState, useRef, useCallback } from 'react';
import { api } from '../api';
import { API, DEFAULTS, POLL_INTERVAL_MIN } from '../constants';
import { parseDirectives, formatDirectives } from '../utils/directives';
import { useConfirm } from './ConfirmDialog';
import { useModal } from './Modal';

export default function UpsModal({ mode, ups, scanData, onSaved }) {
  const [name, setName] = useState(scanData ? scanData.scanner_name : (ups ? ups.name : ''));
  const [driver, setDriver] = useState(scanData ? (scanData.driver || DEFAULTS.DRIVER) : (ups ? ups.driver : DEFAULTS.DRIVER));
  const [port, setPort] = useState(scanData ? (scanData.port || DEFAULTS.PORT) : (ups ? ups.port : DEFAULTS.PORT));
  const [desc, setDesc] = useState(scanData ? (scanData.desc || '') : (ups ? ups.desc || '' : ''));
  const [directives, setDirectives] = useState(() => {
    if (scanData) {
      const map = {};
      Object.entries(scanData.extra || {}).forEach(e => map[e[0]] = e[1]);
      if (scanData.vendorid) map.vendorid = scanData.vendorid;
      if (scanData.productid) map.productid = scanData.productid;
      if (!map.pollinterval) map.pollinterval = DEFAULTS.POLL_INTERVAL;
      return formatDirectives(map);
    }
    if (ups) return formatDirectives(Object.fromEntries(ups.directives || []));
    return 'pollinterval=' + DEFAULTS.POLL_INTERVAL;
  });
  const [showRestart, setShowRestart] = useState(false);
  const savePending = useRef(false);
  const { confirm, alert } = useConfirm();
  const { closeModal } = useModal();

  const isEdit = mode === 'edit';
  const pollintervalMatch = directives.match(/^\s*pollinterval\s*=\s*(\d+)/m);
  const pollVal = pollintervalMatch && parseInt(pollintervalMatch[1], 10);
  const showPollWarning = pollVal != null && pollVal < POLL_INTERVAL_MIN;

  const applyRecommended = useCallback(() => {
    const map = parseDirectives(directives);
    if (!map.pollinterval) map.pollinterval = DEFAULTS.POLL_INTERVAL;
    setDirectives(formatDirectives(map));
  }, [directives]);

  async function handleSave() {
    if (savePending.current) return;
    if (pollVal != null && pollVal < POLL_INTERVAL_MIN) {
      const ok = await confirm(`pollinterval is set to ${pollVal}, which is lower than the recommended ${POLL_INTERVAL_MIN}. Continue anyway?`);
      if (!ok) return;
    }
    savePending.current = true;
    try {
      const dirs = parseDirectives(directives);
      const body = { driver, port, desc, directives: dirs };
      const trimmedName = name.trim();
      if (isEdit) {
        await api(API.ups(trimmedName), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } else {
        body.name = trimmedName;
        await api(API.UPS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
      const r1 = await api(API.SERVICE_RESTART_ALL, { method: 'POST' });
      if (r1.returncode !== 0) msg += 'Service restart warning:\n' + (r1.stderr || r1.stdout || 'Unknown error') + '\n\n';
    } catch (e) { msg += 'Service restart failed:\n' + e.message + '\n\n'; }
    try {
      const r2 = await api(API.driver(trimmedName, 'restart'), { method: 'POST' });
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
          className="ups-modal-textarea"
          value={directives}
          onChange={e => setDirectives(e.target.value)}
        />
        {showPollWarning && <div className="ups-modal-warning">Warning: pollinterval lower than {POLL_INTERVAL_MIN} may cause instability.</div>}
      </div>
      <div className="modal-actions">
        <button className="secondary" onClick={closeModal}>Cancel</button>
        <button className="secondary" onClick={applyRecommended}>Apply Recommended Config</button>
        <button className="primary" onClick={handleSave}>Save</button>
      </div>
    </>
  );
}
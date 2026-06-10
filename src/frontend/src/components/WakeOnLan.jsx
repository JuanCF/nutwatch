import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { API, NOTIFICATION_EVENTS } from '../constants';
import { useConfirm } from './ConfirmDialog';
import { useModal } from './Modal';

function TargetModal({ target, onSaved }) {
  const { closeModal } = useModal();
  const [name, setName] = useState(target ? target.name : '');
  const [mac, setMac] = useState(target ? target.mac : '');
  const [broadcast, setBroadcast] = useState(target ? target.broadcast || '255.255.255.255' : '255.255.255.255');
  const [description, setDescription] = useState(target ? target.description || '' : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isEdit = !!target;

  async function handleSave() {
    setError('');
    if (!name.trim()) { setError('Name is required'); return; }
    if (!mac.trim()) { setError('MAC is required'); return; }

    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    if (!macRegex.test(mac.trim())) { setError('Invalid MAC address format (e.g. AA:BB:CC:DD:EE:FF)'); return; }

    setSaving(true);
    try {
      if (isEdit) {
        await api(API.wolTarget(target.name), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mac: mac.trim(), broadcast: broadcast.trim(), description: description.trim() }),
        });
      } else {
        await api(API.WOL_TARGETS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), mac: mac.trim(), broadcast: broadcast.trim(), description: description.trim() }),
        });
      }
      closeModal();
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h3>{isEdit ? 'Edit Target' : 'Add Target'}</h3>
      {error && <div className="error">{error}</div>}
      <div className="field">
        <label>Name</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} disabled={isEdit} />
      </div>
      <div className="field">
        <label>MAC Address</label>
        <input type="text" value={mac} onChange={e => setMac(e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" />
      </div>
      <div className="field">
        <label>Broadcast Address</label>
        <input type="text" value={broadcast} onChange={e => setBroadcast(e.target.value)} placeholder="255.255.255.255" />
      </div>
      <div className="field">
        <label>Description</label>
        <input type="text" value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <div className="modal-actions">
        <button className="secondary" onClick={closeModal}>Cancel</button>
        <button className="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
      </div>
    </>
  );
}

function MappingModal({ upsList, targets, mapping, onSaved }) {
  const { closeModal } = useModal();
  const [ups, setUps] = useState(mapping ? mapping.ups : (upsList[0] || ''));
  const [event, setEvent] = useState(mapping ? mapping.event : NOTIFICATION_EVENTS[0]);
  const [selectedTargets, setSelectedTargets] = useState(mapping ? mapping.targets : []);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function toggleTarget(name) {
    setSelectedTargets(prev =>
      prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]
    );
  }

  async function handleSave() {
    setError('');
    if (!ups) { setError('UPS is required'); return; }
    if (!event) { setError('Event is required'); return; }
    if (selectedTargets.length === 0) { setError('Select at least one target'); return; }
    setSaving(true);
    try {
      await api(API.WOL_MAPPINGS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ups, event, targets: selectedTargets }),
      });
      closeModal();
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const targetNames = Object.keys(targets);

  return (
    <>
      <h3>Add Event Mapping</h3>
      {error && <div className="error">{error}</div>}
      <div className="field">
        <label>UPS</label>
        <select value={ups} onChange={e => setUps(e.target.value)}>
          {upsList.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Event</label>
        <select value={event} onChange={e => setEvent(e.target.value)}>
          {NOTIFICATION_EVENTS.map(evt => <option key={evt} value={evt}>{evt}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Targets</label>
        {targetNames.length === 0
          ? <p className="empty">No targets configured. Add targets first.</p>
          : <div className="checkbox-list">
              {targetNames.map(name => (
                <label key={name} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={selectedTargets.includes(name)}
                    onChange={() => toggleTarget(name)}
                  />
                  <span>{name} {targets[name].description ? `(${targets[name].description})` : ''}</span>
                </label>
              ))}
            </div>
        }
      </div>
      <div className="modal-actions">
        <button className="secondary" onClick={closeModal}>Cancel</button>
        <button className="primary" onClick={handleSave} disabled={saving || targetNames.length === 0}>{saving ? 'Saving...' : 'Save'}</button>
      </div>
    </>
  );
}

export default function WakeOnLan() {
  const [targets, setTargets] = useState({});
  const [mappings, setMappings] = useState([]);
  const [upsList, setUpsList] = useState([]);
  const { confirm, dangerConfirm, alert } = useConfirm();
  const { openModal, closeModal } = useModal();

  const loadTargets = useCallback(async () => {
    try {
      const r = await api(API.WOL_TARGETS);
      setTargets(r.targets || {});
    } catch (e) {
      setTargets({});
    }
  }, []);

  const loadMappings = useCallback(async () => {
    try {
      const r = await api(API.WOL_MAPPINGS);
      setMappings(r.mappings || []);
    } catch (e) {
      setMappings([]);
    }
  }, []);

  const loadUpsList = useCallback(async () => {
    try {
      const list = await api(API.UPS);
      setUpsList(list.map(u => u.name));
    } catch (e) {
      setUpsList([]);
    }
  }, []);

  useEffect(() => {
    loadTargets();
    loadMappings();
    loadUpsList();
  }, [loadTargets, loadMappings, loadUpsList]);

  function handleAddTarget() {
    openModal(<TargetModal onSaved={() => { closeModal(); loadTargets(); }} />);
  }

  function handleEditTarget(target) {
    openModal(<TargetModal target={target} onSaved={() => { closeModal(); loadTargets(); }} />);
  }

  async function handleDeleteTarget(name) {
    const ok = await dangerConfirm('Delete WOL target "' + name + '"?');
    if (!ok) return;
    try {
      await api(API.wolTarget(name), { method: 'DELETE' });
      loadTargets();
      loadMappings();
    } catch (e) {
      await alert('Failed to delete target:\n' + e.message, 'Error');
    }
  }

  async function handleWake(name) {
    try {
      await api(API.wolWake(name), { method: 'POST' });
      await alert('Magic packet sent to ' + name, 'Wake on LAN');
    } catch (e) {
      await alert('Failed to wake ' + name + ':\n' + e.message, 'Error');
    }
  }

  async function handleWakeAll() {
    const ok = await confirm('Send magic packet to all targets?');
    if (!ok) return;
    try {
      const r = await api(API.WOL_WAKE_ALL, { method: 'POST' });
      const results = r.results || {};
      const lines = Object.entries(results).map(([k, v]) => k + ': ' + v);
      await alert(lines.join('\n'), 'Wake All Results');
    } catch (e) {
      await alert('Failed:\n' + e.message, 'Error');
    }
  }

  function handleAddMapping() {
    openModal(<MappingModal upsList={upsList} targets={targets} onSaved={() => { closeModal(); loadMappings(); }} />);
  }

  async function handleDeleteMapping(index) {
    const ok = await dangerConfirm('Delete this event mapping?');
    if (!ok) return;
    try {
      await api(API.wolMapping(index), { method: 'DELETE' });
      loadMappings();
    } catch (e) {
      await alert('Failed to delete mapping:\n' + e.message, 'Error');
    }
  }

  const targetNames = Object.keys(targets);

  return (
    <>
      <h2>Wake on LAN</h2>

      <section>
        <h3>Targets</h3>
        <div className="toolbar">
          <button className="primary" onClick={handleAddTarget}>Add Target</button>
          <button className="secondary" onClick={handleWakeAll} disabled={targetNames.length === 0}>Wake All</button>
          <button className="secondary" onClick={() => { loadTargets(); loadMappings(); }}>Refresh</button>
        </div>
        <div id="wol-targets-table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>MAC</th><th>Broadcast</th><th>Description</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {targetNames.length === 0
                ? <tr><td colSpan="5" className="empty">No WOL targets configured.</td></tr>
                : targetNames.map(name => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td><code>{targets[name].mac}</code></td>
                      <td>{targets[name].broadcast || '255.255.255.255'}</td>
                      <td>{targets[name].description || '-'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button className="secondary" onClick={() => handleWake(name)}>Wake Now</button>
                          <button className="secondary" onClick={() => handleEditTarget({ name, ...targets[name] })}>Edit</button>
                          <button className="secondary danger" onClick={() => handleDeleteTarget(name)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h3>Event Mappings</h3>
        <div className="toolbar">
          <button className="primary" onClick={handleAddMapping}>Add Mapping</button>
          <button className="secondary" onClick={loadMappings}>Refresh</button>
        </div>
        <div className="info-box" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
          <p>When the configured UPS triggers an event, magic packets are automatically sent to the mapped targets.</p>
        </div>
        <div id="wol-mappings-table-wrap">
          <table>
            <thead>
              <tr><th>#</th><th>UPS</th><th>Event</th><th>Targets</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {mappings.length === 0
                ? <tr><td colSpan="5" className="empty">No event mappings configured.</td></tr>
                : mappings.map((m, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{m.ups}</td>
                      <td><span className={`badge ${({ ONLINE: 'success', ONBATT: 'warning', LOWBATT: 'error', COMMBAD: 'danger', COMMOK: 'success', SHUTDOWN: 'error', REPLBATT: 'warning', NOCOMM: 'danger', NOPARENT: 'neutral' }[m.event]) || 'neutral'}`}>{m.event}</span></td>
                      <td>{m.targets.join(', ')}</td>
                      <td>
                        <button className="secondary danger" onClick={() => handleDeleteMapping(i)}>Delete</button>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
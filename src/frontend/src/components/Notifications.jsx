import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { useConfirm } from './ConfirmDialog';
import { useModal } from './Modal';

const NOTIFICATION_EVENTS = ['ONLINE', 'ONBATT', 'LOWBATT', 'COMMOK', 'COMMBAD', 'SHUTDOWN', 'REPLBATT', 'NOCOMM', 'NOPARENT'];
const TIMING_KEYS = ['POLLFREQ', 'POLLFREQALERT', 'HOSTSYNC', 'DEADTIME', 'RBWARNTIME', 'NOCOMMWARNTIME', 'FINALDELAY'];

export default function Notifications() {
  const [config, setConfig] = useState(null);
  const [upsNames, setUpsNames] = useState([]);
  const [monitors, setMonitors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    minsupplies: 1,
    shutdowncmd: '',
    notifycmd: '',
    powerdownflag: '',
    timing: {},
    notify_msg: {},
    notify_flag: {},
  });
  const { alert } = useConfirm();
  const { openModal, closeModal } = useModal();
  const savePending = useRef(false);
  const monitorIdCounter = useRef(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api('/upsmon/config').catch(() => null),
      api('/ups').catch(() => []),
    ]).then(([cfg, ups]) => {
      if (cancelled) return;
      setConfig(cfg);
      setUpsNames(ups.map(u => u.name));
      if (cfg) {
        setMonitors((cfg.monitors || []).map(m => ({
          ...m,
          __id: monitorIdCounter.current++,
          power: String(m.power || 0),
        })));
        setForm({
          minsupplies: cfg.minsupplies != null ? cfg.minsupplies : 1,
          shutdowncmd: cfg.shutdowncmd || '',
          notifycmd: cfg.notifycmd || '',
          powerdownflag: cfg.powerdownflag || '',
          timing: { ...(cfg.timing || {}) },
          notify_msg: { ...(cfg.notify_msg || {}) },
          notify_flag: { ...(cfg.notify_flag || {}) },
        });
      }
    });
    return () => { cancelled = true; };
  }, []);

  const updateMonitor = useCallback((id, field, value) => {
    setMonitors(prev => prev.map(m => m.__id === id ? { ...m, [field]: value } : m));
  }, []);

  const removeMonitor = useCallback((id) => {
    setMonitors(prev => prev.filter(m => m.__id !== id));
  }, []);

  const addMonitorRow = useCallback(() => {
    setMonitors(prev => [...prev, {
      __id: monitorIdCounter.current++,
      upsname: upsNames[0] || '',
      hostspec: '@localhost',
      power: '1',
      username: '',
      password: '',
      role: 'slave',
    }]);
  }, [upsNames]);

  const setField = useCallback((field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const setTiming = useCallback((key, value) => {
    setForm(prev => ({ ...prev, timing: { ...prev.timing, [key]: value } }));
  }, []);

  const setNotifyMsg = useCallback((evt, value) => {
    setForm(prev => {
      const msgs = { ...prev.notify_msg };
      if (value.trim()) msgs[evt] = value.trim();
      else delete msgs[evt];
      return { ...prev, notify_msg: msgs };
    });
  }, []);

  const toggleFlag = useCallback((evt, flag, checked) => {
    setForm(prev => {
      const flags = new Set(prev.notify_flag[evt] || []);
      if (flag === 'IGNORE') {
        if (checked) {
          return { ...prev, notify_flag: { ...prev.notify_flag, [evt]: ['IGNORE'] } };
        }
        const updated = { ...prev.notify_flag };
        delete updated[evt];
        return { ...prev, notify_flag: updated };
      }
      if (checked) {
        flags.delete('IGNORE');
        flags.add(flag);
      } else {
        flags.delete(flag);
      }
      const arr = Array.from(flags);
      if (arr.length === 0) {
        const updated = { ...prev.notify_flag };
        delete updated[evt];
        return { ...prev, notify_flag: updated };
      }
      return { ...prev, notify_flag: { ...prev.notify_flag, [evt]: arr } };
    });
  }, []);

  async function handleSave() {
    if (savePending.current) return;
    savePending.current = true;
    setSaving(true);
    try {
      const timing = {};
      TIMING_KEYS.forEach(key => {
        const val = parseInt(form.timing[key], 10);
        if (!isNaN(val) && val > 0) timing[key] = val;
      });
      const body = {
        monitors: monitors.map(m => ({
          upsname: m.upsname,
          hostspec: m.hostspec,
          power: parseInt(m.power, 10) || 0,
          username: m.username,
          password: m.password,
          role: m.role,
        })),
        minsupplies: parseInt(form.minsupplies, 10) || 1,
        shutdowncmd: form.shutdowncmd.trim() || null,
        notifycmd: form.notifycmd.trim() || null,
        powerdownflag: form.powerdownflag.trim() || null,
        notify_msg: form.notify_msg,
        notify_flag: form.notify_flag,
        timing,
      };
      await api('/upsmon/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      await alert('Notifications configuration saved.', 'Saved');
      openModal(
        <>
          <h3>Notifications Saved</h3>
          <p>Configuration saved successfully.</p>
          <p>Restart nut-monitor to apply changes immediately?</p>
          <div className="modal-actions">
            <button className="secondary" onClick={closeModal}>Close</button>
            <button className="primary" onClick={async () => {
              closeModal();
              try {
                const r = await api('/service/restart-monitor', { method: 'POST' });
                if (r.returncode !== 0) {
                  await alert('Restart warning:\n' + (r.stderr || r.stdout || ''), 'Restart Warning');
                } else {
                  await alert('nut-monitor restarted successfully.', 'Restarted');
                }
              } catch (e) {
                await alert('Restart failed:\n' + e.message, 'Restart Error');
              }
            }}>Restart nut-monitor</button>
          </div>
        </>
      );
    } catch (e) {
      await alert('Failed to save notifications:\n' + e.message, 'Error');
    } finally {
      savePending.current = false;
      setSaving(false);
    }
  }

  if (!config) {
    return <div className="empty">Loading notifications configuration...</div>;
  }

  return (
    <>
      <h2>Notifications</h2>

      <h3>Monitor Lines</h3>
      <div id="notify-monitors-wrap">
        <table id="notify-monitors-table">
          <thead><tr><th>UPS Name</th><th>Host</th><th>Power</th><th>Username</th><th>Password</th><th>Role</th><th></th></tr></thead>
          <tbody id="notify-monitors-body">
            {monitors.map((m) => (
              <tr key={m.__id} data-mon-idx={m.__id}>
                <td>
                  <select value={m.upsname} onChange={e => updateMonitor(m.__id, 'upsname', e.target.value)}>
                    {upsNames.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </td>
                <td><input value={m.hostspec} onChange={e => updateMonitor(m.__id, 'hostspec', e.target.value)} /></td>
                <td><input type="number" min="0" value={m.power} onChange={e => updateMonitor(m.__id, 'power', e.target.value)} /></td>
                <td><input value={m.username} onChange={e => updateMonitor(m.__id, 'username', e.target.value)} /></td>
                <td><input value={m.password} onChange={e => updateMonitor(m.__id, 'password', e.target.value)} placeholder="******" /></td>
                <td>
                  <select value={m.role} onChange={e => updateMonitor(m.__id, 'role', e.target.value)}>
                    <option value="master">master</option>
                    <option value="slave">slave</option>
                  </select>
                </td>
                <td><button className="secondary danger" onClick={() => removeMonitor(m.__id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar" style={{ marginTop: '0.75rem' }}>
        <button className="secondary" onClick={addMonitorRow}>Add Monitor</button>
      </div>

      <h3>Global Commands</h3>
      <div className="field"><label>MINSUPPLIES</label><input type="number" min="0" value={form.minsupplies} onChange={e => setField('minsupplies', e.target.value)} /></div>
      <div className="field"><label>SHUTDOWNCMD</label><input value={form.shutdowncmd} onChange={e => setField('shutdowncmd', e.target.value)} /></div>
      <div className="field"><label>NOTIFYCMD</label><input value={form.notifycmd} onChange={e => setField('notifycmd', e.target.value)} /></div>
      <div className="field"><label>POWERDOWNFLAG</label><input value={form.powerdownflag} onChange={e => setField('powerdownflag', e.target.value)} /></div>

      <h3>Timing Parameters</h3>
      <div className="field-grid">
        {TIMING_KEYS.map(key => (
          <div className="field" key={key}>
            <label>{key}</label>
            <input type="number" min="1" value={form.timing[key] != null ? form.timing[key] : ''} onChange={e => setTiming(key, e.target.value)} />
          </div>
        ))}
      </div>

      <h3>Notification Messages &amp; Flags</h3>
      <div id="notify-events-wrap">
        <table id="notify-events-table">
          <thead><tr><th>Event</th><th>Message</th><th>SYSLOG</th><th>WALL</th><th>EXEC</th><th>IGNORE</th></tr></thead>
          <tbody>
            {NOTIFICATION_EVENTS.map(evt => {
              const msg = (form.notify_msg && form.notify_msg[evt]) || '';
              const flags = (form.notify_flag && form.notify_flag[evt]) || [];
              const ignoreSet = flags.includes('IGNORE');
              return (
                <tr key={evt}>
                  <td>{evt}</td>
                  <td><input value={msg} onChange={e => setNotifyMsg(evt, e.target.value)} /></td>
                  {['SYSLOG', 'WALL', 'EXEC', 'IGNORE'].map(flag => {
                    const disabled = flag !== 'IGNORE' && ignoreSet;
                    return (
                      <td key={flag} style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={flags.includes(flag)}
                          disabled={disabled}
                          onChange={e => toggleFlag(evt, flag, e.target.checked)}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="info-box" style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
        <p>A sample notify script is installed at <code>/etc/nut/notifycmd.sh</code>. It logs all UPS events and runs optional hook scripts placed in <code>/etc/nut/notify.d/</code>:</p>
        <ul>
          <li><code>/etc/nut/notify.d/&lt;EVENT&gt;.sh</code> -- runs for a specific event from any UPS.</li>
          <li><code>/etc/nut/notify.d/&lt;UPSNAME&gt;_&lt;EVENT&gt;.sh</code> -- runs for a specific UPS + event.</li>
        </ul>
        <p>To shut down another machine when UPS goes on battery, create a hook like: <code>/etc/nut/notify.d/myups_ONBATT.sh</code> containing <code>ssh root@other-machine shutdown -h now</code>.</p>
      </div>

      <div className="toolbar" style={{ marginTop: '1rem' }}>
        <button className="primary" onClick={handleSave} disabled={saving}>Save</button>
      </div>
    </>
  );
}

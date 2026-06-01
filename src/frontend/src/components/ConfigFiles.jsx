import { useState } from 'react';
import { api } from '../api';
import { useConfirm } from './ConfirmDialog';

const CONFIG_NAMES = ['ups.conf', 'upsd.conf', 'upsmon.conf', 'upsd.users'];

export default function ConfigFiles() {
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const { alert } = useConfirm();

  async function loadConfig(name) {
    setFilename(name);
    setReadOnly(name === 'upsd.users');
    try {
      const data = await api('/config/' + encodeURIComponent(name));
      setContent(data);
    } catch (e) {
      setContent('Error loading config: ' + e.message);
    }
  }

  async function saveConfig() {
    if (!filename) { await alert('No config loaded', 'Error'); return; }
    if (filename === 'upsd.users') { await alert('upsd.users is read-only', 'Error'); return; }
    try {
      await api('/config/' + encodeURIComponent(filename), { method: 'PUT', body: content });
      await alert('Saved ' + filename, 'Config Saved');
    } catch (e) {
      await alert('Failed to save config:\n' + e.message, 'Error');
    }
  }

  return (
    <>
      <h2>Config Files</h2>
      <div className="config-buttons">
        {CONFIG_NAMES.map(name => (
          <button key={name} className="secondary" onClick={() => loadConfig(name)}>{name}</button>
        ))}
      </div>
      <div className="toolbar">
        <button className="primary" onClick={saveConfig}>Save</button>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '0.85rem', color: 'var(--muted)' }}>{filename}</span>
      </div>
      <textarea
        id="config-editor"
        value={content}
        onChange={e => setContent(e.target.value)}
        readOnly={readOnly}
      />
    </>
  );
}

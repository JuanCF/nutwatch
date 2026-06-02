import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { API } from '../constants';
import { useConfirm } from './ConfirmDialog';
import { useModal } from './Modal';

export default function HookEditor({ upsname, event, onClose }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const savePending = useRef(false);
  const { alert, dangerConfirm } = useConfirm();
  const { closeModal } = useModal();

  useEffect(() => {
    let cancelled = false;
    api(API.hooks(upsname, event))
      .then(r => { if (!cancelled) setContent(r.content || ''); })
      .catch(() => { if (!cancelled) setContent(''); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [upsname, event]);

  async function handleSave() {
    if (savePending.current) return;
    savePending.current = true;
    try {
      await api(API.hooks(upsname, event), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      onClose();
    } catch (e) {
      await alert('Failed to save hook:\n' + e.message, 'Error');
    } finally {
      savePending.current = false;
    }
  }

  async function handleDelete() {
    const ok = await dangerConfirm('Delete hook for ' + upsname + ' on ' + event + '?');
    if (!ok) return;
    try {
      await api(API.hooks(upsname, event), { method: 'DELETE' });
      onClose();
    } catch (e) {
      await alert('Failed to delete hook:\n' + e.message, 'Error');
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const val = e.target.value;
      e.target.value = val.substring(0, start) + '\t' + val.substring(end);
      e.target.selectionStart = e.target.selectionEnd = start + 1;
      setContent(e.target.value);
    }
  }

  if (loading) {
    return <><h3>Loading...</h3></>;
  }

  return (
    <>
      <h3>{content ? 'Edit' : 'Add'} Hook</h3>
      <div className="field"><label>UPS</label><input readOnly value={upsname} /></div>
      <div className="field"><label>Event</label><input readOnly value={event} /></div>
      <div className="field">
        <label>Script</label>
        <textarea
          className="script-editor"
          placeholder={'#!/bin/bash\n# This script runs when ' + event + ' fires for ' + upsname + '.\n# Environment: $UPSNAME, $NOTIFYTYPE\n'}
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className="modal-actions">
        <button className="secondary" onClick={closeModal}>Cancel</button>
        {content ? <button className="secondary danger" onClick={handleDelete}>Delete</button> : null}
        <button className="primary" onClick={handleSave}>Save</button>
      </div>
    </>
  );
}

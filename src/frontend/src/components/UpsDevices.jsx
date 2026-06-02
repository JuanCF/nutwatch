import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { API } from '../constants';
import { useConfirm } from './ConfirmDialog';
import { useModal } from './Modal';
import UpsCard from './UpsCard';
import UpsModal from './UpsModal';
import ServiceStatus from './ServiceStatus';

export default function UpsDevices({ onViewHooks }) {
  const [upsList, setUpsList] = useState([]);
  const { confirm, dangerConfirm, alert } = useConfirm();
  const { openModal, closeModal } = useModal();
  const deletePending = useRef({});
  const driverPending = useRef({});

  const loadUps = useCallback(async () => {
    try {
      setUpsList(await api(API.UPS));
    } catch (e) {
      setUpsList([]);
    }
  }, []);

  useEffect(() => { loadUps(); }, [loadUps]);

  async function handleDriverAction(name, action) {
    const key = name + '|' + action;
    if (driverPending.current[key]) return;
    driverPending.current[key] = true;
    try {
      const ok = await confirm(action + ' driver for ' + name + '?');
      if (!ok) return;
      const r = await api(API.driver(name, action), { method: 'POST' });
      const title = r.returncode === 0 ? 'Driver Result' : 'Driver Error';
      await alert('Driver ' + action + ': rc=' + r.returncode + '\n' + (r.stdout || '') + '\n' + (r.stderr || ''), title);
      loadUps();
    } catch (e) {
      await alert('Driver ' + action + ' failed:\n' + e.message, 'Error');
    } finally {
      delete driverPending.current[key];
    }
  }

  async function handleDelete(name) {
    const key = 'ups:' + name;
    if (deletePending.current[key]) return;
    deletePending.current[key] = true;
    try {
      const ok = await dangerConfirm('Delete UPS "' + name + '"? This will stop the driver and remove all configuration.');
      if (!ok) return;
      await api(API.ups(name), { method: 'DELETE' });
    } catch (e) {
      await alert('Failed to delete UPS:\n' + e.message, 'Error');
      return;
    } finally {
      delete deletePending.current[key];
    }
    try {
      const list = await api(API.UPS);
      const r = list.length === 0
        ? await api(API.SERVICE_RESTART_MONITOR, { method: 'POST' })
        : await api(API.SERVICE_RESTART_ALL, { method: 'POST' });
      if (r.returncode !== 0) {
        await alert('Service restart warning:\n' + (r.stderr || r.stdout || ''), 'Restart Warning');
      }
    } catch (e) {
      await alert('Restart failed — changes may not be fully applied:\n' + e.message, 'Restart Error');
    }
    loadUps();
  }

  function handleEdit(ups) {
    openModal(<UpsModal mode="edit" ups={ups} onSaved={() => { closeModal(); loadUps(); }} />);
  }

  function handleAdd() {
    openModal(<UpsModal mode="add" onSaved={() => { closeModal(); loadUps(); }} />);
  }

  async function handleScan() {
    openModal(<><h3>Scanning USB...</h3><div className="scan-output">Running nut-scanner -U...</div></>);
    try {
      const r = await api(API.UPS_SCAN, { method: 'POST' });
      const devices = r.devices || [];
      if (r.returncode !== 0 && !devices.length) {
        openModal(
          <>
            <h3>USB Scan Failed</h3>
            <div className="scan-output">{r.stderr || 'Unknown error'}</div>
            <div className="modal-actions"><button className="secondary" onClick={closeModal}>Close</button></div>
          </>
        );
        return;
      }
      if (!devices.length) {
        openModal(
          <>
            <h3>USB Scan Result</h3>
            <p className="empty">No USB UPS devices detected.</p>
            {r.stderr && <div className="scan-output">{r.stderr}</div>}
            <div className="modal-actions"><button className="secondary" onClick={closeModal}>Close</button></div>
          </>
        );
        return;
      }
      openModal(
        <>
          <h3>Detected UPS Devices</h3>
          {devices.map((d, i) => {
            const extras = Object.entries(d.extra || {});
            return (
              <div key={i} className="card" style={{ marginBottom: '0.75rem' }}>
                <h3>{d.scanner_name}</h3>
                {d.desc && <div className="meta">desc: {d.desc}</div>}
                <div className="meta">driver: {d.driver || '-'}</div>
                <div className="meta">port: {d.port || '-'}</div>
                {d.vendorid && <div className="meta">vendorid: {d.vendorid}</div>}
                {d.productid && <div className="meta">productid: {d.productid}</div>}
                {extras.map((e, j) => <div key={j} className="meta">{e[0]}: {e[1]}</div>)}
                <div className="actions">
                  <button className="primary" onClick={() => openModal(<UpsModal mode="add" scanData={d} onSaved={() => { closeModal(); loadUps(); }} />)}>Add to NUT</button>
                </div>
              </div>
            );
          })}
          <div className="modal-actions"><button className="secondary" onClick={closeModal}>Close</button></div>
        </>
      );
    } catch (e) {
      openModal(<><h3>Error</h3><div className="scan-output">{e.message}</div><div className="modal-actions"><button className="secondary" onClick={closeModal}>Close</button></div></>);
    }
  }

  return (
    <>
      <h2>UPS Devices</h2>
      <ServiceStatus />
      <div className="toolbar">
        <button className="primary" onClick={handleAdd}>Add UPS</button>
        <button className="secondary" onClick={handleScan}>Scan USB</button>
        <button className="secondary" onClick={loadUps}>Refresh</button>
      </div>
      <div className="card-grid">
        {upsList.length === 0
          ? <div className="empty">No UPS devices configured.</div>
          : upsList.map(u => (
              <UpsCard
                key={u.name}
                ups={u}
                onEdit={handleEdit}
                onHooks={onViewHooks}
                onDriverAction={handleDriverAction}
                onDelete={handleDelete}
              />
            ))
        }
      </div>
    </>
  );
}

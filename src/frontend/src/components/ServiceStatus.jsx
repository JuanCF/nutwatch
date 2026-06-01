import { useState, useEffect } from 'react';
import { api } from '../api';

export default function ServiceStatus() {
  const [services, setServices] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api('/service/status-detailed').then(r => { if (!cancelled) setServices(r); }).catch(() => { if (!cancelled) setServices(null); });
    return () => { cancelled = true; };
  }, []);

  if (!services) {
    return <div id="service-status"><span className="badge unknown">status unavailable</span></div>;
  }

  return (
    <div id="service-status">
      <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Services:</span>
      {Object.entries(services).map(([svc, info]) => {
        const cls = info.active ? 'online' : (info.state === 'failed' ? 'offline' : 'unknown');
        return <span key={svc} className={`badge ${cls}`}>{svc}: {info.state}</span>;
      })}
    </div>
  );
}

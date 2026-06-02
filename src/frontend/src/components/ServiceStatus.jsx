import { useState, useEffect } from 'react';
import { api } from '../api';
import { API } from '../constants';
import { statusToBadgeClass } from '../utils/service';

export default function ServiceStatus() {
  const [services, setServices] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api(API.SERVICE_STATUS).then(r => { if (!cancelled) setServices(r); }).catch(() => { if (!cancelled) setServices(null); });
    return () => { cancelled = true; };
  }, []);

  if (!services) {
    return <div id="service-status"><span className="badge unknown">status unavailable</span></div>;
  }

  return (
    <div id="service-status">
      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Services:</span>
      {Object.entries(services).map(([svc, info]) => {
        const cls = statusToBadgeClass(info);
        return <span key={svc} className={`badge ${cls}`}>{svc}: {info.state}</span>;
      })}
    </div>
  );
}

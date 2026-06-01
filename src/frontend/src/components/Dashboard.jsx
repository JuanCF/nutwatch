import { useState, useEffect } from 'react';
import { api } from '../api';
import Badge from './Badge';

export default function Dashboard() {
  const [upsList, setUpsList] = useState([]);
  const [userCount, setUserCount] = useState(null);
  const [services, setServices] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api('/ups').catch(() => []),
      api('/users').catch(() => null),
      api('/service/status-detailed').catch(() => null),
    ]).then(([ups, users, svcs]) => {
      if (cancelled) return;
      setUpsList(ups);
      setUserCount(Array.isArray(users) ? users.length : null);
      setServices(svcs);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  let health, healthClass;
  if (services) {
    const svcNames = Object.keys(services);
    const optionalPattern = /^nut-driver/;
    const coreServices = svcNames.filter(n => !optionalPattern.test(n));
    const coreActive = coreServices.filter(s => services[s].active).length;
    const hasFailed = svcNames.some(s => services[s].state === 'failed');
    if (hasFailed) { health = 'Failed'; healthClass = 'health-failed'; }
    else if (coreServices.length === 0) { health = 'Unknown'; healthClass = 'health-unknown'; }
    else if (coreActive === coreServices.length) { health = 'Healthy'; healthClass = 'health-healthy'; }
    else { health = 'Degraded'; healthClass = 'health-degraded'; }
  } else {
    health = 'Unknown'; healthClass = 'health-unknown';
  }

  const activeCount = services ? Object.values(services).filter(s => s.active).length : null;
  const totalCount = services ? Object.keys(services).length : null;

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="16" height="10" rx="2"/><line x1="22" y1="11" x2="22" y2="13"/><line x1="6" y1="11" x2="6" y2="13"/></svg>
          </div>
          <div className="stat-value">{loading ? '-' : upsList.length}</div>
          <div className="stat-label">UPS Devices</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div className="stat-value">{loading ? '-' : userCount != null ? userCount : '?'}</div>
          <div className="stat-label">Users</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <div className="stat-value">{loading ? '-' : activeCount != null ? activeCount + '/' + totalCount : '?'}</div>
          <div className="stat-label">Active Services</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div className="stat-value"><span className={healthClass}>{health}</span></div>
          <div className="stat-label">System Health</div>
        </div>
      </div>

      <div className="dashboard-row">
        <div className="dashboard-card">
          <h3>UPS Overview</h3>
          <div className="dash-list">
            {loading ? <div className="empty">Loading...</div> : upsList.length === 0 ? <div className="empty">No UPS devices configured.</div> : upsList.map(u => (
              <div key={u.name} className="dash-ups-item">
                <span className="dash-ups-name">{u.name}</span>
                <Badge status={u.status} />
              </div>
            ))}
          </div>
        </div>
        <div className="dashboard-card">
          <h3>Services</h3>
          <div className="dash-list">
            {loading ? <div className="empty">Loading...</div> : !services ? <div className="empty">Failed to load services</div> : Object.entries(services).map(([svc, info]) => {
              const cls = info.active ? 'online' : (info.state === 'failed' ? 'offline' : 'unknown');
              return (
                <div key={svc} className="dash-svc-item">
                  <span className={`badge ${cls}`}>{svc}</span>
                  <span className="dash-svc-state">{info.state}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

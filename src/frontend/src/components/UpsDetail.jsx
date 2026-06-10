import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { API } from '../constants';
import { formatRuntime } from '../utils/format';
import Badge from './Badge';

function niceLabel(key) {
  const name = key.includes('.') ? key.split('.').slice(1).join(' - ') : key;
  return name
    .replace(/(\b\w)/g, c => c.toUpperCase())
    .replace(/\./g, ' ');
}

function fmtVal(key, val) {
  if (typeof val === 'number') {
    if (key.endsWith('.runtime') || key === 'battery.runtime.low') {
      const t = formatRuntime(val);
      return t || val + 's';
    }
    if (key.endsWith('.charge') || key.endsWith('.load')) return val + '%';
    if (key.endsWith('.voltage') || key.endsWith('.voltage.nominal')) return val + ' V';
    if (key.endsWith('.frequency')) return val + ' Hz';
    if (key.includes('realpower')) return val + ' W';
    if (key.endsWith('.power.nominal') || key.endsWith('.power')) return val + ' VA';
    if (key.endsWith('.temperature')) return val + ' ' + String.fromCharCode(176) + 'C';
    if (key.endsWith('.current')) return val + ' A';
    return String(val);
  }
  return String(val);
}

const GROUPS = [
  { prefix: 'battery', label: 'Battery' },
  { prefix: 'input', label: 'Input' },
  { prefix: 'output', label: 'Output' },
  { prefix: 'ups', label: 'UPS' },
  { prefix: 'device', label: 'Device' },
  { prefix: 'driver', label: 'Driver' },
];

function SkeletonDetail() {
  return (
    <>
      <div className="detail-header">
        <div className="detail-title">
          <div className="skeleton skeleton-title" style={{ width: '180px' }} />
          <div className="skeleton skeleton-badge" />
        </div>
        <div className="skeleton" style={{ width: '150px', height: '32px' }} />
      </div>
      <div className="detail-grid">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="detail-section">
            <div className="skeleton skeleton-text" style={{ width: '80px', marginBottom: '0.85rem' }} />
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" style={{ borderBottom: 'none' }} />
          </div>
        ))}
      </div>
    </>
  );
}

export default function UpsDetail() {
  const { name } = useParams();
  const navigate = useNavigate();
  const upsname = decodeURIComponent(name);
  const [detail, setDetail] = useState(null);
  const [ups, setUps] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [live, setLive] = useState(true);
  const intervalRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api(API.ups(upsname)).catch(() => null),
      api(API.upsDetail(upsname)).catch(() => null),
    ]).then(([upsData, detailData]) => {
      if (cancelled) return;
      setUps(upsData);
      if (detailData) {
        setDetail(detailData);
      } else {
        setError('Driver not running or UPS unreachable');
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [upsname]);

  useEffect(() => {
    if (!live) return;
    const ac = new AbortController();
    const id = setInterval(() => {
      api(API.upsDetail(upsname), { signal: ac.signal })
        .then(d => { if (d) setDetail(d); })
        .catch(() => {});
    }, 10000);
    intervalRef.current = id;
    return () => {
      ac.abort();
      clearInterval(id);
    };
  }, [live, upsname]);

  if (loading) {
    return (
      <>
        <div className="detail-header">
          <h2>{upsname}</h2>
          <button className="secondary" onClick={() => navigate('/ups')}>Back</button>
        </div>
        <SkeletonDetail />
      </>
    );
  }

  if (error || !detail) {
    return (
      <>
        <div className="detail-header">
          <h2>{upsname}</h2>
          <button className="secondary" onClick={() => navigate('/ups')}>Back to UPS Devices</button>
        </div>
        <div className="empty">{error || 'No telemetry data available'}</div>
      </>
    );
  }

  const grouped = {};
  for (const [key, val] of Object.entries(detail)) {
    const prefix = key.split('.')[0];
    if (!grouped[prefix]) grouped[prefix] = [];
    grouped[prefix].push([key, val]);
  }

  return (
    <>
      <div className="detail-header">
        <div className="detail-title">
          <h2>{upsname}</h2>
          {ups?.status && <Badge status={ups.status} />}
          <button
            className={`secondary detail-live-toggle ${live ? '' : 'paused'}`}
            onClick={() => setLive(v => !v)}
          >
            <span className={`live-dot ${live ? 'active' : 'paused'}`} />
            {live ? 'Live' : 'Paused'}
          </button>
        </div>
        <button className="secondary" onClick={() => navigate('/ups')}>Back to UPS Devices</button>
      </div>

      <div className="detail-grid">
        {GROUPS.filter(g => grouped[g.prefix]).map(group => (
          <div key={group.prefix} className="detail-section">
            <h3 className="detail-section-title">{group.label}</h3>
            <div className="detail-items">
              {grouped[group.prefix]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, val]) => {
                  if (key === 'battery.charge') {
                    const pct = Math.min(val, 100);
                    const color = pct <= 20 ? 'var(--red)' : pct <= 50 ? 'var(--orange)' : 'var(--green)';
                    return (
                      <div key={key} className="detail-item detail-item-bar">
                        <span className="detail-item-label">Charge</span>
                        <div className="detail-bar-wrap">
                          <div className="detail-bar">
                            <div className="detail-bar-fill" style={{ width: pct + '%', background: color }} />
                          </div>
                          <span className="detail-bar-text">{pct}%</span>
                        </div>
                      </div>
                    );
                  }
                  if (key === 'ups.load') {
                    const pct = Math.min(val, 100);
                    const color = pct >= 80 ? 'var(--red)' : pct >= 60 ? 'var(--orange)' : 'var(--accent)';
                    return (
                      <div key={key} className="detail-item detail-item-bar">
                        <span className="detail-item-label">Load</span>
                        <div className="detail-bar-wrap">
                          <div className="detail-bar">
                            <div className="detail-bar-fill" style={{ width: pct + '%', background: color }} />
                          </div>
                          <span className="detail-bar-text">{pct}%</span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={key} className="detail-item">
                      <span className="detail-item-label">{niceLabel(key)}</span>
                      <span className="detail-item-value">{fmtVal(key, val)}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      <details className="detail-raw-toggle">
        <summary>Show all variables (raw)</summary>
        <pre className="detail-raw">
          {Object.entries(detail).map(([k, v]) => `${k}: ${v}`).join('\n')}
        </pre>
      </details>
    </>
  );
}

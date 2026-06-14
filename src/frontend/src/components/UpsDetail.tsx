import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { API } from '../constants';
import { formatRuntime } from '../utils/format';
import { getBatteryChargeColor, getLoadColor } from '../utils/metrics';
import Badge from './Badge';
import Gauge from './Gauge';
import HistoryChart from './HistoryChart';
import type { UpsDevice, UpsDetailData } from '../types';

function niceLabel(key: string): string {
  const name = key.includes('.') ? key.split('.').slice(1).join(' - ') : key;
  return name
    .replace(/(\b\w)/g, c => c.toUpperCase())
    .replace(/\./g, ' ');
}

function fmtVal(key: string, val: number | string): string {
  if (typeof val === 'number') {
    if (key.endsWith('.runtime') || key === 'battery.runtime.low') {
      const t = formatRuntime(val);
      return t ?? val + 's';
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
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  let upsname: string;
  try {
    upsname = decodeURIComponent(name ?? '');
  } catch {
    upsname = name ?? '';
  }
  const [detail, setDetail] = useState<UpsDetailData | null>(null);
  const [ups, setUps] = useState<UpsDevice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [activeTab, setActiveTab] = useState<'info' | 'charts'>('info');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api<UpsDevice>(API.ups(upsname)).catch(() => null),
      api<UpsDetailData>(API.upsDetail(upsname)).catch(() => null),
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
    const fetching = { current: false };
    const poll = () => {
      if (fetching.current) return;
      fetching.current = true;
      api<UpsDetailData>(API.upsDetail(upsname), { signal: ac.signal })
        .then(d => { if (d) { setDetail(d); setError(null); } })
        .catch(() => {})
        .finally(() => { fetching.current = false; });
    };
    const id = setInterval(poll, 10000);
    poll();
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
        <div className="empty">{error ?? 'No telemetry data available'}</div>
      </>
    );
  }

  const grouped: Record<string, [string, number | string][]> = {};
  for (const [key, val] of Object.entries(detail)) {
    const prefix = key.split('.')[0];
    if (!grouped[prefix]) grouped[prefix] = [];
    grouped[prefix].push([key, val]);
  }

  const charge = typeof detail['battery.charge'] === 'number' ? detail['battery.charge'] : null;
  const load = typeof detail['ups.load'] === 'number' ? detail['ups.load'] : null;
  const runtime = typeof detail['battery.runtime'] === 'number' ? detail['battery.runtime'] : null;
  const inputV = detail['input.voltage'];
  const outputV = detail['output.voltage'];
  const voltage = outputV ?? inputV;

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

      <div className="tab-bar">
        <button className={`tab ${activeTab === 'info' ? 'active' : ''}`} onClick={() => setActiveTab('info')}>Info</button>
        <button className={`tab ${activeTab === 'charts' ? 'active' : ''}`} onClick={() => setActiveTab('charts')}>Charts</button>
      </div>

      {activeTab === 'info' && (
        <>
          <div className="detail-metrics">
            {charge != null && (
              <div className="detail-metric-card">
                <Gauge value={Math.min(charge, 100)} label="Battery" size={100} color={getBatteryChargeColor(charge)} />
              </div>
            )}
            {load != null && (
              <div className="detail-metric-card">
                <Gauge value={Math.min(load, 100)} label="Load" size={100} color={getLoadColor(load)} />
              </div>
            )}
            <div className="detail-metric-card detail-metric-texts">
              {runtime != null && <span className="detail-metric-text">Runtime {formatRuntime(runtime)}</span>}
              {voltage != null && <span className="detail-metric-text">{voltage} V</span>}
            </div>
          </div>

          <div className="detail-grid">
            {GROUPS.filter(g => grouped[g.prefix]).map(group => (
              <div key={group.prefix} className="detail-section">
                <h3 className="detail-section-title">{group.label}</h3>
                <div className="detail-items">
                  {grouped[group.prefix]
                    .filter(([key]) => key !== 'battery.charge' && key !== 'ups.load')
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, val]) => (
                      <div key={key} className="detail-item">
                        <span className="detail-item-label">{niceLabel(key)}</span>
                        <span className="detail-item-value">{fmtVal(key, val)}</span>
                      </div>
                    ))}
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
      )}
      {activeTab === 'charts' && <HistoryChart upsName={upsname} />}
    </>
  );
}

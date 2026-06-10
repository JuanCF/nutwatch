import { useNavigate } from 'react-router-dom';
import Badge from './Badge';
import { formatRuntime } from '../utils/format';

export default function UpsCard({ ups, detail, onEdit, onDriverAction, onDelete }) {
  const navigate = useNavigate();
  const dirs = (ups.directives || []).map(d => d[0] + '=' + d[1]).join(', ');

  const charge = detail?.['battery.charge'];
  const load = detail?.['ups.load'];
  const runtime = detail?.['battery.runtime'];
  const inputVoltage = detail?.['input.voltage'];
  const outputVoltage = detail?.['output.voltage'];
  const voltage = outputVoltage || inputVoltage;

  const chargeColor = charge <= 20 ? 'var(--red)' : charge <= 50 ? 'var(--orange)' : 'var(--green)';
  const loadColor = load >= 80 ? 'var(--red)' : load >= 60 ? 'var(--orange)' : 'var(--accent)';

  return (
    <div className="card clickable" onClick={() => navigate('/ups/' + encodeURIComponent(ups.name))}>
      <h3>{ups.name} <Badge status={ups.status} /></h3>
      <div className="meta">driver: {ups.driver || '-'}</div>
      <div className="meta">port: {ups.port || '-'}</div>
      <div className="meta">desc: {ups.desc || '-'}</div>
      {dirs ? <div className="meta">{dirs}</div> : null}
      <div className="card-metrics">
        {charge != null && (
          <div className="card-metric">
            <div className="metric-bar">
              <div className="metric-fill" style={{ width: Math.min(charge, 100) + '%', background: chargeColor }} />
            </div>
            <span className="metric-label">{charge}% Battery</span>
          </div>
        )}
        {load != null && (
          <div className="card-metric">
            <div className="metric-bar">
              <div className="metric-fill" style={{ width: Math.min(load, 100) + '%', background: loadColor }} />
            </div>
            <span className="metric-label">{load}% Load</span>
          </div>
        )}
        <div className="card-metric-row">
          {runtime != null && <span className="metric-text">Runtime {formatRuntime(runtime)}</span>}
          {voltage != null && <span className="metric-text">{voltage} V</span>}
        </div>
      </div>
      <div className="actions">
        <button className="secondary" onClick={(e) => { e.stopPropagation(); onEdit(ups); }}>Edit</button>
        <button className="secondary" onClick={(e) => { e.stopPropagation(); navigate('/ups/' + encodeURIComponent(ups.name) + '/hooks'); }}>Hooks</button>
        <button className="secondary" onClick={(e) => { e.stopPropagation(); onDriverAction(ups.name, 'start'); }}>Start driver</button>
        <button className="secondary" onClick={(e) => { e.stopPropagation(); onDriverAction(ups.name, 'stop'); }}>Stop driver</button>
        <button className="secondary danger" onClick={(e) => { e.stopPropagation(); onDelete(ups.name); }}>Delete</button>
      </div>
    </div>
  );
}

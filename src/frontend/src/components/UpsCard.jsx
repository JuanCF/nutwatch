import { useNavigate } from 'react-router-dom';
import Badge from './Badge';
import Gauge from './Gauge';
import { formatRuntime } from '../utils/format';
import { getBatteryChargeColor, getLoadColor } from '../utils/metrics';

export default function UpsCard({ ups, detail, onEdit, onDriverAction, onDelete }) {
  const navigate = useNavigate();
  const dirs = (ups.directives || []).map(d => d[0] + '=' + d[1]).join(', ');

  const charge = detail?.['battery.charge'];
  const load = detail?.['ups.load'];
  const runtime = detail?.['battery.runtime'];
  const inputVoltage = detail?.['input.voltage'];
  const outputVoltage = detail?.['output.voltage'];
  const voltage = outputVoltage || inputVoltage;

  const chargeColor = getBatteryChargeColor(charge);
  const loadColor = getLoadColor(load);

  return (
    <div className="card clickable" onClick={() => navigate('/ups/' + encodeURIComponent(ups.name))}>
      <h3>{ups.name} <Badge status={ups.status} /></h3>
      <div className="meta">driver: {ups.driver || '-'}</div>
      <div className="meta">port: {ups.port || '-'}</div>
      <div className="meta">desc: {ups.desc || '-'}</div>
      {dirs ? <div className="meta">{dirs}</div> : null}
      <div className="card-metrics-row-gauges">
        {charge != null && (
          <Gauge value={charge} label="Battery" size={76} color={chargeColor} />
        )}
        {load != null && (
          <Gauge value={load} label="Load" size={76} color={loadColor} />
        )}
      </div>
      <div className="card-metric-row" style={{ justifyContent: 'center' }}>
        {runtime != null && <span className="metric-text">Runtime {formatRuntime(runtime)}</span>}
        {voltage != null && <span className="metric-text">{voltage} V</span>}
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

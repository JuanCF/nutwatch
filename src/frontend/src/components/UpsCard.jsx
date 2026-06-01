import Badge from './Badge';

export default function UpsCard({ ups, onEdit, onHooks, onDriverAction, onDelete }) {
  const dirs = (ups.directives || []).map(d => d[0] + '=' + d[1]).join(', ');

  return (
    <div className="card">
      <h3>{ups.name} <Badge status={ups.status} /></h3>
      <div className="meta">driver: {ups.driver || '-'}</div>
      <div className="meta">port: {ups.port || '-'}</div>
      <div className="meta">desc: {ups.desc || '-'}</div>
      {dirs ? <div className="meta">{dirs}</div> : null}
      <div className="actions">
        <button className="secondary" onClick={() => onEdit(ups)}>Edit</button>
        <button className="secondary" onClick={() => onHooks(ups.name)}>Hooks</button>
        <button className="secondary" onClick={() => onDriverAction(ups.name, 'start')}>Start driver</button>
        <button className="secondary" onClick={() => onDriverAction(ups.name, 'stop')}>Stop driver</button>
        <button className="secondary danger" onClick={() => onDelete(ups.name)}>Delete</button>
      </div>
    </div>
  );
}

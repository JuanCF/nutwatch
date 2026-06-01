export default function Badge({ status }) {
  const s = (status || 'unknown').toLowerCase();
  const cls = ['online', 'onbatt', 'offline'].includes(s) ? s : 'unknown';
  return <span className={`badge ${cls}`}>{s}</span>;
}

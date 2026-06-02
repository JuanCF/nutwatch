import { BADGE_KNOWN_CLASSES } from '../constants';

export default function Badge({ status }) {
  const s = (status || 'unknown').toLowerCase();
  const cls = BADGE_KNOWN_CLASSES.includes(s) ? s : 'unknown';
  return <span className={`badge ${cls}`}>{s}</span>;
}

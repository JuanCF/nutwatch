import { BADGE_KNOWN_CLASSES } from '../constants';

interface BadgeProps {
  status?: string | null;
}

export default function Badge({ status }: BadgeProps) {
  const s = (status ?? 'unknown').toLowerCase();
  const cls = (BADGE_KNOWN_CLASSES as readonly string[]).includes(s) ? s : 'unknown';
  return <span className={`badge ${cls}`}>{s}</span>;
}

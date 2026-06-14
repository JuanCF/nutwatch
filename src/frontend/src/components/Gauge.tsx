import { arc } from 'd3-shape';

interface GaugeProps {
  value: number;
  max?: number;
  label?: string;
  size?: number;
  color?: string;
}

interface ArcDatum {
  startAngle: number;
  endAngle: number;
}

const START_ANGLE = -Math.PI * 0.75;
const SWEEP = Math.PI * 1.5;

export default function Gauge({ value, max = 100, label, size = 80, color = 'var(--blue)' }: GaugeProps) {
  const pct = max > 0 && isFinite(value) ? Math.min(Math.max(value / max, 0), 1) : 0;
  const sw = Math.max(4, size * 0.11);
  const r = (size - sw) / 2;

  const arcGen = arc<unknown, ArcDatum>()
    .innerRadius(r - sw / 2 + 1)
    .outerRadius(r + sw / 2)
    .cornerRadius(sw / 2);

  const bgPath = arcGen({ startAngle: START_ANGLE, endAngle: START_ANGLE + SWEEP });
  const fillAngle = SWEEP * pct;
  const fillPath = pct > 0 ? arcGen({ startAngle: START_ANGLE, endAngle: START_ANGLE + fillAngle }) : null;

  return (
    <div className="gauge-wrapper">
      <div className="gauge-container" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
          <g transform={`translate(${size / 2},${size / 2})`}>
            <path d={bgPath ?? undefined} fill="var(--border-subtle)" />
            {fillPath && <path d={fillPath} fill={color} />}
          </g>
        </svg>
        <div className="gauge-value">{Math.round(pct * 100)}%</div>
      </div>
      {label && <div className="gauge-label">{label}</div>}
    </div>
  );
}

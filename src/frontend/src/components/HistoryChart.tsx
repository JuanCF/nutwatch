import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { api } from '../api';
import { API } from '../constants';
import Skeleton from './Skeleton';

interface HistoryChartProps {
  upsName: string;
}

type DataPoint = [number, number];
type SeriesMap = Record<string, DataPoint[]>;

const COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#fb923c', '#a78bfa', '#f472b6'];
const RANGES = ['1h', '24h', '7d', '30d'] as const;
const DEFAULT_VARS = ['battery.charge', 'ups.load'];

const METRIC_LEAVES = new Set([
  'charge', 'voltage', 'current', 'frequency', 'runtime',
  'load', 'temperature', 'power', 'realpower', 'humidity',
  'capacity', 'efficiency',
]);

const CONFIG_QUALIFIERS = new Set([
  'nominal', 'low', 'high', 'warning', 'restart',
  'minimum', 'maximum', 'packs', 'date', 'type',
]);

function isDynamicVar(name: string): boolean {
  const leaf = name.slice(name.lastIndexOf('.') + 1);
  if (CONFIG_QUALIFIERS.has(leaf)) return false;
  return METRIC_LEAVES.has(leaf);
}

function formatTime(ts: number, range: string): string {
  const d = new Date(ts * 1000);
  if (range === '1h') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (range === '24h') return d.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit' });
}

function formatTooltipTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

function drawChart(svgEl: SVGSVGElement, data: SeriesMap, selectedVars: string[], range: string, clipId: string) {
  const svg = svgEl;

  const margin = { top: 20, right: 20, bottom: 40, left: 60 };
  const width = svg.clientWidth || 800;
  const height = 400;
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const allPoints: { t: number; v: number }[] = [];
  const series = selectedVars
    .filter(v => data[v])
    .map(v => ({ name: v, points: data[v] }));
  for (const s of series) {
    for (const p of s.points) {
      allPoints.push({ t: p[0], v: p[1] });
    }
  }
  if (allPoints.length === 0) return;

  const xMin = allPoints.reduce((a, p) => Math.min(a, p.t), Infinity);
  const xMax = allPoints.reduce((a, p) => Math.max(a, p.t), -Infinity);
  const yMin = allPoints.reduce((a, p) => Math.min(a, p.v), Infinity);
  const yMax = allPoints.reduce((a, p) => Math.max(a, p.v), -Infinity);

  const xScale = (t: number) => margin.left + ((t - xMin) / (xMax - xMin || 1)) * innerW;
  const yScale = (v: number) => margin.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const ns = 'http://www.w3.org/2000/svg';
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  let content = svg.querySelector('.chart-content');
  if (!content) {
    content = document.createElementNS(ns, 'g');
    content.setAttribute('class', 'chart-content');
    svg.appendChild(content);
  }
  content.innerHTML = '';

  const defs = document.createElementNS(ns, 'defs');
  const clip = document.createElementNS(ns, 'clipPath');
  clip.setAttribute('id', clipId);
  const clipRect = document.createElementNS(ns, 'rect');
  clipRect.setAttribute('x', String(margin.left));
  clipRect.setAttribute('y', String(margin.top));
  clipRect.setAttribute('width', String(innerW));
  clipRect.setAttribute('height', String(innerH));
  clip.appendChild(clipRect);
  defs.appendChild(clip);
  content.appendChild(defs);

  const chartArea = document.createElementNS(ns, 'g');
  chartArea.setAttribute('clip-path', `url(#${clipId})`);
  content.appendChild(chartArea);

  const gridGroup = document.createElementNS(ns, 'g');
  gridGroup.setAttribute('class', 'chart-grid');
  chartArea.appendChild(gridGroup);

  const numGridLines = 5;
  for (let i = 0; i <= numGridLines; i++) {
    const v = yMin + ((yMax - yMin) * i) / numGridLines;
    const y = yScale(v);
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', String(margin.left));
    line.setAttribute('y1', String(y));
    line.setAttribute('x2', String(margin.left + innerW));
    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', 'var(--border-subtle)');
    line.setAttribute('stroke-width', '1');
    gridGroup.appendChild(line);

    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', String(margin.left - 8));
    label.setAttribute('y', String(y + 4));
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('fill', 'var(--text-muted)');
    label.setAttribute('font-size', '11');
    label.textContent = v.toFixed(1);
    content.appendChild(label);
  }

  // Adapt the number of x-axis ticks to the available width and the rendered
  // label width: longer formats (24h/7d/30d) get fewer ticks so they don't crowd.
  const sampleLabel = formatTime(xMin + (xMax - xMin) / 2, range);
  const approxLabelWidth = sampleLabel.length * 6.5 + 24;
  const xTicks = Math.max(1, Math.min(8, Math.floor(innerW / approxLabelWidth)) - 1);
  for (let i = 0; i <= xTicks; i++) {
    const t = xMin + ((xMax - xMin) * i) / xTicks;
    const x = xScale(t);
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', String(x));
    label.setAttribute('y', String(height - margin.bottom + 20));
    // Anchor the first/last labels inward so they don't overflow the plot edges.
    label.setAttribute('text-anchor', i === 0 ? 'start' : i === xTicks ? 'end' : 'middle');
    label.setAttribute('fill', 'var(--text-muted)');
    label.setAttribute('font-size', '11');
    label.textContent = formatTime(t, range);
    content.appendChild(label);
  }

  const linesGroup = document.createElementNS(ns, 'g');
  chartArea.appendChild(linesGroup);

  series.forEach((s, idx) => {
    const color = COLORS[idx % COLORS.length];
    if (s.points.length === 1) {
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', String(xScale(s.points[0][0])));
      dot.setAttribute('cy', String(yScale(s.points[0][1])));
      dot.setAttribute('r', '3');
      dot.setAttribute('fill', color);
      linesGroup.appendChild(dot);
      return;
    }
    if (s.points.length < 1) return;
    let pathD = '';
    for (let i = 0; i < s.points.length; i++) {
      const x = xScale(s.points[i][0]);
      const y = yScale(s.points[i][1]);
      pathD += i === 0 ? `M${x},${y}` : `L${x},${y}`;
    }
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-linecap', 'round');
    linesGroup.appendChild(path);
  });

  const parent = svg.parentElement;
  if (!parent) return;

  const tooltip = (parent.querySelector('.chart-tooltip') as HTMLElement | null) ?? (() => {
    const el = document.createElement('div');
    el.setAttribute('class', 'chart-tooltip');
    parent.appendChild(el);
    return el;
  })();

  const hitArea = document.createElementNS(ns, 'rect');
  hitArea.setAttribute('x', String(margin.left));
  hitArea.setAttribute('y', String(margin.top));
  hitArea.setAttribute('width', String(innerW));
  hitArea.setAttribute('height', String(innerH));
  hitArea.setAttribute('fill', 'transparent');
  chartArea.appendChild(hitArea);

  let lastX = -1;
  hitArea.addEventListener('mousemove', (e: Event) => {
    const me = e as MouseEvent;
    const rect = svg.getBoundingClientRect();
    const mx = me.clientX - rect.left;
    const chartX = mx - margin.left;
    const t = xMin + (chartX / innerW) * (xMax - xMin);

    let closestDist = Infinity;
    let closestT = t;
    for (const s of series) {
      for (const p of s.points) {
        const dist = Math.abs(p[0] - t);
        if (dist < closestDist) { closestDist = dist; closestT = p[0]; }
      }
    }

    const newX = Math.round(xScale(closestT));
    if (newX === lastX) return;
    lastX = newX;

    const vl = chartArea.querySelector('.chart-crosshair');
    if (vl) {
      vl.setAttribute('x1', String(newX)); vl.setAttribute('y1', String(margin.top));
      vl.setAttribute('x2', String(newX)); vl.setAttribute('y2', String(margin.top + innerH));
    } else {
      const nl = document.createElementNS(ns, 'line');
      nl.setAttribute('class', 'chart-crosshair');
      nl.setAttribute('x1', String(newX)); nl.setAttribute('y1', String(margin.top));
      nl.setAttribute('x2', String(newX)); nl.setAttribute('y2', String(margin.top + innerH));
      nl.setAttribute('stroke', 'var(--text-muted)');
      nl.setAttribute('stroke-width', '1');
      nl.setAttribute('stroke-dasharray', '4,4');
      chartArea.appendChild(nl);
    }

    const lines = series.map((s, si) => {
      let closest: DataPoint | null = null;
      let minDist = Infinity;
      for (const p of s.points) {
        const dist = Math.abs(p[0] - closestT);
        if (dist < minDist) { minDist = dist; closest = p; }
      }
      return { name: s.name, val: closest ? closest[1] : null, color: COLORS[si % COLORS.length] };
    });

    tooltip.textContent = '';
    const timeDiv = document.createElement('div');
    timeDiv.className = 'chart-tooltip-time';
    timeDiv.textContent = formatTooltipTime(closestT);
    tooltip.appendChild(timeDiv);
    for (const l of lines) {
      const row = document.createElement('div');
      row.className = 'chart-tooltip-row';
      const dot = document.createElement('span');
      dot.className = 'chart-tooltip-dot';
      dot.style.background = l.color;
      row.appendChild(dot);
      const valStr = l.val != null ? l.val.toFixed(1) : '—';
      const strong = document.createElement('strong');
      strong.textContent = valStr;
      row.appendChild(document.createTextNode(`${l.name}: `));
      row.appendChild(strong);
      tooltip.appendChild(row);
    }
    tooltip.style.display = 'block';
    const ttRect = tooltip.getBoundingClientRect();
    let tx = me.clientX - rect.left + 12;
    let ty = me.clientY - rect.top - 12;
    if (tx + ttRect.width > width) tx = me.clientX - rect.left - ttRect.width - 12;
    if (ty + ttRect.height > height) ty = height - ttRect.height - 4;
    if (ty < 0) ty = 4;
    tooltip.style.left = tx + 'px';
    tooltip.style.top = ty + 'px';
  });

  hitArea.addEventListener('mouseleave', () => {
    const vl = chartArea.querySelector('.chart-crosshair');
    if (vl) vl.remove();
    tooltip.style.display = 'none';
    lastX = -1;
  });
}

function SkeletonChart() {
  return (
    <div className="chart-skeleton">
      <Skeleton className="skeleton-chart-area" />
      <Skeleton className="skeleton-chart-area" width="60%" style={{ marginTop: '0.5rem' }} />
    </div>
  );
}

export default function HistoryChart({ upsName }: HistoryChartProps) {
  const [range, setRange] = useState<string>('24h');
  const [selectedVars, setSelectedVars] = useState<Record<string, boolean>>({});
  const [availableVars, setAvailableVars] = useState<string[]>([]);
  const [data, setData] = useState<SeriesMap | null>(null);
  const [loading, setLoading] = useState(true);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const clipId = useId();

  useEffect(() => {
    let cancelled = false;
    setAvailableVars([]);
    setSelectedVars({});
    setLoading(true);
    api<{ variables?: string[] }>(API.historyVariables(upsName))
      .then(res => {
        if (cancelled) return;
        const vars = (res.variables ?? []).filter(isDynamicVar);
        setAvailableVars(vars);
        const initSel: Record<string, boolean> = {};
        for (const v of DEFAULT_VARS) {
          if (vars.includes(v)) initSel[v] = true;
        }
        if (Object.keys(initSel).length === 0 && vars.length > 0) {
          for (let i = 0; i < Math.min(3, vars.length); i++) {
            initSel[vars[i]] = true;
          }
        }
        setSelectedVars(initSel);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [upsName]);

  useEffect(() => {
    if (availableVars.length === 0) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api<{ variables?: SeriesMap }>(API.history(upsName, range, availableVars))
      .then(res => {
        if (cancelled) return;
        setData(res.variables ?? {});
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range, upsName, availableVars]);

  useEffect(() => {
    if (!loading && data && svgRef.current) {
      const activeVars = Object.entries(selectedVars).filter(([, v]) => v).map(([k]) => k);
      drawChart(svgRef.current, data, activeVars, range, clipId);
    }
  }, [data, loading, selectedVars, range, clipId]);

  const toggleVar = useCallback((v: string) => {
    setSelectedVars(prev => ({ ...prev, [v]: !prev[v] }));
  }, []);

  const hasData = !!data && Object.entries(selectedVars).some(
    ([k, on]) => on && data[k] && data[k].length > 0
  );

  return (
    <div className="history-chart">
      <div className="history-chart-controls">
        <div className="history-range-selector">
          {RANGES.map(r => (
            <button
              key={r}
              className={`history-range-btn ${range === r ? 'active' : ''}`}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="history-var-selector">
          {availableVars.map(v => (
            <label key={v} className="history-var-checkbox">
              <input
                type="checkbox"
                checked={!!selectedVars[v]}
                onChange={() => toggleVar(v)}
              />
              <span>{v}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="chart-container" style={{ position: 'relative' }}>
        {loading && <SkeletonChart />}
        {!loading && !hasData && (
          <div className="chart-empty">
            No historical data yet. Data is collected every 60 seconds.
          </div>
        )}
        <svg
          ref={svgRef}
          className="chart-svg"
          style={{ width: '100%', height: '400px', display: loading || (!loading && !hasData) ? 'none' : 'block' }}
        />
      </div>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { API } from '../constants';

const COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#fb923c', '#a78bfa', '#f472b6'];
const RANGES = ['1h', '24h', '7d', '30d'];
const DEFAULT_VARS = ['battery.charge', 'ups.load'];

// Allowlist by the trailing metric word: a variable is worth charting only if
// its last segment is an actual measurement that changes over time. Keying on
// the leaf (rather than denylisting names) also covers phase-tagged variants
// like `input.L1.voltage` without extra patterns.
const METRIC_LEAVES = new Set([
  'charge', 'voltage', 'current', 'frequency', 'runtime',
  'load', 'temperature', 'power', 'realpower', 'humidity',
  'capacity', 'efficiency',
]);

// Qualifiers that turn a metric-looking name into a constant config/threshold
// value, e.g. `input.voltage.nominal`, `battery.charge.low`,
// `input.voltage.minimum` (running stats, not a live series).
const CONFIG_QUALIFIERS = new Set([
  'nominal', 'low', 'high', 'warning', 'restart',
  'minimum', 'maximum', 'packs', 'date', 'type',
]);

function isDynamicVar(name) {
  const leaf = name.slice(name.lastIndexOf('.') + 1);
  if (CONFIG_QUALIFIERS.has(leaf)) return false;
  return METRIC_LEAVES.has(leaf);
}

function formatTime(ts, range) {
  const d = new Date(ts * 1000);
  if (range === '1h') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (range === '24h') return d.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit' });
}

function formatTooltipTime(ts) {
  return new Date(ts * 1000).toLocaleString();
}

function drawChart(svgEl, data, selectedVars, range) {
  const svg = svgEl;
  if (!svg) return;

  const margin = { top: 20, right: 20, bottom: 40, left: 60 };
  const width = svg.clientWidth || 800;
  const height = 400;
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const allPoints = [];
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

  const xScale = (t) => margin.left + ((t - xMin) / (xMax - xMin || 1)) * innerW;
  const yScale = (v) => margin.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

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
  clip.setAttribute('id', 'chart-clip');
  const clipRect = document.createElementNS(ns, 'rect');
  clipRect.setAttribute('x', margin.left);
  clipRect.setAttribute('y', margin.top);
  clipRect.setAttribute('width', innerW);
  clipRect.setAttribute('height', innerH);
  clip.appendChild(clipRect);
  defs.appendChild(clip);
  content.appendChild(defs);

  const chartArea = document.createElementNS(ns, 'g');
  chartArea.setAttribute('clip-path', 'url(#chart-clip)');
  content.appendChild(chartArea);

  const gridGroup = document.createElementNS(ns, 'g');
  gridGroup.setAttribute('class', 'chart-grid');
  chartArea.appendChild(gridGroup);

  const numGridLines = 5;
  for (let i = 0; i <= numGridLines; i++) {
    const v = yMin + ((yMax - yMin) * i) / numGridLines;
    const y = yScale(v);
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', margin.left);
    line.setAttribute('y1', y);
    line.setAttribute('x2', margin.left + innerW);
    line.setAttribute('y2', y);
    line.setAttribute('stroke', 'var(--border-subtle)');
    line.setAttribute('stroke-width', '1');
    gridGroup.appendChild(line);

    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', margin.left - 8);
    label.setAttribute('y', y + 4);
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('fill', 'var(--text-muted)');
    label.setAttribute('font-size', '11');
    label.textContent = typeof v === 'number' ? v.toFixed(1) : String(v);
    // Append to content, not gridGroup: the label sits at x < clip rect and
    // would be clipped away if it lived inside the clipped chart area.
    content.appendChild(label);
  }

  const xTicks = 5;
  for (let i = 0; i <= xTicks; i++) {
    const t = xMin + ((xMax - xMin) * i) / xTicks;
    const x = xScale(t);
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', x);
    label.setAttribute('y', height - margin.bottom + 20);
    label.setAttribute('text-anchor', 'middle');
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
      // A single sample can't form a line; draw a dot so the chart isn't blank
      // during the first collection cycles.
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', xScale(s.points[0][0]));
      dot.setAttribute('cy', yScale(s.points[0][1]));
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
      if (i === 0) {
        pathD += `M${x},${y}`;
      } else {
        pathD += `L${x},${y}`;
      }
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

  const tooltip = svg.parentElement.querySelector('.chart-tooltip') || (() => {
    const el = document.createElement('div');
    el.setAttribute('class', 'chart-tooltip');
    svg.parentElement.appendChild(el);
    return el;
  })();

  const hitArea = document.createElementNS(ns, 'rect');
  hitArea.setAttribute('x', margin.left);
  hitArea.setAttribute('y', margin.top);
  hitArea.setAttribute('width', innerW);
  hitArea.setAttribute('height', innerH);
  hitArea.setAttribute('fill', 'transparent');
  chartArea.appendChild(hitArea);

  let lastX = -1;
  hitArea.addEventListener('mousemove', (e) => {
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const chartX = mx - margin.left;
    const t = xMin + (chartX / innerW) * (xMax - xMin);

    let closestDist = Infinity;
    let closestT = t;
    for (const s of series) {
      for (const p of s.points) {
        const dist = Math.abs(p[0] - t);
        if (dist < closestDist) {
          closestDist = dist;
          closestT = p[0];
        }
      }
    }

    const newX = Math.round(xScale(closestT));
    if (newX === lastX) return;
    lastX = newX;

    const verticalLine = chartArea.querySelector('.chart-crosshair');
    if (verticalLine) {
      verticalLine.setAttribute('x1', newX);
      verticalLine.setAttribute('y1', margin.top);
      verticalLine.setAttribute('x2', newX);
      verticalLine.setAttribute('y2', margin.top + innerH);
    } else {
      const vl = document.createElementNS(ns, 'line');
      vl.setAttribute('class', 'chart-crosshair');
      vl.setAttribute('x1', newX);
      vl.setAttribute('y1', margin.top);
      vl.setAttribute('x2', newX);
      vl.setAttribute('y2', margin.top + innerH);
      vl.setAttribute('stroke', 'var(--text-muted)');
      vl.setAttribute('stroke-width', '1');
      vl.setAttribute('stroke-dasharray', '4,4');
      chartArea.appendChild(vl);
    }

    const lines = series.map(s => {
      let closest = null;
      let minDist = Infinity;
      for (const p of s.points) {
        const dist = Math.abs(p[0] - closestT);
        if (dist < minDist) {
          minDist = dist;
          closest = p;
        }
      }
      return { name: s.name, val: closest ? closest[1] : null, color: COLORS[series.indexOf(s) % COLORS.length] };
    });

    const timeStr = formatTooltipTime(closestT);
    tooltip.innerHTML = `<div class="chart-tooltip-time">${timeStr}</div>` +
      lines.map(l => `<div class="chart-tooltip-row"><span class="chart-tooltip-dot" style="background:${l.color}"></span>${l.name}: <strong>${l.val != null ? (typeof l.val === 'number' ? l.val.toFixed(1) : l.val) : '—'}</strong></div>`).join('');
    tooltip.style.display = 'block';
    const ttRect = tooltip.getBoundingClientRect();
    let tx = e.clientX - rect.left + 12;
    let ty = e.clientY - rect.top - 12;
    if (tx + ttRect.width > width) tx = e.clientX - rect.left - ttRect.width - 12;
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
      <div className="skeleton skeleton-chart-area" />
      <div className="skeleton skeleton-chart-area" style={{ width: '60%', marginTop: '0.5rem' }} />
    </div>
  );
}

export default function HistoryChart({ upsName }) {
  const [range, setRange] = useState('24h');
  const [selectedVars, setSelectedVars] = useState({});
  const [availableVars, setAvailableVars] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const svgRef = useRef(null);
  const dataRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    api(API.historyVariables(upsName))
      .then(res => {
        const vars = (res.variables || []).filter(isDynamicVar);
        setAvailableVars(vars);
        const initSel = {};
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
      .finally(() => setLoading(false));
  }, [upsName]);

  // Fetch every available variable's series once per range/UPS. Toggling a
  // checkbox then only re-draws from the already-loaded data (no refetch).
  useEffect(() => {
    if (availableVars.length === 0) {
      setData(null);
      return;
    }
    setLoading(true);
    api(API.history(upsName, range, availableVars))
      .then(res => {
        setData(res.variables || {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [range, upsName, availableVars]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!loading && data && svgRef.current) {
      const activeVars = Object.entries(selectedVars).filter(([, v]) => v).map(([k]) => k);
      drawChart(svgRef.current, data, activeVars, range);
    }
  }, [data, loading, selectedVars, range]);

  const toggleVar = useCallback((v) => {
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
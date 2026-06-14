import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { API, MAX_LOG_LINES } from '../constants';
import { classifyLogLine } from '../utils/logs';

interface LogLine {
  text: string;
  cls: string;
}

export default function Logs() {
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (esRef.current) return;
    const box = boxRef.current;
    if (!box) return;
    const es = new EventSource(API.LOGS_STREAM);
    esRef.current = es;
    es.onmessage = ev => {
      if (pausedRef.current) return;
      const text = ev.data as string;
      const cls = classifyLogLine(text);
      setLogLines(prev => {
        const next = [...prev, { text, cls }];
        return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next;
      });
    };
    es.onerror = () => {
      setLogLines(prev => [...prev, { text: '--- Log stream disconnected ---', cls: 'log-line error' }]);
      es.close();
      esRef.current = null;
    };
    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (autoScroll && boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [logLines, autoScroll]);

  async function loadRecent() {
    try {
      const r = await api<{ stdout: string }>(API.LOGS_RECENT);
      const lines = r.stdout.split('\n').filter(Boolean).map(text => {
        const cls = classifyLogLine(text);
        return { text, cls };
      });
      setLogLines(lines);
    } catch (e) {
      setLogLines([{ text: 'Failed to load recent logs: ' + (e as Error).message, cls: 'log-line error' }]);
    }
  }

  return (
    <>
      <h2>Logs</h2>
      <div className="toolbar">
        <button className="secondary" id="log-pause" onClick={() => setPaused(v => !v)}>{paused ? 'Resume' : 'Pause'}</button>
        <button className="secondary" onClick={() => void loadRecent()}>Load Recent</button>
        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} /> Auto-scroll
        </label>
      </div>
      <div className="log-box" ref={boxRef}>
        {logLines.map((line, i) => (
          <div key={i} className={line.cls}>{line.text}</div>
        ))}
      </div>
    </>
  );
}

import { describe, it, expect } from 'vitest';
import { classifyLogLine } from '../../utils/logs';

describe('classifyLogLine', () => {
  it('returns base class for neutral text', () => {
    expect(classifyLogLine('some random message')).toBe('log-line');
  });

  it('adds error class for text containing "error"', () => {
    const cls = classifyLogLine('ups driver error');
    expect(cls).toContain('error');
    expect(cls).not.toContain('warn');
  });

  it('adds error class for text containing "fail"', () => {
    expect(classifyLogLine('connection fail')).toContain('error');
  });

  it('adds error class for "ERR"', () => {
    expect(classifyLogLine('ERR: connection refused')).toContain('error');
  });

  it('adds warn class for warning text', () => {
    const cls = classifyLogLine('battery is low, warning');
    expect(cls).toContain('warn');
    expect(cls).not.toContain('error');
  });

  it('adds warn class for "WARNING"', () => {
    expect(classifyLogLine('WARNING: ups is on battery')).toContain('warn');
  });

  it('adds info class for info text', () => {
    const cls = classifyLogLine('Service started');
    expect(cls).toContain('info');
    expect(cls).not.toContain('error');
    expect(cls).not.toContain('warn');
  });

  it('adds info class for "running"', () => {
    expect(classifyLogLine('Driver running')).toContain('info');
  });

  it('prefers error over warn', () => {
    const cls = classifyLogLine('error with warning');
    expect(cls).toContain('error');
    expect(cls).not.toContain('warn');
  });

  it('prefers error over info', () => {
    const cls = classifyLogLine('error: info message');
    expect(cls).toContain('error');
    expect(cls).not.toContain('info');
  });

  it('prefers warn over info', () => {
    const cls = classifyLogLine('warning: info message');
    expect(cls).toContain('warn');
    expect(cls).not.toContain('info');
  });
});
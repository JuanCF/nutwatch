import { describe, it, expect } from 'vitest';
import { formatRuntime } from '../../utils/format';

describe('formatRuntime', () => {
  it('returns null for null input', () => {
    expect(formatRuntime(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(formatRuntime(undefined)).toBeNull();
  });

  it('formats seconds as minutes only', () => {
    expect(formatRuntime(0)).toBe('0m');
    expect(formatRuntime(59)).toBe('0m');
    expect(formatRuntime(60)).toBe('1m');
    expect(formatRuntime(3599)).toBe('59m');
  });

  it('formats seconds as hours and minutes', () => {
    expect(formatRuntime(3600)).toBe('1h 0m');
    expect(formatRuntime(3661)).toBe('1h 1m');
    expect(formatRuntime(7200)).toBe('2h 0m');
    expect(formatRuntime(7260)).toBe('2h 1m');
    expect(formatRuntime(86399)).toBe('23h 59m');
  });
});
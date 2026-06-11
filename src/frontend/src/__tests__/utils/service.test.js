import { describe, it, expect } from 'vitest';
import { statusToBadgeClass } from '../../utils/service';

describe('statusToBadgeClass', () => {
  it('returns "online" when active is true', () => {
    expect(statusToBadgeClass({ active: true, state: 'running' })).toBe('online');
    expect(statusToBadgeClass({ active: true, state: 'failed' })).toBe('online');
  });

  it('returns "offline" when active is false and state is "failed"', () => {
    expect(statusToBadgeClass({ active: false, state: 'failed' })).toBe('offline');
  });

  it('returns "unknown" when active is false and state is not "failed"', () => {
    expect(statusToBadgeClass({ active: false, state: 'inactive' })).toBe('unknown');
    expect(statusToBadgeClass({ active: false, state: 'dead' })).toBe('unknown');
  });
});
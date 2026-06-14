import { describe, it, expect } from 'vitest';
import { parseDirectives, formatDirectives } from '../../utils/directives';

describe('parseDirectives', () => {
  it('parses key=value pairs from text', () => {
    const result = parseDirectives('pollinterval=5\ndefault.battery.voltage=12');
    expect(result).toEqual({ pollinterval: '5', 'default.battery.voltage': '12' });
  });

  it('skips lines without equals sign', () => {
    const result = parseDirectives('key=value\ncomment\nanother=val');
    expect(result).toEqual({ key: 'value', another: 'val' });
  });

  it('handles empty strings', () => {
    expect(parseDirectives('')).toEqual({});
  });

  it('handles values with equals signs', () => {
    const result = parseDirectives('script=/usr/bin/my=script.sh');
    expect(result).toEqual({ script: '/usr/bin/my=script.sh' });
  });
});

describe('formatDirectives', () => {
  it('formats object back to text', () => {
    const result = formatDirectives({ pollinterval: '5', driver: 'usbhid-ups' });
    expect(result).toBe('pollinterval=5\ndriver=usbhid-ups');
  });

  it('handles empty object', () => {
    expect(formatDirectives({})).toBe('');
  });
});

describe('roundtrip', () => {
  it('parseDirectives and formatDirectives are inverses', () => {
    const input = 'pollinterval=5\ndefault.battery.voltage=12\ndriver=usbhid-ups';
    const parsed = parseDirectives(input);
    const formatted = formatDirectives(parsed);
    expect(parsed).toEqual({
      pollinterval: '5',
      'default.battery.voltage': '12',
      driver: 'usbhid-ups',
    });
    expect(formatted.split('\n').sort()).toEqual(input.split('\n').sort());
  });
});

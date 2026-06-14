import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge from '../../components/Badge';

describe('Badge', () => {
  it('renders with known status', () => {
    render(<Badge status="online" />);
    const el = screen.getByText('online');
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('badge');
    expect(el.className).toContain('online');
  });

  it('renders with onbatt status', () => {
    render(<Badge status="ONBATT" />);
    const el = screen.getByText('onbatt');
    expect(el.className).toContain('onbatt');
  });

  it('renders with offline status', () => {
    render(<Badge status="offline" />);
    const el = screen.getByText('offline');
    expect(el.className).toContain('offline');
  });

  it('falls back to unknown for unrecognized status', () => {
    render(<Badge status="unknown" />);
    const el = screen.getByText('unknown');
    expect(el.className).toContain('unknown');
  });

  it('falls back to unknown when status is null', () => {
    render(<Badge status={null} />);
    const el = screen.getByText('unknown');
    expect(el.className).toContain('unknown');
  });

  it('falls back to unknown when status is undefined', () => {
    render(<Badge />);
    const el = screen.getByText('unknown');
    expect(el.className).toContain('unknown');
  });

  it('lowercases status', () => {
    render(<Badge status="ONLINE" />);
    const el = screen.getByText('online');
    expect(el.className).toContain('online');
  });
});

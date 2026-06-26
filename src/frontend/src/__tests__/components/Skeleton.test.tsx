import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Skeleton from '../../components/Skeleton';

describe('Skeleton', () => {
  it('renders a div with skeleton class', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe('DIV');
    expect(el.className).toContain('skeleton');
  });

  it('appends extra className', () => {
    const { container } = render(<Skeleton className="skeleton-row" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toBe('skeleton skeleton-row');
  });

  it('applies width as string', () => {
    const { container } = render(<Skeleton width="180px" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.width).toBe('180px');
  });

  it('applies width as number (px unit)', () => {
    const { container } = render(<Skeleton width={200} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.width).toBe('200px');
  });

  it('applies height as string', () => {
    const { container } = render(<Skeleton height="32px" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.height).toBe('32px');
  });

  it('applies height as number (px unit)', () => {
    const { container } = render(<Skeleton height={48} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.height).toBe('48px');
  });

  it('applies custom style', () => {
    const { container } = render(<Skeleton style={{ marginTop: '1rem', opacity: 0.5 }} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.marginTop).toBe('1rem');
    expect(el.style.opacity).toBe('0.5');
  });

  it('merges style with width/height', () => {
    const { container } = render(<Skeleton width="50%" height={20} style={{ borderRadius: '4px' }} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.width).toBe('50%');
    expect(el.style.height).toBe('20px');
    expect(el.style.borderRadius).toBe('4px');
  });

  it('does not set width/height when not provided', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.width).toBe('');
    expect(el.style.height).toBe('');
  });

  it('preserves zero dimensions as px values', () => {
    const { container } = render(<Skeleton width={0} height={0} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.width).toBe('0px');
    expect(el.style.height).toBe('0px');
  });
});

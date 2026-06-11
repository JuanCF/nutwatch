import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Gauge from '../../components/Gauge';

describe('Gauge', () => {
  it('renders value as percentage', () => {
    render(<Gauge value={75} />);
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('renders label when provided', () => {
    render(<Gauge value={50} label="Battery" />);
    expect(screen.getByText('Battery')).toBeInTheDocument();
  });

  it('does not render label when omitted', () => {
    const { container } = render(<Gauge value={50} />);
    expect(container.querySelector('.gauge-label')).toBeNull();
  });

  it('renders SVG with two paths (background + fill)', () => {
    const { container } = render(<Gauge value={60} />);
    const paths = container.querySelectorAll('svg path');
    expect(paths.length).toBe(2);
  });

  it('applies custom size', () => {
    const { container } = render(<Gauge value={50} size={100} />);
    const wrapper = container.querySelector('.gauge-container');
    expect(wrapper).toHaveAttribute('style', expect.stringContaining('width: 100px'));
  });

  it('clamps value to max', () => {
    render(<Gauge value={150} max={100} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('handles 0 value', () => {
    render(<Gauge value={0} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('handles 100% value', () => {
    render(<Gauge value={100} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('accepts custom color', () => {
    const { container } = render(<Gauge value={50} color="var(--green)" />);
    const fillPath = container.querySelectorAll('svg path')[1];
    expect(fillPath).toHaveAttribute('fill', 'var(--green)');
  });

  it('renders no fill path when value is 0', () => {
    const { container } = render(<Gauge value={0} />);
    const paths = container.querySelectorAll('svg path');
    expect(paths.length).toBe(1);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useParams } from 'react-router-dom';
import UpsDetail from '../../components/UpsDetail';

vi.mock('../../api', () => ({
  api: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: vi.fn() };
});

import { api } from '../../api';

const MOCK_DETAIL = {
  'battery.charge': 85,
  'battery.runtime': 1800,
  'battery.voltage': 12.5,
  'input.voltage': 120,
  'input.frequency': 60,
  'output.voltage': 120,
  'ups.load': 34,
  'ups.status': 'OL',
  'device.model': 'Smart-UPS 1500',
};

function renderDetail() {
  return render(
    <MemoryRouter>
      <UpsDetail />
    </MemoryRouter>
  );
}

describe('UpsDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useParams.mockReturnValue({ name: 'testups' });
  });

  it('shows loading skeleton on mount', () => {
    api.mockImplementation(() => new Promise(() => {}));
    renderDetail();
    expect(screen.getByText('testups')).toBeInTheDocument();
  });

  it('renders detail with metrics bar and grid sections', async () => {
    api
      .mockResolvedValueOnce({ name: 'testups', status: 'online' })
      .mockResolvedValueOnce(MOCK_DETAIL);

    renderDetail();
    await waitFor(() => expect(screen.getByText('85%')).toBeInTheDocument());
    const batteries = screen.getAllByText('Battery');
    expect(batteries.length).toBe(2);
    expect(screen.getByText('34%')).toBeInTheDocument();
    expect(screen.getByText('Load')).toBeInTheDocument();
    const runtimes = screen.getAllByText(/Runtime/);
    expect(runtimes.length).toBe(2);
  });

  it('renders grouped sections without charge and load in grid', async () => {
    api
      .mockResolvedValueOnce({ name: 'testups', status: 'online' })
      .mockResolvedValueOnce(MOCK_DETAIL);

    renderDetail();
    await waitFor(() => {
      const batteries = screen.getAllByText('Battery');
      expect(batteries.length).toBe(2);
    });
    const voltages = screen.getAllByText('Voltage');
    expect(voltages.length).toBe(3);
    expect(screen.getByText('12.5 V')).toBeInTheDocument();
    expect(screen.getByText('Frequency')).toBeInTheDocument();
    expect(screen.getByText('60 Hz')).toBeInTheDocument();
  });

  it('shows error when detail fetch fails', async () => {
    api
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('fail'));

    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/Driver not running/)).toBeInTheDocument();
    });
  });

  it('shows toggle button for live polling', async () => {
    api
      .mockResolvedValueOnce({ name: 'testups', status: 'online' })
      .mockResolvedValueOnce(MOCK_DETAIL);

    renderDetail();
    await waitFor(() => expect(screen.getByText('Live')).toBeInTheDocument());
  });

  it('renders raw data toggle', async () => {
    api
      .mockResolvedValueOnce({ name: 'testups', status: 'online' })
      .mockResolvedValueOnce(MOCK_DETAIL);

    renderDetail();
    await waitFor(() => expect(screen.getByText('Show all variables (raw)')).toBeInTheDocument());
  });

  it('renders tab bar with Info and Charts buttons', async () => {
    api
      .mockResolvedValueOnce({ name: 'testups', status: 'online' })
      .mockResolvedValueOnce(MOCK_DETAIL);

    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('Info')).toBeInTheDocument();
    });
    expect(screen.getByText('Charts')).toBeInTheDocument();
  });

  it('shows Info tab active by default', async () => {
    api
      .mockResolvedValueOnce({ name: 'testups', status: 'online' })
      .mockResolvedValueOnce(MOCK_DETAIL);

    renderDetail();
    await waitFor(() => {
      const infoTab = screen.getByText('Info');
      expect(infoTab.className).toContain('active');
    });
    const chartsTab = screen.getByText('Charts');
    expect(chartsTab.className).not.toContain('active');
  });

  it('shows info content by default (gauges visible)', async () => {
    api
      .mockResolvedValueOnce({ name: 'testups', status: 'online' })
      .mockResolvedValueOnce(MOCK_DETAIL);

    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('85%')).toBeInTheDocument();
    });
  });
});

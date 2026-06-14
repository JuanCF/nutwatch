import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from '../../components/Dashboard';

vi.mock('../../api', () => ({
  api: vi.fn(),
}));

import { api } from '../../api';
const mockApi = vi.mocked(api);

const MOCK_UPS_LIST = [
  { name: 'ups1', driver: 'usbhid-ups', port: 'auto', status: 'online' },
  { name: 'ups2', driver: 'snmp-ups', port: '192.168.1.100', status: 'onbatt' },
];

const MOCK_USERS = [{ username: 'admin' }, { username: 'monitor' }];

const MOCK_SERVICES = {
  'nut-server': { active: true, state: 'running' },
  'nut-monitor': { active: true, state: 'running' },
  'nut-driver@ups1': { active: true, state: 'running' },
};

const MOCK_DETAILS = {
  ups1: { 'battery.charge': 85, 'ups.load': 32 },
  ups2: { 'battery.charge': 22, 'ups.load': 95 },
};

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders stat cards with counts', async () => {
    mockApi
      .mockResolvedValueOnce(MOCK_UPS_LIST)
      .mockResolvedValueOnce(MOCK_USERS)
      .mockResolvedValueOnce(MOCK_SERVICES)
      .mockResolvedValueOnce(MOCK_DETAILS.ups1)
      .mockResolvedValueOnce(MOCK_DETAILS.ups2);

    render(<Dashboard />);
    await waitFor(() => {
      const twos = screen.getAllByText('2');
      expect(twos.length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByText('UPS Devices')).toBeInTheDocument();
    expect(screen.getByText('3/3')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
  });

  it('shows UPS table with gauge values', async () => {
    mockApi
      .mockResolvedValueOnce(MOCK_UPS_LIST)
      .mockResolvedValueOnce(MOCK_USERS)
      .mockResolvedValueOnce(MOCK_SERVICES)
      .mockResolvedValueOnce(MOCK_DETAILS.ups1)
      .mockResolvedValueOnce(MOCK_DETAILS.ups2);

    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText('ups1')).toBeInTheDocument());
    await waitFor(() => {
      expect(screen.getByText('85%')).toBeInTheDocument();
      expect(screen.getByText('22%')).toBeInTheDocument();
    });
  });

  it('shows empty state when no UPS devices', async () => {
    mockApi
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(MOCK_USERS)
      .mockResolvedValueOnce(MOCK_SERVICES);

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText('No UPS devices configured.')).toBeInTheDocument();
    });
  });

  it('shows services list', async () => {
    mockApi
      .mockResolvedValueOnce(MOCK_UPS_LIST)
      .mockResolvedValueOnce(MOCK_USERS)
      .mockResolvedValueOnce(MOCK_SERVICES)
      .mockResolvedValueOnce(MOCK_DETAILS.ups1)
      .mockResolvedValueOnce(MOCK_DETAILS.ups2);

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText('nut-server')).toBeInTheDocument();
      expect(screen.getByText('nut-monitor')).toBeInTheDocument();
    });
  });

  it('shows user count from users list', async () => {
    mockApi
      .mockResolvedValueOnce(MOCK_UPS_LIST)
      .mockResolvedValueOnce(MOCK_USERS)
      .mockResolvedValueOnce(MOCK_SERVICES)
      .mockResolvedValueOnce(MOCK_DETAILS.ups1)
      .mockResolvedValueOnce(MOCK_DETAILS.ups2);

    render(<Dashboard />);
    await waitFor(() => {
      const twos = screen.getAllByText('2');
      expect(twos.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows Degraded health when core service is inactive', async () => {
    mockApi
      .mockResolvedValueOnce(MOCK_UPS_LIST)
      .mockResolvedValueOnce(MOCK_USERS)
      .mockResolvedValueOnce({
        'nut-server': { active: false, state: 'dead' },
        'nut-monitor': { active: true, state: 'running' },
      })
      .mockResolvedValueOnce(MOCK_DETAILS.ups1)
      .mockResolvedValueOnce(MOCK_DETAILS.ups2);

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText('Degraded')).toBeInTheDocument();
    });
  });

  it('shows Failed health when a service is in failed state', async () => {
    mockApi
      .mockResolvedValueOnce(MOCK_UPS_LIST)
      .mockResolvedValueOnce(MOCK_USERS)
      .mockResolvedValueOnce({
        'nut-server': { active: true, state: 'failed' },
        'nut-monitor': { active: true, state: 'running' },
      })
      .mockResolvedValueOnce(MOCK_DETAILS.ups1)
      .mockResolvedValueOnce(MOCK_DETAILS.ups2);

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });
});

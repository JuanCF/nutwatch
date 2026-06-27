import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from '../../components/Dashboard';
import { ModalProvider } from '../../components/Modal';
import { API } from '../../constants';

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

const MOCK_RESOURCES = {
  cpu_percent: 25.5,
  memory_percent: 60.2,
  memory_used_gb: 4.8,
  memory_total_gb: 8.0,
  disk_percent: 45.1,
  disk_free_gb: 110.5,
  disk_total_gb: 200.0,
};

const MOCK_DETAILS: Record<string, unknown> = {
  ups1: { 'battery.charge': 85, 'ups.load': 32 },
  ups2: { 'battery.charge': 22, 'ups.load': 95 },
};

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.mockImplementation((url: string) => {
      if (url === API.UPS) return Promise.resolve(MOCK_UPS_LIST);
      if (url === API.USERS) return Promise.resolve(MOCK_USERS);
      if (url === API.SERVICE_STATUS) return Promise.resolve(MOCK_SERVICES);
      if (url === API.SYSTEM_RESOURCES) return Promise.resolve(MOCK_RESOURCES);
      const match = url.match(/\/ups\/([^/]+)\/detail/);
      if (match) return Promise.resolve(MOCK_DETAILS[match[1]] ?? null);
      return Promise.resolve(null);
    });
  });

  it('renders stat cards with counts', async () => {
    render(<ModalProvider><Dashboard /></ModalProvider>);
    await waitFor(() => {
      const twos = screen.getAllByText('2');
      expect(twos.length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByText('UPS Devices')).toBeInTheDocument();
    expect(screen.getByText('3/3')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
  });

  it('shows UPS table with gauge values', async () => {
    render(<ModalProvider><Dashboard /></ModalProvider>);
    await waitFor(() => expect(screen.getByText('ups1')).toBeInTheDocument());
    await waitFor(() => {
      expect(screen.getByText('85%')).toBeInTheDocument();
      expect(screen.getByText('22%')).toBeInTheDocument();
    });
  });

  it('shows empty state when no UPS devices', async () => {
    mockApi.mockImplementation((url: string) => {
      if (url === API.UPS) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    render(<ModalProvider><Dashboard /></ModalProvider>);
    await waitFor(() => {
      expect(screen.getByText('No UPS devices configured.')).toBeInTheDocument();
    });
  });

  it('shows services list', async () => {
    render(<ModalProvider><Dashboard /></ModalProvider>);
    await waitFor(() => {
      expect(screen.getByText('nut-server')).toBeInTheDocument();
      expect(screen.getByText('nut-monitor')).toBeInTheDocument();
    });
  });

  it('shows user count from users list', async () => {
    render(<ModalProvider><Dashboard /></ModalProvider>);
    await waitFor(() => {
      const twos = screen.getAllByText('2');
      expect(twos.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows Degraded health when core service is inactive', async () => {
    mockApi.mockImplementation((url: string) => {
      if (url === API.UPS) return Promise.resolve(MOCK_UPS_LIST);
      if (url === API.USERS) return Promise.resolve(MOCK_USERS);
      if (url === API.SERVICE_STATUS) return Promise.resolve({
        'nut-server': { active: false, state: 'dead' },
        'nut-monitor': { active: true, state: 'running' },
      });
      const match = url.match(/\/ups\/([^/]+)\/detail/);
      if (match) return Promise.resolve(MOCK_DETAILS[match[1]] ?? null);
      return Promise.resolve(null);
    });

    render(<ModalProvider><Dashboard /></ModalProvider>);
    await waitFor(() => {
      expect(screen.getByText('Degraded')).toBeInTheDocument();
    });
  });

  it('shows Failed health when a service is in failed state', async () => {
    mockApi.mockImplementation((url: string) => {
      if (url === API.UPS) return Promise.resolve(MOCK_UPS_LIST);
      if (url === API.USERS) return Promise.resolve(MOCK_USERS);
      if (url === API.SERVICE_STATUS) return Promise.resolve({
        'nut-server': { active: true, state: 'failed' },
        'nut-monitor': { active: true, state: 'running' },
      });
      const match = url.match(/\/ups\/([^/]+)\/detail/);
      if (match) return Promise.resolve(MOCK_DETAILS[match[1]] ?? null);
      return Promise.resolve(null);
    });

    render(<ModalProvider><Dashboard /></ModalProvider>);
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows resource gauges when data is available', async () => {
    render(<ModalProvider><Dashboard /></ModalProvider>);
    await waitFor(() => {
      expect(screen.getByText('CPU')).toBeInTheDocument();
    });
    expect(screen.getByText('CPU Usage')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.getByText('Disk Usage')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('26%')).toBeInTheDocument();
      expect(screen.getByText('60%')).toBeInTheDocument();
      expect(screen.getByText('45%')).toBeInTheDocument();
    });
  });

  it('reloads page after restart_nutwatch', async () => {
    const originalLocation = window.location;
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { reload: reloadMock },
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true } as Response) as unknown as typeof fetch;

    mockApi.mockImplementation((url: string, opts?: RequestInit) => {
      if (url === API.UPS) return Promise.resolve(MOCK_UPS_LIST);
      if (url === API.USERS) return Promise.resolve(MOCK_USERS);
      if (url === API.SERVICE_STATUS) return Promise.resolve(MOCK_SERVICES);
      if (url === API.SYSTEM_RESOURCES) return Promise.resolve(MOCK_RESOURCES);
      if (url === API.SYSTEM_RESTART_NUTWATCH && opts?.method === 'POST') return Promise.resolve({});
      const match = url.match(/\/ups\/([^/]+)\/detail/);
      if (match) return Promise.resolve(MOCK_DETAILS[match[1]] ?? null);
      return Promise.resolve(null);
    });

    try {
      const user = userEvent.setup();
      render(<ModalProvider><Dashboard /></ModalProvider>);
      await waitFor(() => expect(screen.getByText('UPS Devices')).toBeInTheDocument());

      await user.click(screen.getByText('Restart NutWatch'));
      const confirmButtons = screen.getAllByRole('button', { name: 'Restart NutWatch' });
      await user.click(confirmButtons[confirmButtons.length - 1]);

      await waitFor(() => expect(reloadMock).toHaveBeenCalled(), { timeout: 5000 });
    } finally {
      Object.defineProperty(window, 'location', { writable: true, value: originalLocation });
      globalThis.fetch = originalFetch;
    }
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WakeOnLan from '../../components/WakeOnLan';
import { ModalProvider } from '../../components/Modal';
import { ConfirmProvider } from '../../components/ConfirmDialog';
import { API } from '../../constants';

vi.mock('../../api', () => ({
  api: vi.fn(),
}));

import { api } from '../../api';
const mockApi = vi.mocked(api);

const MOCK_HOSTS = [
  { ip: '192.168.1.1', mac: 'AA:BB:CC:DD:EE:FF', hostname: 'router' },
  { ip: '192.168.1.100', mac: '11:22:33:44:55:66', hostname: '' },
];

function renderWoL() {
  return render(
    <ConfirmProvider>
      <ModalProvider>
        <WakeOnLan />
      </ModalProvider>
    </ConfirmProvider>
  );
}

describe('WakeOnLan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.mockImplementation((url: string) => {
      if (url === API.WOL_TARGETS) return Promise.resolve({ targets: {} });
      if (url === API.WOL_MAPPINGS) return Promise.resolve({ mappings: [] });
      if (url === API.UPS) return Promise.resolve([]);
      if (url === API.WOL_NETWORK_HOSTS) return Promise.resolve({ hosts: MOCK_HOSTS });
      return Promise.resolve(null);
    });
  });

  it('renders the Targets and Event Mappings sections', async () => {
    renderWoL();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Targets' })).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Event Mappings' })).toBeInTheDocument();
  });

  it('shows empty state when no targets configured', async () => {
    renderWoL();
    await waitFor(() =>
      expect(screen.getByText('No WOL targets configured.')).toBeInTheDocument()
    );
  });

  it('renders existing targets in the table', async () => {
    mockApi.mockImplementation((url: string) => {
      if (url === API.WOL_TARGETS) return Promise.resolve({
        targets: { server: { mac: 'AA:BB:CC:DD:EE:FF', broadcast: '255.255.255.255', description: 'Main server' } },
      });
      if (url === API.WOL_MAPPINGS) return Promise.resolve({ mappings: [] });
      if (url === API.UPS) return Promise.resolve([]);
      if (url === API.WOL_NETWORK_HOSTS) return Promise.resolve({ hosts: [] });
      return Promise.resolve(null);
    });
    renderWoL();
    await waitFor(() => expect(screen.getByText('server')).toBeInTheDocument());
    expect(screen.getByText('Main server')).toBeInTheDocument();
  });

  it('opens Add Target modal when button is clicked', async () => {
    const user = userEvent.setup();
    renderWoL();
    await user.click(screen.getByRole('button', { name: 'Add Target' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Add Target' })).toBeInTheDocument());
    expect(screen.getByPlaceholderText('AA:BB:CC:DD:EE:FF')).toBeInTheDocument();
  });

  it('MAC input has list attribute wired to datalist', async () => {
    const user = userEvent.setup();
    renderWoL();
    await user.click(screen.getByRole('button', { name: 'Add Target' }));
    await waitFor(() => {
      const macInput = screen.getByPlaceholderText('AA:BB:CC:DD:EE:FF');
      expect(macInput).toHaveAttribute('list', 'wol-mac-suggestions');
    });
    expect(document.getElementById('wol-mac-suggestions')).toBeInTheDocument();
  });

  it('datalist is populated with network host MACs', async () => {
    const user = userEvent.setup();
    renderWoL();
    await user.click(screen.getByRole('button', { name: 'Add Target' }));
    await waitFor(() => {
      const datalist = document.getElementById('wol-mac-suggestions');
      expect(datalist?.querySelector('option[value="AA:BB:CC:DD:EE:FF"]')).toBeTruthy();
      expect(datalist?.querySelector('option[value="11:22:33:44:55:66"]')).toBeTruthy();
    });
  });

  it('auto-fills Name from hostname when MAC matches a discovered host', async () => {
    const user = userEvent.setup();
    renderWoL();
    await user.click(screen.getByRole('button', { name: 'Add Target' }));

    await waitFor(() => {
      const datalist = document.getElementById('wol-mac-suggestions');
      expect(datalist?.querySelector('option[value="AA:BB:CC:DD:EE:FF"]')).toBeTruthy();
    });

    const macInput = screen.getByPlaceholderText('AA:BB:CC:DD:EE:FF');
    await user.type(macInput, 'AA:BB:CC:DD:EE:FF');

    await waitFor(() =>
      expect(screen.getByDisplayValue('router')).toBeInTheDocument()
    );
  });

  it('does not auto-fill Name when hostname starts with a digit', async () => {
    mockApi.mockImplementation((url: string) => {
      if (url === API.WOL_TARGETS) return Promise.resolve({ targets: {} });
      if (url === API.WOL_MAPPINGS) return Promise.resolve({ mappings: [] });
      if (url === API.UPS) return Promise.resolve([]);
      if (url === API.WOL_NETWORK_HOSTS) return Promise.resolve({
        hosts: [{ ip: '10.0.0.1', mac: 'AA:BB:CC:DD:EE:FF', hostname: '10.0.0.1' }],
      });
      return Promise.resolve(null);
    });

    const user = userEvent.setup();
    renderWoL();
    await user.click(screen.getByRole('button', { name: 'Add Target' }));

    await waitFor(() => {
      const datalist = document.getElementById('wol-mac-suggestions');
      expect(datalist?.querySelector('option[value="AA:BB:CC:DD:EE:FF"]')).toBeTruthy();
    });

    const macInput = screen.getByPlaceholderText('AA:BB:CC:DD:EE:FF');
    await user.type(macInput, 'AA:BB:CC:DD:EE:FF');

    // Name should remain empty — hostname starts with a digit so it's skipped
    expect(screen.queryByDisplayValue('10.0.0.1')).not.toBeInTheDocument();
    const nameInput = screen.getAllByRole('textbox')[0] as HTMLInputElement;
    expect(nameInput.value).toBe('');
  });

  it('does not auto-fill Name when it is already set', async () => {
    const user = userEvent.setup();
    renderWoL();
    await user.click(screen.getByRole('button', { name: 'Add Target' }));

    await waitFor(() => {
      const datalist = document.getElementById('wol-mac-suggestions');
      expect(datalist?.querySelector('option[value="AA:BB:CC:DD:EE:FF"]')).toBeTruthy();
    });

    const nameInput = screen.getAllByRole('textbox')[0];
    await user.type(nameInput, 'my-server');

    const macInput = screen.getByPlaceholderText('AA:BB:CC:DD:EE:FF');
    await user.type(macInput, 'AA:BB:CC:DD:EE:FF');

    expect(screen.getByDisplayValue('my-server')).toBeInTheDocument();
  });

  it('shows validation error when saving with empty Name', async () => {
    const user = userEvent.setup();
    renderWoL();
    await user.click(screen.getByRole('button', { name: 'Add Target' }));
    await waitFor(() => screen.getByRole('heading', { name: 'Add Target' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.getByText('Name is required')).toBeInTheDocument()
    );
  });

  it('shows validation error for invalid MAC format', async () => {
    const user = userEvent.setup();
    renderWoL();
    await user.click(screen.getByRole('button', { name: 'Add Target' }));
    await waitFor(() => screen.getByRole('heading', { name: 'Add Target' }));
    await user.type(screen.getAllByRole('textbox')[0], 'myserver');
    await user.type(screen.getByPlaceholderText('AA:BB:CC:DD:EE:FF'), 'not-a-mac');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.getByText(/Invalid MAC address format/)).toBeInTheDocument()
    );
  });

  it('gracefully handles network-hosts fetch failure', async () => {
    mockApi.mockImplementation((url: string) => {
      if (url === API.WOL_TARGETS) return Promise.resolve({ targets: {} });
      if (url === API.WOL_MAPPINGS) return Promise.resolve({ mappings: [] });
      if (url === API.UPS) return Promise.resolve([]);
      if (url === API.WOL_NETWORK_HOSTS) return Promise.reject(new Error('network error'));
      return Promise.resolve(null);
    });

    const user = userEvent.setup();
    renderWoL();
    await user.click(screen.getByRole('button', { name: 'Add Target' }));
    await waitFor(() => screen.getByRole('heading', { name: 'Add Target' }));
    expect(screen.getByPlaceholderText('AA:BB:CC:DD:EE:FF')).toBeInTheDocument();
    const datalist = document.getElementById('wol-mac-suggestions');
    expect(datalist?.querySelectorAll('option')).toHaveLength(0);
  });
});

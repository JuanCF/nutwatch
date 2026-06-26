import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModalProvider } from '../../components/Modal';
import RestartPromptModal from '../../components/RestartPromptModal';

describe('RestartPromptModal', () => {
  it('renders title and message', () => {
    const onClose = vi.fn();
    const onRestart = vi.fn();

    render(
      <ModalProvider>
        <RestartPromptModal
          title="Config Saved"
          message={<p>File saved successfully.</p>}
          onClose={onClose}
          onRestart={onRestart}
        />
      </ModalProvider>
    );

    expect(screen.getByText('Config Saved')).toBeInTheDocument();
    expect(screen.getByText('File saved successfully.')).toBeInTheDocument();
  });

  it('renders default restartLabel when not provided', () => {
    const onClose = vi.fn();
    const onRestart = vi.fn();

    render(
      <ModalProvider>
        <RestartPromptModal
          title="Saved"
          message={<p>Done.</p>}
          onClose={onClose}
          onRestart={onRestart}
        />
      </ModalProvider>
    );

    expect(screen.getByRole('button', { name: 'Restart' })).toBeInTheDocument();
  });

  it('renders custom restartLabel', () => {
    const onClose = vi.fn();
    const onRestart = vi.fn();

    render(
      <ModalProvider>
        <RestartPromptModal
          title="Saved"
          message={<p>Done.</p>}
          restartLabel="Restart nut-monitor"
          onClose={onClose}
          onRestart={onRestart}
        />
      </ModalProvider>
    );

    expect(screen.getByRole('button', { name: 'Restart nut-monitor' })).toBeInTheDocument();
  });

  it('calls onClose when Close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onRestart = vi.fn();

    render(
      <ModalProvider>
        <RestartPromptModal
          title="Saved"
          message={<p>Done.</p>}
          onClose={onClose}
          onRestart={onRestart}
        />
      </ModalProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onRestart).not.toHaveBeenCalled();
  });

  it('calls closeModal then onRestart when restart button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onRestart = vi.fn().mockResolvedValue(undefined);

    render(
      <ModalProvider>
        <RestartPromptModal
          title="Saved"
          message={<p>Done.</p>}
          restartLabel="Restart All"
          onClose={onClose}
          onRestart={onRestart}
        />
      </ModalProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Restart All' }));
    expect(onRestart).toHaveBeenCalledTimes(1);
    // onClose is not called on restart — the modal close is handled by closeModal()
    expect(onClose).not.toHaveBeenCalled();
  });
});

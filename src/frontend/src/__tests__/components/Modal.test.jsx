import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModalProvider, useModal } from '../../components/Modal';

function ModalOpener() {
  const { openModal, closeModal } = useModal();
  return (
    <div>
      <button onClick={() => openModal(<div>modal content</div>)}>Open</button>
      <button onClick={() => openModal(<div><button onClick={closeModal}>Close from inside</button></div>)}>Open with close</button>
    </div>
  );
}

describe('Modal', () => {
  it('throws when useModal is used outside provider', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Bad() {
      useModal();
      return null;
    }
    try {
      expect(() => render(<Bad />)).toThrow('useModal must be used within ModalProvider');
    } finally {
      err.mockRestore();
    }
  });

  it('opens and displays modal content', async () => {
    const user = userEvent.setup();
    render(
      <ModalProvider>
        <ModalOpener />
      </ModalProvider>
    );
    expect(screen.queryByText('modal content')).not.toBeInTheDocument();
    await user.click(screen.getByText('Open'));
    expect(screen.getByText('modal content')).toBeInTheDocument();
  });

  it('closes modal when clicking outside overlay', async () => {
    const user = userEvent.setup();
    render(
      <ModalProvider>
        <ModalOpener />
      </ModalProvider>
    );
    await user.click(screen.getByText('Open'));
    expect(screen.getByText('modal content')).toBeInTheDocument();
    const overlay = document.querySelector('.modal-overlay');
    await user.click(overlay);
    expect(screen.queryByText('modal content')).not.toBeInTheDocument();
  });
});
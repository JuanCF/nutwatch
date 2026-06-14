import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';

interface ModalContextValue {
  openModal: (jsx: ReactNode) => void;
  closeModal: () => void;
  modalContent: ReactNode;
}

const ModalContext = createContext<ModalContextValue | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  const openModal = useCallback((jsx: ReactNode) => {
    triggerRef.current = document.activeElement;
    setContent(jsx);
  }, []);

  const closeModal = useCallback(() => {
    setContent(null);
  }, []);

  useEffect(() => {
    if (content && modalRef.current) {
      modalRef.current.focus();
    }
  }, [content]);

  useEffect(() => {
    if (!content && triggerRef.current instanceof HTMLElement) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [content]);

  return (
    <ModalContext.Provider value={{ openModal, closeModal, modalContent: content }}>
      {children}
      <div
        className={`modal-overlay ${content ? 'open' : ''}`}
        onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
      >
        <div className="modal" ref={modalRef} tabIndex={-1}>{content}</div>
      </div>
    </ModalContext.Provider>
  );
}

export function useModal(): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within ModalProvider');
  return ctx;
}

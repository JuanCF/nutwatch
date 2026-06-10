import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [content, setContent] = useState(null);
  const modalRef = useRef(null);
  const triggerRef = useRef(null);

  const openModal = useCallback((jsx) => {
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
    if (!content && triggerRef.current) {
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

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within ModalProvider');
  return ctx;
}
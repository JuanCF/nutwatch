import { createContext, useContext, useState, useCallback } from 'react';

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [content, setContent] = useState(null);

  const openModal = useCallback((jsx) => setContent(jsx), []);
  const closeModal = useCallback(() => setContent(null), []);

  return (
    <ModalContext.Provider value={{ openModal, closeModal, modalContent: content }}>
      {children}
      <div
        className={`modal-overlay ${content ? 'open' : ''}`}
        onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
      >
        <div className="modal">{content}</div>
      </div>
    </ModalContext.Provider>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within ModalProvider');
  return ctx;
}

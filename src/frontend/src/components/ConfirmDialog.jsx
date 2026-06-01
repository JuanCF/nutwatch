import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);
  const triggerRef = useRef(null);

  const dialog = useCallback((msg, danger = false) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      triggerRef.current = document.activeElement;
      setState({ msg, danger });
    });
  }, []);

  const confirm = useCallback((msg) => dialog(msg, false), [dialog]);
  const dangerConfirm = useCallback((msg) => dialog(msg, true), [dialog]);

  const alert = useCallback((msg, title) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      triggerRef.current = document.activeElement;
      setState({ msg, title, alert: true });
    });
  }, []);

  const dismiss = useCallback((val) => {
    setState(null);
    if (resolveRef.current) {
      resolveRef.current(val);
      resolveRef.current = null;
    }
    if (triggerRef.current) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (!state) return;
      if (e.key === 'Escape') { dismiss(state.alert ? undefined : false); e.preventDefault(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state, dismiss]);

  return (
    <ConfirmContext.Provider value={{ confirm, dangerConfirm, alert }}>
      {children}
      <div
        className={`modal-overlay ${state ? 'open' : ''}`}
        onClick={(e) => { if (e.target === e.currentTarget) dismiss(false); }}
      >
        <div className="modal confirm-modal" role="dialog" aria-modal="true" aria-label="Confirm action" tabIndex="-1">
          {state && (
            <>
              {state.title && <h3>{state.title}</h3>}
              <p>{state.msg}</p>
              <div className="modal-actions">
                {state.alert ? (
                  <button className="primary" onClick={() => dismiss(undefined)}>OK</button>
                ) : (
                  <>
                    <button className="secondary" onClick={() => dismiss(false)}>Cancel</button>
                    <button className={`primary ${state.danger ? 'danger' : ''}`} onClick={() => dismiss(true)}>
                      {state.danger ? 'Delete' : 'Confirm'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}

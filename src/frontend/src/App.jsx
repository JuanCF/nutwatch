import { useState, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import UpsDevices from './components/UpsDevices';
import Users from './components/Users';
import Notifications from './components/Notifications';
import Logs from './components/Logs';
import ConfigFiles from './components/ConfigFiles';
import HooksSection from './components/HooksSection';
import { ModalProvider } from './components/Modal';
import { ConfirmProvider } from './components/ConfirmDialog';
import { SECTIONS, SECTION_TITLES } from './constants';
import './App.css';

export default function App() {
  const [section, setSection] = useState(SECTIONS.DASHBOARD);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentHooksUps, setCurrentHooksUps] = useState('');

  const showSection = useCallback((id) => {
    setSection(id);
    setSidebarOpen(false);
  }, []);

  return (
    <ConfirmProvider>
      <ModalProvider>
        <div className={`app ${sidebarOpen ? 'sidebar-open' : ''}`}>
          <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
          <Sidebar active={section} onNavigate={showSection} />
          <main className="main">
            <div className="main-header">
              <button className="sidebar-toggle" onClick={() => setSidebarOpen(v => !v)}>
                &#9776;
              </button>
              <h2 id="page-title">{SECTION_TITLES[section] || 'Dashboard'}</h2>
            </div>
            <div className="content">
              <div className={`section ${section === SECTIONS.DASHBOARD ? 'active' : ''}`}>
                {section === SECTIONS.DASHBOARD && <Dashboard />}
              </div>
              <div className={`section ${section === SECTIONS.UPS ? 'active' : ''}`}>
                {section === SECTIONS.UPS && <UpsDevices onViewHooks={(name) => { setCurrentHooksUps(name); setSection(SECTIONS.HOOKS); }} />}
              </div>
              <div className={`section ${section === SECTIONS.USERS ? 'active' : ''}`}>
                {section === SECTIONS.USERS && <Users />}
              </div>
              <div className={`section ${section === SECTIONS.NOTIFICATIONS ? 'active' : ''}`}>
                {section === SECTIONS.NOTIFICATIONS && <Notifications />}
              </div>
              <div className={`section ${section === SECTIONS.LOGS ? 'active' : ''}`}>
                {section === SECTIONS.LOGS && <Logs />}
              </div>
              <div className={`section ${section === SECTIONS.CONFIG ? 'active' : ''}`}>
                {section === SECTIONS.CONFIG && <ConfigFiles />}
              </div>
              <div className={`section ${section === SECTIONS.HOOKS ? 'active' : ''}`}>
                {section === SECTIONS.HOOKS && <HooksSection upsname={currentHooksUps} onBack={() => showSection(SECTIONS.UPS)} />}
              </div>
            </div>
          </main>
        </div>
      </ModalProvider>
    </ConfirmProvider>
  );
}

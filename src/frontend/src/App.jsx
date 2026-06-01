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
import './App.css';

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  ups: 'UPS Devices',
  users: 'Users',
  notifications: 'Notifications',
  logs: 'Logs',
  config: 'Config Files',
  hooks: 'Hooks',
};

export default function App() {
  const [section, setSection] = useState('dashboard');
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
              <h2 id="page-title">{PAGE_TITLES[section] || 'Dashboard'}</h2>
            </div>
            <div className="content">
              <div className={`section ${section === 'dashboard' ? 'active' : ''}`}>
                {section === 'dashboard' && <Dashboard />}
              </div>
              <div className={`section ${section === 'ups' ? 'active' : ''}`}>
                {section === 'ups' && <UpsDevices onViewHooks={(name) => { setCurrentHooksUps(name); setSection('hooks'); }} />}
              </div>
              <div className={`section ${section === 'users' ? 'active' : ''}`}>
                {section === 'users' && <Users />}
              </div>
              <div className={`section ${section === 'notifications' ? 'active' : ''}`}>
                {section === 'notifications' && <Notifications />}
              </div>
              <div className={`section ${section === 'logs' ? 'active' : ''}`}>
                {section === 'logs' && <Logs />}
              </div>
              <div className={`section ${section === 'config' ? 'active' : ''}`}>
                {section === 'config' && <ConfigFiles />}
              </div>
              <div className={`section ${section === 'hooks' ? 'active' : ''}`}>
                {section === 'hooks' && <HooksSection upsname={currentHooksUps} onBack={() => showSection('ups')} />}
              </div>
            </div>
          </main>
        </div>
      </ModalProvider>
    </ConfirmProvider>
  );
}

import { useState } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import UpsDevices from './components/UpsDevices';
import Users from './components/Users';
import Notifications from './components/Notifications';
import Logs from './components/Logs';
import ConfigFiles from './components/ConfigFiles';
import HooksSection from './components/HooksSection';
import UpsDetail from './components/UpsDetail';
import ErrorBoundary from './components/ErrorBoundary';
import WakeOnLan from './components/WakeOnLan';
import { ThemeProvider } from './theme';
import { ModalProvider } from './components/Modal';
import { ConfirmProvider } from './components/ConfirmDialog';

const TITLES = {
  '/': 'Dashboard',
  '/ups': 'UPS Devices',
  '/users': 'Users',
  '/notifications': 'Notifications',
  '/logs': 'Logs',
  '/config': 'Config Files',
  '/wol': 'Wake on LAN',
};

function getTitle(pathname) {
  if (TITLES[pathname]) return TITLES[pathname];
  if (pathname.startsWith('/ups/') && pathname.endsWith('/hooks')) return 'Hooks';
  if (pathname.startsWith('/ups/')) return 'UPS Detail';
  return 'NutWatch';
}

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const title = getTitle(location.pathname);

  return (
    <ConfirmProvider>
      <ModalProvider>
        <div className={`app ${sidebarOpen ? 'sidebar-open' : ''}`}>
          <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
          <Sidebar onNavigate={() => setSidebarOpen(false)} />
          <main className="main">
            <div className="main-header">
              <button
                className="sidebar-toggle"
                onClick={() => setSidebarOpen(v => !v)}
                aria-label="Toggle navigation"
                aria-expanded={sidebarOpen}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <line x1="3" y1="12" x2="21" y2="12"/>
                  <line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              </button>
              <h2 id="page-title">{title}</h2>
            </div>
            <div className="content">
              <ErrorBoundary key={location.pathname}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/ups" element={<UpsDevices />} />
                  <Route path="/ups/:name" element={<UpsDetail />} />
                  <Route path="/ups/:name/hooks" element={<HooksSection />} />
                  <Route path="/users" element={<Users />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/logs" element={<Logs />} />
                  <Route path="/config" element={<ConfigFiles />} />
                  <Route path="/wol" element={<WakeOnLan />} />
                </Routes>
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </ModalProvider>
    </ConfirmProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <HashRouter>
        <AppLayout />
      </HashRouter>
    </ThemeProvider>
  );
}

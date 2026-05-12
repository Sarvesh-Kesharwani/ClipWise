import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AppProvider } from './store/AppContext';
import Dashboard from './pages/Dashboard';
import PlayerPage from './pages/PlayerPage';
import RemixPlayerPage from './pages/RemixPlayerPage';
import FeedPage from './pages/FeedPage';
import ReportsPage from './pages/ReportsPage';
import ThemeToggle from './components/ThemeToggle';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/player/:instanceId" element={<PlayerPage />} />
          <Route path="/remix/:remixId" element={<RemixPlayerPage />} />
        </Routes>
        <FloatingThemeToggle />
      </BrowserRouter>
    </AppProvider>
  );
}

// Show the floating toggle on every route except the Dashboard,
// which already mounts ThemeToggle inside its TopBar.
function FloatingThemeToggle() {
  const location = useLocation();
  if (location.pathname === '/' || location.pathname === '/feed' || location.pathname === '/reports') return null;
  return (
    <div className="floating-theme-toggle">
      <ThemeToggle variant="icon" />
    </div>
  );
}

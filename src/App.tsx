import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './store/AppContext';
import Dashboard from './pages/Dashboard';
import PlayerPage from './pages/PlayerPage';
import RemixPlayerPage from './pages/RemixPlayerPage';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/player/:instanceId" element={<PlayerPage />} />
          <Route path="/remix/:remixId" element={<RemixPlayerPage />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}

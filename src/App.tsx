import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './store/AppContext';
import Dashboard from './pages/Dashboard';
import PlayerPage from './pages/PlayerPage';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/player/:instanceId" element={<PlayerPage />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}

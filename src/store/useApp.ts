import { useContext } from 'react';
import { AppContext } from './AppContextValue';
import type { AppContextType } from './AppContextValue';

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

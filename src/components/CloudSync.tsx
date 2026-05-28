import { useApp } from '../store/useApp';

interface Props {
  compact?: boolean;
}

export default function CloudSync({ compact }: Props) {
  const { cloudSync, syncToCloud, loadFromCloud } = useApp();
  const isBusy = cloudSync.status === 'syncing'
    || cloudSync.status === 'loading'
    || cloudSync.status === 'restoring';

  if (compact) {
    return (
      <div className="cloud-sync-card compact">
        <div>
          <span className="cloud-sync-kicker">Supabase</span>
          <p className="cloud-sync-status">{cloudSync.message}</p>
        </div>
        <div className="cloud-sync-actions">
          <button
            className="cw-btn cw-btn-secondary"
            onClick={() => void loadFromCloud()}
            disabled={isBusy}
          >
            {cloudSync.status === 'loading' ? 'Loading...' : 'Load'}
          </button>
          <button
            className="cw-btn cw-btn-primary"
            onClick={() => void syncToCloud()}
            disabled={isBusy || !cloudSync.hasPendingChanges}
          >
            {cloudSync.status === 'syncing' ? 'Saving...' : cloudSync.hasPendingChanges ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cloud-sync-card">
      <div>
        <span className="cloud-sync-kicker">Supabase sync</span>
        <h3>Cloud backup</h3>
        <p className="cloud-sync-status">{cloudSync.message}</p>
      </div>
      <div className="cloud-sync-actions">
        <button
          className="cw-btn cw-btn-secondary"
          onClick={() => void loadFromCloud()}
          disabled={isBusy}
        >
          {cloudSync.status === 'loading' ? 'Loading...' : 'Load from Supabase'}
        </button>
        <button
          className="cw-btn cw-btn-primary"
          onClick={() => void syncToCloud()}
          disabled={isBusy || !cloudSync.hasPendingChanges}
        >
          {cloudSync.status === 'syncing' ? 'Saving...' : cloudSync.hasPendingChanges ? 'Save to Supabase' : 'Saved'}
        </button>
      </div>
    </div>
  );
}

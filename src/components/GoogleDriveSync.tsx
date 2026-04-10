import { useApp } from '../store/useApp';
import { formatTime } from '../utils/helpers';

export default function GoogleDriveSync() {
  const {
    cloudSync,
    signInWithGoogle,
    signOutGoogle,
    syncToGoogleDrive,
    loadFromGoogleDrive,
  } = useApp();
  const isBusy = cloudSync.status === 'signing-in'
    || cloudSync.status === 'syncing'
    || cloudSync.status === 'loading';
  const statusClass = cloudSync.status === 'error' ? 'error' : 'ready';
  const lastSynced = cloudSync.lastSyncedAt
    ? `Last sync ${formatDateTime(cloudSync.lastSyncedAt)}`
    : 'Not synced yet';

  return (
    <section className="cloud-sync" aria-live="polite">
      <div className="cloud-sync-copy">
        <span className="cloud-sync-kicker">Google Drive</span>
        <h2>Cloud sync</h2>
        <p>
          Save settings, videos, clips, watch counts, and summaries to your private Drive app data.
        </p>
        <p className={`cloud-sync-status ${statusClass}`}>
          {cloudSync.message}
        </p>
        {cloudSync.isSignedIn && (
          <p className="cloud-sync-meta">{lastSynced}</p>
        )}
        {!cloudSync.isConfigured && (
          <p className="cloud-sync-meta">
            Set VITE_GOOGLE_CLIENT_ID in your environment to turn this on.
          </p>
        )}
      </div>

      <div className="cloud-sync-actions">
        {!cloudSync.isSignedIn ? (
          <button
            className="btn-primary"
            onClick={() => void signInWithGoogle()}
            disabled={!cloudSync.isConfigured || isBusy}
          >
            {cloudSync.status === 'signing-in' ? 'Opening...' : 'Sign in with Google'}
          </button>
        ) : (
          <>
            <button
              className="btn-primary"
              onClick={() => void syncToGoogleDrive()}
              disabled={isBusy}
            >
              {cloudSync.status === 'syncing' ? 'Saving...' : 'Save now'}
            </button>
            <button
              className="btn-secondary"
              onClick={() => void loadFromGoogleDrive()}
              disabled={isBusy}
            >
              {cloudSync.status === 'loading' ? 'Loading...' : 'Load from Drive'}
            </button>
            <button
              className="btn-secondary"
              onClick={() => void signOutGoogle()}
              disabled={isBusy}
            >
              Sign out
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.toLocaleDateString()} ${formatTime(date.getHours() * 3600 + date.getMinutes() * 60)}`;
}

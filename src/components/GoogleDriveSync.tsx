import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../store/useApp';
import { formatTime } from '../utils/helpers';
import type { BackupListing } from '../utils/googleDriveSync';

interface Props {
  compact?: boolean;
}

export default function GoogleDriveSync({ compact }: Props) {
  const {
    cloudSync,
    signInWithGoogle,
    signOutGoogle,
    syncToGoogleDrive,
    loadFromGoogleDrive,
  } = useApp();
  const isBusy = cloudSync.status === 'signing-in'
    || cloudSync.status === 'syncing'
    || cloudSync.status === 'loading'
    || cloudSync.status === 'restoring'
    || cloudSync.requiresDriveRestore;
  const statusClass = cloudSync.status === 'error' ? 'error' : 'ready';
  const lastSynced = cloudSync.lastSyncedAt
    ? `Last sync ${formatDateTime(cloudSync.lastSyncedAt)}`
    : 'Not synced yet';

  if (compact) {
    return (
      <div className="cloud-sync-compact">
        <p className={`cloud-sync-status ${statusClass}`}>
          {cloudSync.message}
        </p>
        {cloudSync.isSignedIn && (
          <p className="cloud-sync-meta">{lastSynced}</p>
        )}
        <div className="cloud-sync-actions compact-actions">
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
                disabled={isBusy || cloudSync.requiresDriveRestore}
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
        {cloudSync.isSignedIn && <BackupRestoreCard compact />}
      </div>
    );
  }

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
              disabled={isBusy || cloudSync.requiresDriveRestore}
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

      {cloudSync.isSignedIn && <BackupRestoreCard />}
    </section>
  );
}

function BackupRestoreCard({ compact }: { compact?: boolean }) {
  const { cloudSync, listDriveBackups, restoreDriveBackup } = useApp();
  const [listing, setListing] = useState<BackupListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!cloudSync.isSignedIn) return;
    setLoading(true);
    try {
      const list = await listDriveBackups();
      setListing(list);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Could not list backups.';
      setResult({ ok: false, message: msg });
    } finally {
      setLoading(false);
    }
  }, [cloudSync.isSignedIn, listDriveBackups]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleRestore() {
    if (!listing) return;
    setConfirming(false);
    setRestoring(true);
    setResult(null);
    const r = await restoreDriveBackup(listing.defaultDate);
    setRestoring(false);
    if (!r.ok) {
      setResult({ ok: false, message: r.error ?? 'Restore failed.' });
      return;
    }
    const counts = r.restored
      ? ` Restored ${r.restored.videos} video${r.restored.videos === 1 ? '' : 's'}, ${r.restored.instances} instance${r.restored.instances === 1 ? '' : 's'}, ${r.restored.folders} folder${r.restored.folders === 1 ? '' : 's'}.`
      : '';
    setResult({ ok: true, message: `Restored from ${r.fromName ?? 'backup'}.${counts} Refreshing...` });
    await refresh();
    window.setTimeout(() => window.location.reload(), 1200);
  }

  const status = !listing
    ? (loading ? 'Checking for backups...' : '—')
    : listing.hasYesterdayBackup
      ? `Yesterday's backup is available (${listing.defaultDate}).`
      : `No daily backup found for yesterday (${listing.defaultDate}).`;

  return (
    <div className={`drive-backup-card ${compact ? 'compact' : ''}`}>
      <div className="drive-backup-header">
        <span className="drive-backup-kicker">Drive backup restore</span>
      </div>
      <p className="drive-backup-status">{status}</p>
      {listing && listing.backups.length > 0 && (
        <p className="drive-backup-meta">
          {listing.backups.length} backup file{listing.backups.length === 1 ? '' : 's'} stored.
        </p>
      )}

      {!confirming ? (
        <div className="drive-backup-actions">
          <button
            className="btn-secondary"
            onClick={() => setConfirming(true)}
            disabled={loading || restoring || !listing || !listing.hasYesterdayBackup}
            title={listing && !listing.hasYesterdayBackup ? 'No backup found for yesterday' : undefined}
          >
            Restore Yesterday
          </button>
          <button className="btn-secondary" onClick={() => void refresh()} disabled={loading || restoring}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      ) : (
        <div className="drive-backup-confirm">
          <p>
            This replaces your current Drive sync file with the backup from{' '}
            <strong>{listing?.defaultDate}</strong>. The current state will be snapshot first.
          </p>
          <div className="drive-backup-actions">
            <button className="btn-primary" onClick={() => void handleRestore()} disabled={restoring}>
              {restoring ? 'Restoring...' : 'Yes, restore'}
            </button>
            <button className="btn-secondary" onClick={() => setConfirming(false)} disabled={restoring}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <p className={`drive-backup-result ${result.ok ? 'ok' : 'err'}`}>{result.message}</p>
      )}
    </div>
  );
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.toLocaleDateString()} ${formatTime(date.getHours() * 3600 + date.getMinutes() * 60)}`;
}

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/useApp';
import FolderCard from '../components/FolderCard';
import AddVideoModal from '../components/AddVideoModal';
import InstanceSelector from '../components/InstanceSelector';
import GoogleDriveSync from '../components/GoogleDriveSync';
import WatchMixModal from '../components/WatchMixModal';
import RemixCard from '../components/RemixCard';
import ResetProgressModal from '../components/ResetProgressModal';
import VideoCard from '../components/VideoCard';
import { generateId } from '../utils/helpers';

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    videos,
    folders,
    remixes,
    cloudSync,
    signInWithGoogle,
    signOutGoogle,
    getInstancesForVideo,
    getInstance,
    getVideo,
    addFolder,
    renameFolder,
    deleteFolder,
    moveVideoToFolder,
    deleteRemix,
    resetProgress,
  } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showWatchMixModal, setShowWatchMixModal] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSettings && !showProfileMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (showSettings && settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
      if (showProfileMenu && profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettings, showProfileMenu]);

  function handleCreateFolder() {
    addFolder({
      id: generateId(),
      name: `New Folder`,
      createdAt: Date.now(),
    });
  }

  const profile = cloudSync.userProfile;
  const isSignedIn = cloudSync.isSignedIn;
  const uncategorizedVideos = videos.filter(
    video => !video.folderId || !folders.some(folder => folder.id === video.folderId)
  );
  const syncIndicator = getSyncIndicator(cloudSync);

  return (
    <div className="dashboard">
      <div className="dashboard-top-bar">
        {/* Left: Settings gear + cloud backup status */}
        <div className="dashboard-top-left">
          <div className="settings-wrap" ref={settingsRef}>
            <button
              className="settings-btn"
              onClick={() => setShowSettings(prev => !prev)}
              title="Settings"
              aria-label="Settings"
            >
              &#9881;
            </button>
            {showSettings && (
              <div className="settings-dropdown">
                <div className="settings-dropdown-section">
                  <span className="settings-dropdown-label">Google Drive Sync</span>
                  <GoogleDriveSync compact />
                </div>
                <div className="settings-dropdown-divider" />
                <button
                  className="settings-dropdown-item danger"
                  onClick={() => { setShowSettings(false); setShowResetModal(true); }}
                >
                  Reset All Progress
                </button>
              </div>
            )}
          </div>

          <span
            className={`cloud-sync-indicator ${syncIndicator.tone}`}
            title={syncIndicator.label}
            aria-label={syncIndicator.label}
            role="status"
          >
            <span className="cloud-sync-indicator-icon">&#9729;</span>
            <span className="cloud-sync-indicator-dot" />
          </span>
        </div>

        {/* Right: Profile avatar or sign-in */}
        <div className="profile-wrap" ref={profileRef}>
          {isSignedIn && profile ? (
            <>
              <button
                className="profile-avatar-btn"
                onClick={() => setShowProfileMenu(prev => !prev)}
                title={profile.name || profile.email}
              >
                {profile.picture ? (
                  <img
                    className="profile-avatar-img"
                    src={profile.picture}
                    alt={profile.name}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="profile-avatar-fallback">
                    {(profile.name || profile.email || '?')[0].toUpperCase()}
                  </span>
                )}
              </button>
              {showProfileMenu && (
                <div className="profile-dropdown">
                  <div className="profile-dropdown-header">
                    {profile.picture && (
                      <img
                        className="profile-dropdown-pic"
                        src={profile.picture}
                        alt=""
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <div className="profile-dropdown-info">
                      {profile.name && <strong>{profile.name}</strong>}
                      {profile.email && <span>{profile.email}</span>}
                    </div>
                  </div>
                  <div className="settings-dropdown-divider" />
                  <button
                    className="settings-dropdown-item"
                    onClick={() => { setShowProfileMenu(false); void signOutGoogle(); }}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </>
          ) : isSignedIn ? (
            <span className="profile-signed-in-badge" title="Signed in to Google Drive">
              &#9679;
            </span>
          ) : (
            <button
              className="profile-signin-btn"
              onClick={() => void signInWithGoogle()}
              disabled={!cloudSync.isConfigured || cloudSync.status === 'signing-in'}
              title="Sign in with Google"
            >
              Sign in
            </button>
          )}
        </div>
      </div>

      <header className="dashboard-header">
        <div className="logo">
          <span className="logo-icon">&#127916;</span>
          <h1>ClipWise</h1>
        </div>
        <p className="tagline">Watch smarter. Learn clip by clip.</p>
      </header>

      <div className="dashboard-actions">
        <button className="btn-primary btn-add" onClick={() => setShowAddModal(true)}>
          + Add Video
        </button>
        <button className="btn-primary btn-add watch-mix-btn" onClick={() => setShowWatchMixModal(true)}>
          Watch Mix
        </button>
        <button className="btn-secondary btn-add-folder" onClick={handleCreateFolder}>
          + New Folder
        </button>
      </div>

      {folders.length === 0 && videos.length === 0 && remixes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">&#128250;</div>
          <h2>No videos yet</h2>
          <p>Add a local video or paste a YouTube link to get started!</p>
          <button className="btn-primary" onClick={() => setShowAddModal(true)}>
            Add Your First Video
          </button>
        </div>
      ) : (
        <div className="folder-list">
          {remixes.length > 0 && (
            <section className="folder-card remix-folder">
              <div className="folder-header remix-folder-header">
                <div className="folder-title-row">
                  <span className="folder-icon">&#128256;</span>
                  <h2 className="folder-name">Remix</h2>
                  <span className="folder-count">{remixes.length} mix{remixes.length !== 1 ? 'es' : ''}</span>
                </div>
              </div>
              <div className="folder-body">
                <div className="video-grid">
                  {remixes.map(remix => (
                    <RemixCard
                      key={remix.id}
                      remix={remix}
                      getSourceClip={(instanceId, clipIndex) =>
                        getInstance(instanceId)?.clips.find(clip => clip.index === clipIndex)
                      }
                      getSourceTitle={videoId => getVideo(videoId)?.title ?? 'Missing video'}
                      onClick={() => navigate(`/remix/${remix.id}`)}
                      onDelete={() => deleteRemix(remix.id)}
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          {uncategorizedVideos.length > 0 && (
            <section className="folder-card">
              <div className="folder-header">
                <div className="folder-title-row">
                  <span className="folder-icon">&#128193;</span>
                  <h2 className="folder-name">Uncategorized</h2>
                  <span className="folder-count">
                    {uncategorizedVideos.length} video{uncategorizedVideos.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <div className="folder-body">
                <div className="video-grid">
                  {uncategorizedVideos.map(video => (
                    <div
                      key={video.id}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData('text/video-id', video.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                    >
                      <VideoCard
                        video={video}
                        instances={getInstancesForVideo(video.id)}
                        onClick={() => setSelectedVideoId(video.id)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {folders.map(folder => (
            <FolderCard
              key={folder.id}
              folder={folder}
              videos={videos.filter(v => v.folderId === folder.id)}
              getInstances={getInstancesForVideo}
              onVideoClick={setSelectedVideoId}
              onRename={renameFolder}
              onDelete={deleteFolder}
              onMoveVideo={moveVideoToFolder}
            />
          ))}
        </div>
      )}

      {showAddModal && <AddVideoModal onClose={() => setShowAddModal(false)} />}
      {showWatchMixModal && <WatchMixModal onClose={() => setShowWatchMixModal(false)} />}
      {selectedVideoId && (
        <InstanceSelector
          videoId={selectedVideoId}
          onClose={() => setSelectedVideoId(null)}
        />
      )}
      {showResetModal && (
        <ResetProgressModal
          onConfirm={resetProgress}
          onClose={() => setShowResetModal(false)}
        />
      )}
    </div>
  );
}

function getSyncIndicator(cloudSync: ReturnType<typeof useApp>['cloudSync']) {
  const isLatestProgressSynced = Boolean(
    cloudSync.isConfigured
    && cloudSync.isSignedIn
    && cloudSync.status !== 'error'
    && !cloudSync.hasPendingChanges
    && cloudSync.lastSyncedAt
  );

  return isLatestProgressSynced
    ? { tone: 'synced', label: 'Latest progress is synced to Google Drive' }
    : { tone: 'not-synced', label: 'Latest progress is not synced to Google Drive' };
}

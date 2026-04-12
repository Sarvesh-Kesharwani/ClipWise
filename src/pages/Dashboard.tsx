import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/useApp';
import FolderCard from '../components/FolderCard';
import AddVideoModal from '../components/AddVideoModal';
import InstanceSelector from '../components/InstanceSelector';
import GoogleDriveSync from '../components/GoogleDriveSync';
import WatchMixModal from '../components/WatchMixModal';
import RemixCard from '../components/RemixCard';
import { generateId } from '../utils/helpers';

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    videos,
    folders,
    remixes,
    getInstancesForVideo,
    getInstance,
    getVideo,
    addFolder,
    renameFolder,
    deleteFolder,
    moveVideoToFolder,
    deleteRemix,
  } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showWatchMixModal, setShowWatchMixModal] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);

  function handleCreateFolder() {
    addFolder({
      id: generateId(),
      name: `New Folder`,
      createdAt: Date.now(),
    });
  }

  return (
    <div className="dashboard">
      <div className="dashboard-sync-slot">
        <GoogleDriveSync />
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
              folderCount={folders.length}
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
    </div>
  );
}

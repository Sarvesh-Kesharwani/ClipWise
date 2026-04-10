import { useState } from 'react';
import { useApp } from '../store/useApp';
import FolderCard from '../components/FolderCard';
import AddVideoModal from '../components/AddVideoModal';
import InstanceSelector from '../components/InstanceSelector';
import GoogleDriveSync from '../components/GoogleDriveSync';
import { generateId } from '../utils/helpers';

export default function Dashboard() {
  const {
    videos,
    folders,
    getInstancesForVideo,
    addFolder,
    renameFolder,
    deleteFolder,
    moveVideoToFolder,
  } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
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
      <header className="dashboard-header">
        <div className="dashboard-sync-slot">
          <GoogleDriveSync />
        </div>
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
        <button className="btn-secondary btn-add-folder" onClick={handleCreateFolder}>
          + New Folder
        </button>
      </div>

      {folders.length === 0 && videos.length === 0 ? (
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
      {selectedVideoId && (
        <InstanceSelector
          videoId={selectedVideoId}
          onClose={() => setSelectedVideoId(null)}
        />
      )}
    </div>
  );
}

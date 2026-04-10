import { useState } from 'react';
import { useApp } from '../store/AppContext';
import VideoCard from '../components/VideoCard';
import AddVideoModal from '../components/AddVideoModal';
import InstanceSelector from '../components/InstanceSelector';

export default function Dashboard() {
  const { videos, getInstancesForVideo } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="logo">
          <span className="logo-icon">🎬</span>
          <h1>ClipWise</h1>
        </div>
        <p className="tagline">Watch smarter. Learn clip by clip.</p>
      </header>

      <div className="dashboard-actions">
        <button className="btn-primary btn-add" onClick={() => setShowAddModal(true)}>
          + Add Video
        </button>
      </div>

      {videos.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📺</div>
          <h2>No videos yet</h2>
          <p>Add a local video or paste a YouTube link to get started!</p>
          <button className="btn-primary" onClick={() => setShowAddModal(true)}>
            Add Your First Video
          </button>
        </div>
      ) : (
        <div className="video-grid">
          {videos.map(video => (
            <VideoCard
              key={video.id}
              video={video}
              instances={getInstancesForVideo(video.id)}
              onClick={() => setSelectedVideoId(video.id)}
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

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/useApp';
import type { Instance, Video } from '../types';
import { currentTimestamp, generateId, formatDuration, generateClipsForDuration } from '../utils/helpers';

interface Props {
  videoId: string;
  onClose: () => void;
}

export default function InstanceSelector({ videoId, onClose }: Props) {
  const navigate = useNavigate();
  const { getVideo, getInstancesForVideo, addInstance, deleteVideo, deleteInstance } = useApp();
  const video = getVideo(videoId);
  const instances = getInstancesForVideo(videoId);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [clipSize, setClipSize] = useState(2);

  if (!video) return null;

  function handleCreate() {
    if (!name.trim()) return;

    const clips = video!.duration > 0
      ? generateClipsForDuration(video!.duration, clipSize)
      : [];

    const instance: Instance = {
      id: generateId(),
      videoId,
      name: name.trim(),
      clipSizeMinutes: clipSize,
      clips,
      createdAt: currentTimestamp(),
    };

    addInstance(instance);
    setShowCreate(false);
    setName('');
  }

  function handleOpen(instanceId: string) {
    onClose();
    navigate(`/player/${instanceId}`);
  }

  function getProgress(inst: Instance) {
    if (inst.clips.length === 0) return { watched: 0, summarized: 0, total: 0, pct: 0 };
    const watched = inst.clips.filter(c => c.watchCount > 0).length;
    const summarized = inst.clips.filter(c => c.summary).length;
    return {
      watched,
      summarized,
      total: inst.clips.length,
      pct: Math.round((watched / inst.clips.length) * 100),
    };
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal instance-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{video.title}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <p className="modal-subtitle">
          {getSourceLabel(video.source)}
          {' - '}
          {video.duration > 0 ? formatDuration(video.duration) : 'Duration detected on play'}
        </p>

        <div className="instances-list">
          {instances.length === 0 && !showCreate && (
            <div className="empty-instances">
              <p>No instances yet!</p>
              <p className="hint">Create one to start watching in clips.</p>
            </div>
          )}

          {instances.map(inst => {
            const p = getProgress(inst);
            return (
              <div key={inst.id} className="instance-card">
                <div className="instance-main" onClick={() => handleOpen(inst.id)}>
                  <div className="instance-info">
                    <h3>{inst.name}</h3>
                    <span className="instance-meta">
                      {inst.clipSizeMinutes}min clips - {p.total || '?'} clips
                    </span>
                  </div>
                  {p.total > 0 && (
                    <div className="instance-progress">
                      <div className="mini-progress-bar">
                        <div className="mini-progress-watched" style={{ width: `${p.pct}%` }} />
                        <div
                          className="mini-progress-summarized"
                          style={{ width: `${Math.round((p.summarized / p.total) * 100)}%` }}
                        />
                      </div>
                      <span className="instance-pct">{p.pct}%</span>
                    </div>
                  )}
                </div>
                <button
                  className="instance-delete"
                  onClick={(e) => { e.stopPropagation(); deleteInstance(inst.id); }}
                  title="Delete instance"
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>

        {!showCreate ? (
          <button className="btn-primary btn-full" onClick={() => setShowCreate(true)}>
            + New Instance
          </button>
        ) : (
          <div className="create-form">
            <input
              className="input"
              type="text"
              placeholder="Instance name (e.g., First Pass, Deep Review)"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <div className="clip-size-picker">
              <label>Clip size (minutes):</label>
              <div className="size-buttons">
                {[1, 2, 3, 5, 10, 15].map(size => (
                  <button
                    key={size}
                    className={`size-btn ${clipSize === size ? 'active' : ''}`}
                    onClick={() => setClipSize(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleCreate} disabled={!name.trim()}>
                Create
              </button>
            </div>
            <p className="form-note">
              Clip size cannot be changed after creation. Create a new instance for a different size.
            </p>
          </div>
        )}

        <button
          className="btn-danger btn-full"
          onClick={() => { deleteVideo(videoId); onClose(); }}
        >
          Delete Video
        </button>
      </div>
    </div>
  );
}

function getSourceLabel(source: Video['source']): string {
  if (source === 'youtube') return 'YouTube';
  if (source === 'youlearn') return 'YouLearn';
  return 'Local';
}

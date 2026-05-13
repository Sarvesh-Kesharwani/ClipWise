import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/useApp';
import type { Instance, Video } from '../types';
import { currentTimestamp, generateId, formatDuration, generateClipsForDuration } from '../utils/helpers';

interface Props {
  videoId: string;
  onClose: () => void;
}

const CLIP_SIZES = [1, 2, 3, 5, 10, 15];

export default function InstanceSelector({ videoId, onClose }: Props) {
  const navigate = useNavigate();
  const { getVideo, getInstancesForVideo, addInstance, deleteVideo, deleteInstance } = useApp();
  const video = getVideo(videoId);
  const instances = getInstancesForVideo(videoId);

  if (!video) return null;

  function getInstanceForSize(size: number) {
    return instances
      .filter(inst => inst.clipSizeMinutes === size)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
  }

  function createInstance(size: number) {
    const clips = video!.duration > 0
      ? generateClipsForDuration(video!.duration, size)
      : [];

    const instance: Instance = {
      id: generateId(),
      videoId,
      name: `${size} min clips`,
      clipSizeMinutes: size,
      clips,
      createdAt: currentTimestamp(),
    };

    addInstance(instance);
    return instance;
  }

  function handleOpen(instanceId: string) {
    onClose();
    navigate(`/player/${instanceId}`);
  }

  function handleClipSize(size: number) {
    const instance = getInstanceForSize(size) ?? createInstance(size);
    handleOpen(instance.id);
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

  const customInstances = instances.filter(inst => !CLIP_SIZES.includes(inst.clipSizeMinutes));

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

        <div className="clip-size-launcher">
          <div className="clip-size-launcher-header">
            <h3>Choose clip size</h3>
            <p>Tap a size to start studying. ClipWise will reuse existing progress for that size.</p>
          </div>
          <div className="clip-size-option-grid">
            {CLIP_SIZES.map(size => {
              const inst = getInstanceForSize(size);
              const p = inst ? getProgress(inst) : null;
              const total = p?.total || (video.duration > 0 ? Math.ceil(video.duration / (size * 60)) : null);

              return (
                <div key={size} className={`clip-size-option ${inst ? 'has-progress' : ''}`}>
                  <button className="clip-size-launch" onClick={() => handleClipSize(size)}>
                    <strong>{size} min</strong>
                    <span>
                      {inst
                        ? `${p?.watched ?? 0}/${p?.total || '?'} watched`
                        : total
                          ? `${total} clips`
                          : 'Start'}
                    </span>
                    {p && p.total > 0 && (
                      <span className="instance-progress">
                        <span className="mini-progress-bar">
                          <span className="mini-progress-watched" style={{ width: `${p.pct}%` }} />
                          <span
                            className="mini-progress-summarized"
                            style={{ width: `${Math.round((p.summarized / p.total) * 100)}%` }}
                          />
                        </span>
                        <span className="instance-pct">{p.pct}%</span>
                      </span>
                    )}
                  </button>
                  {inst && (
                    <button
                      className="clip-size-delete"
                      onClick={(e) => { e.stopPropagation(); deleteInstance(inst.id); }}
                      title={`Delete ${size} minute clip progress`}
                    >
                      Delete
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {customInstances.length > 0 && (
          <div className="instances-list">
            <h3 className="instances-list-title">Other saved sessions</h3>
            {customInstances.map(inst => {
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

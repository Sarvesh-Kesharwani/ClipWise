import { useMemo, useState } from 'react';
import { useApp } from '../store/useApp';
import type { Remix, RemixClipRef } from '../types';
import { formatDuration, generateId } from '../utils/helpers';

interface Props {
  onClose: () => void;
  onCreated?: (remixId: string) => void;
}

interface SourceVideo {
  id: string;
  title: string;
  clipCount: number;
  totalDuration: number;
  instanceCount: number;
  selectable: boolean;
  unavailableReason: string;
}

export default function WatchMixModal({ onClose, onCreated }: Props) {
  const { videos, getInstancesForVideo, addRemix } = useApp();
  const sourceVideos = useMemo<SourceVideo[]>(() => {
    return videos
      .map(video => {
        const instances = getInstancesForVideo(video.id);
        const readyInstances = instances.filter(instance => instance.clips.length > 0);
        // Only count clips that haven't been watched or summarized
        const unwatchedClips = readyInstances.flatMap(instance =>
          instance.clips.filter(clip => clip.watchCount === 0 && !clip.summary.trim())
        );
        const clipCount = unwatchedClips.length;
        const totalDuration = unwatchedClips.reduce((sum, clip) => sum + clip.duration, 0);
        const selectable = clipCount > 0;
        const hasAnyClips = readyInstances.some(inst => inst.clips.length > 0);
        const unavailableReason = instances.length === 0
          ? 'Create an instance first.'
          : hasAnyClips
            ? 'All clips already watched or summarized.'
            : 'Open a clip instance once so ClipWise can generate clips.';
        return {
          id: video.id,
          title: video.title,
          clipCount,
          totalDuration,
          instanceCount: readyInstances.length,
          selectable,
          unavailableReason,
        };
      });
  }, [videos, getInstancesForVideo]);

  const [selectedVideoIds, setSelectedVideoIds] = useState(() =>
    sourceVideos.filter(video => video.selectable).map(video => video.id),
  );
  const [clipCount, setClipCount] = useState(() => Math.min(8, Math.max(1, totalClips(sourceVideos.filter(video => video.selectable)))));
  const [title, setTitle] = useState(() => `Watch Mix ${new Date().toLocaleDateString()}`);
  const [error, setError] = useState('');

  const selectedSources = sourceVideos.filter(video => selectedVideoIds.includes(video.id));
  const availableClips = totalClips(selectedSources);
  const safeClipCount = Math.min(Math.max(1, clipCount), Math.max(1, availableClips));

  function toggleVideo(videoId: string) {
    const source = sourceVideos.find(video => video.id === videoId);
    if (!source?.selectable) return;
    setSelectedVideoIds(prev => (
      prev.includes(videoId)
        ? prev.filter(id => id !== videoId)
        : [...prev, videoId]
    ));
    setError('');
  }

  function selectAllVideos() {
    setSelectedVideoIds(sourceVideos.filter(video => video.selectable).map(video => video.id));
    setError('');
  }

  function clearVideoSelection() {
    setSelectedVideoIds([]);
    setError('');
  }

  function handleCreate() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Name this mix first.');
      return;
    }
    if (selectedVideoIds.length === 0 || availableClips === 0) {
      setError('Choose at least one video that already has clips.');
      return;
    }

    const pool: RemixClipRef[] = [];
    for (const videoId of selectedVideoIds) {
      for (const instance of getInstancesForVideo(videoId)) {
        for (const clip of instance.clips) {
          // Skip clips that have already been watched or summarized
          if (clip.watchCount > 0 || clip.summary.trim()) continue;
          pool.push({
            id: generateId(),
            videoId,
            instanceId: instance.id,
            clipIndex: clip.index,
          });
        }
      }
    }

    const clipRefs = shuffle(pool).slice(0, safeClipCount);
    const remix: Remix = {
      id: generateId(),
      title: trimmedTitle,
      clipRefs,
      createdAt: Date.now(),
    };

    addRemix(remix);
    onCreated?.(remix.id);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal watch-mix-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Watch Mix</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <p className="modal-subtitle">
          Randomly save clips from selected videos. Watching the mix updates the original clips.
        </p>

        {sourceVideos.length === 0 ? (
          <div className="empty-instances">
            <p>No videos yet.</p>
            <p className="hint">Add a few videos first, then come back for a mix.</p>
          </div>
        ) : (
          <>
            <input
              className="input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Mix name"
            />

            <div className="mix-count-row">
              <label htmlFor="mix-clip-count">Clips in mix</label>
              <input
                id="mix-clip-count"
                className="input"
                type="number"
                min={1}
                max={Math.max(1, availableClips)}
                value={clipCount}
                onChange={e => setClipCount(Number(e.target.value) || 1)}
              />
              <span>{availableClips} available</span>
            </div>

            <div className="mix-selection-header">
              <div className="mix-selection-copy">
                <strong>Select source videos</strong>
                <span>{selectedVideoIds.length} selected, mix can pull from all of them</span>
              </div>
              <div className="mix-selection-actions">
                <button type="button" className="btn-secondary mix-selection-btn" onClick={selectAllVideos}>
                  Select all
                </button>
                <button type="button" className="btn-secondary mix-selection-btn" onClick={clearVideoSelection}>
                  Clear
                </button>
              </div>
            </div>

            <div className="mix-source-list">
              {sourceVideos.map(video => {
                const selected = selectedVideoIds.includes(video.id);
                return (
                  <button
                    type="button"
                    key={video.id}
                    className={`mix-source-option ${selected ? 'selected' : ''} ${video.selectable ? '' : 'disabled'}`}
                    onClick={() => toggleVideo(video.id)}
                    disabled={!video.selectable}
                  >
                    <span className="mix-source-check" aria-hidden="true">{selected ? 'On' : ''}</span>
                    <span className="mix-source-copy">
                      <strong>{video.title}</strong>
                      <span>
                        {video.selectable
                          ? `${video.clipCount} clip${video.clipCount !== 1 ? 's' : ''} from ${video.instanceCount} instance${video.instanceCount !== 1 ? 's' : ''}`
                          : video.unavailableReason}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="form-note">
              This mix will save {safeClipCount} clip{safeClipCount !== 1 ? 's' : ''} totaling about {formatDuration(estimateDuration(selectedSources, safeClipCount))}.
            </p>
          </>
        )}

        {error && <p className="error-msg">{error}</p>}

        <div className="form-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={handleCreate}
            disabled={sourceVideos.length === 0}
          >
            Save Mix
          </button>
        </div>
      </div>
    </div>
  );
}

function totalClips(sources: SourceVideo[]): number {
  return sources.reduce((sum, source) => sum + source.clipCount, 0);
}

function estimateDuration(sources: SourceVideo[], clipCount: number): number {
  if (sources.length === 0) return 0;
  const availableClips = totalClips(sources);
  const averageClipSeconds = availableClips > 0
    ? sources.reduce((sum, source) => sum + source.totalDuration, 0) / availableClips
    : 0;
  return clipCount * averageClipSeconds;
}

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

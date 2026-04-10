import { useState, useRef } from 'react';
import { useApp } from '../store/useApp';
import { storeVideoFile, extractVideoMetadata } from '../utils/videoDb';
import { extractYouTubeId, getYouTubeThumbnail, getYouTubeTitle, isPlaylistUrl, extractPlaylistId, fetchPlaylistVideoIds } from '../utils/youtube';
import { generateId } from '../utils/helpers';

interface Props {
  onClose: () => void;
}

export default function AddVideoModal({ onClose }: Props) {
  const { addVideo } = useApp();
  const [tab, setTab] = useState<'local' | 'youtube'>('local');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [playlistProgress, setPlaylistProgress] = useState<{ current: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleLocalFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);
    setError('');

    try {
      const { duration, thumbnail } = await extractVideoMetadata(file);
      const id = generateId();
      await storeVideoFile(id, file);

      addVideo({
        id,
        title: file.name.replace(/\.[^.]+$/, ''),
        source: 'local',
        duration,
        thumbnail,
        createdAt: Date.now(),
      });
      onClose();
    } catch {
      setError('Failed to process video file. Make sure it is a valid video.');
    } finally {
      setLoading(false);
    }
  }

  async function handleYouTube() {
    if (!youtubeUrl.trim()) return;

    // Check if it's a playlist URL
    if (isPlaylistUrl(youtubeUrl)) {
      await handlePlaylist();
      return;
    }

    const videoId = extractYouTubeId(youtubeUrl);
    if (!videoId) {
      setError('Invalid YouTube URL. Please paste a valid YouTube video or playlist link.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const title = await getYouTubeTitle(youtubeUrl);
      const thumbnail = getYouTubeThumbnail(videoId);

      addVideo({
        id: generateId(),
        title,
        source: 'youtube',
        youtubeId: videoId,
        youtubeUrl,
        duration: 0,
        thumbnail,
        createdAt: Date.now(),
      });
      onClose();
    } catch {
      setError('Failed to process YouTube URL.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePlaylist() {
    const playlistId = extractPlaylistId(youtubeUrl);
    if (!playlistId) {
      setError('Could not extract playlist ID from URL.');
      return;
    }

    setLoading(true);
    setError('');
    setPlaylistProgress(null);

    try {
      const videoIds = await fetchPlaylistVideoIds(playlistId);

      if (videoIds.length === 0) {
        setError('No videos found in this playlist. The playlist may be private or empty.');
        setLoading(false);
        return;
      }

      setPlaylistProgress({ current: 0, total: videoIds.length });

      for (let i = 0; i < videoIds.length; i++) {
        const vid = videoIds[i];
        const videoUrl = `https://www.youtube.com/watch?v=${vid}`;
        const title = await getYouTubeTitle(videoUrl);
        const thumbnail = getYouTubeThumbnail(vid);

        addVideo({
          id: generateId(),
          title,
          source: 'youtube',
          youtubeId: vid,
          youtubeUrl: videoUrl,
          duration: 0,
          thumbnail,
          createdAt: Date.now(),
        });

        setPlaylistProgress({ current: i + 1, total: videoIds.length });
      }

      onClose();
    } catch {
      setError('Failed to process playlist.');
    } finally {
      setLoading(false);
      setPlaylistProgress(null);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Video</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="tabs">
          <button
            className={`tab ${tab === 'local' ? 'active' : ''}`}
            onClick={() => { setTab('local'); setError(''); }}
          >
            Local File
          </button>
          <button
            className={`tab ${tab === 'youtube' ? 'active' : ''}`}
            onClick={() => { setTab('youtube'); setError(''); }}
          >
            YouTube
          </button>
        </div>

        <div className="tab-content">
          {tab === 'local' ? (
            <div className="local-tab">
              <div
                className="file-drop-zone"
                onClick={() => fileRef.current?.click()}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/*"
                  onChange={handleLocalFile}
                  style={{ display: 'none' }}
                />
                <div className="drop-icon">📁</div>
                <p>{fileName || 'Click to choose a video file'}</p>
                <span className="drop-hint">MP4, WebM, MKV, and more</span>
              </div>
            </div>
          ) : (
            <div className="youtube-tab">
              <input
                type="url"
                className="input"
                placeholder="Video or playlist URL..."
                value={youtubeUrl}
                onChange={e => setYoutubeUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleYouTube()}
              />
              <button
                className="btn-primary btn-full"
                onClick={handleYouTube}
                disabled={loading || !youtubeUrl.trim()}
              >
                {loading
                  ? playlistProgress
                    ? `Adding ${playlistProgress.current}/${playlistProgress.total} videos...`
                    : 'Processing...'
                  : 'Add Video'}
              </button>
              {playlistProgress && (
                <div className="loading-bar" style={{ marginTop: '8px' }}>
                  <div
                    className="loading-bar-fill"
                    style={{
                      width: `${(playlistProgress.current / playlistProgress.total) * 100}%`,
                      animation: 'none',
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {error && <p className="error-msg">{error}</p>}
        {loading && tab === 'local' && (
          <div className="loading-bar">
            <div className="loading-bar-fill" />
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import type { Folder, Video, Instance } from '../types';
import VideoCard from './VideoCard';

interface Props {
  folder: Folder;
  videos: Video[];
  getInstances: (videoId: string) => Instance[];
  onVideoClick: (videoId: string) => void;
  onRename: (folderId: string, name: string) => void;
  onDelete: (folderId: string) => void;
  onMoveVideo: (videoId: string, folderId: string) => void;
}

export default function FolderCard({
  folder,
  videos,
  getInstances,
  onVideoClick,
  onRename,
  onDelete,
  onMoveVideo,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(folder.name);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function handleRenameSubmit() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== folder.name) {
      onRename(folder.id, trimmed);
    } else {
      setEditName(folder.name);
    }
    setEditing(false);
  }

  const totalClips = videos.reduce((sum, v) =>
    sum + getInstances(v.id).reduce((s, inst) => s + inst.clips.length, 0), 0
  );
  const watchedClips = videos.reduce((sum, v) =>
    sum + getInstances(v.id).reduce((s, inst) => s + inst.clips.filter(c => c.watchCount > 0).length, 0), 0
  );
  const folderPct = totalClips > 0 ? Math.round((watchedClips / totalClips) * 100) : 0;

  function handleDeleteFolder() {
    const hasVideos = videos.length > 0;
    const message = hasVideos
      ? `Delete "${folder.name}"? Videos inside it will be moved out of the folder.`
      : `Delete "${folder.name}"?`;

    if (window.confirm(message)) {
      onDelete(folder.id);
    }
  }

  return (
    <div
      className={`folder-card ${dragOver ? 'drag-over' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        const videoId = e.dataTransfer.getData('text/video-id');
        if (videoId) onMoveVideo(videoId, folder.id);
      }}
    >
      <div className="folder-header" onClick={() => setExpanded(!expanded)}>
        <div className="folder-title-row">
          <span className={`folder-chevron ${expanded ? 'open' : ''}`}>&#9206;</span>
          <span className="folder-icon">&#128193;</span>
          {editing ? (
            <input
              ref={inputRef}
              className="folder-rename-input"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={e => {
                if (e.key === 'Enter') handleRenameSubmit();
                if (e.key === 'Escape') { setEditName(folder.name); setEditing(false); }
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <h2 className="folder-name">{folder.name}</h2>
          )}
          <span className="folder-count">{videos.length} video{videos.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="folder-header-right" onClick={e => e.stopPropagation()}>
          {totalClips > 0 && (
            <span className="folder-pct">{folderPct}%</span>
          )}
          <button
            className="folder-action-btn"
            title="Rename folder"
            onClick={() => { setEditName(folder.name); setEditing(true); }}
          >
            &#9998;
          </button>
          <button
            className="folder-action-btn danger"
            title="Delete folder"
            onClick={handleDeleteFolder}
          >
            &times;
          </button>
        </div>
      </div>

      {totalClips > 0 && (
        <div className="folder-progress-bar">
          <div className="folder-progress-fill" style={{ width: `${folderPct}%` }} />
        </div>
      )}

      {expanded && (
        <div className="folder-body">
          {videos.length === 0 ? (
            <p className="folder-empty">Drag videos here or add a new one.</p>
          ) : (
            <div className="video-grid">
              {videos.map(video => (
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
                    instances={getInstances(video.id)}
                    onClick={() => onVideoClick(video.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

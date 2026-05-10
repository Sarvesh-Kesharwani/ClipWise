import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { Folder, Video } from '../../types';
import { formatTime } from '../../utils/helpers';
import { getFolderDepth } from '../../utils/folders';

export interface FeedFolderGroup {
  key: string;
  name: string;
  depth: number;
  videos: Video[];
}

interface Props {
  groups: FeedFolderGroup[];
  folders: Folder[];
  selectedFolderId: string;
  sourceFolderIds: string[];
  selectedVideosCount: number;
  clipSize: number;
  clipSizes: number[];
  autoStart: boolean;
  preferSound: boolean;
  includeSubfolders: boolean;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  onSelectFolder: (folderId: string) => void;
  onSourceFolderToggle: (folderId: string) => void;
  onClipSizeChange: (size: number) => void;
  onAutoStartChange: (value: boolean) => void;
  onPreferSoundChange: (value: boolean) => void;
  onIncludeSubfoldersChange: (value: boolean) => void;
}

export default function ListManager({
  groups,
  folders,
  selectedFolderId,
  sourceFolderIds,
  selectedVideosCount,
  clipSize,
  clipSizes,
  autoStart,
  preferSound,
  includeSubfolders,
  settingsOpen,
  onSettingsOpenChange,
  onSelectFolder,
  onSourceFolderToggle,
  onClipSizeChange,
  onAutoStartChange,
  onPreferSoundChange,
  onIncludeSubfoldersChange,
}: Props) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const sourceSet = new Set(sourceFolderIds);
  const allSourcesEnabled = sourceFolderIds.length === 0;

  function toggleCollapse(key: string) {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section className="feed-builder feed-builder-folder-first">
      {settingsOpen && (
        <div className="feed-panel feed-settings-panel">
          <div className="feed-panel-header">
            <div>
              <h2>Feed settings</h2>
              <span>Folders, clips, playback</span>
            </div>
            <button className="feed-panel-close" onClick={() => onSettingsOpenChange(false)}>
              Close
            </button>
          </div>

          <div className="feed-settings-grid">
            <div className="feed-setting-block">
              <strong>Source folders</strong>
              <p>Leave all unchecked to use every folder.</p>
              <label className="feed-toggle-row">
                <input
                  type="checkbox"
                  checked={includeSubfolders}
                  onChange={event => onIncludeSubfoldersChange(event.target.checked)}
                />
                <span>Include nested subfolders in playback</span>
              </label>
              <div className="feed-source-list">
                {folders.map(folder => (
                  <label
                    key={folder.id}
                    className="feed-source-row"
                    style={{ '--folder-depth': getFolderDepth(folder, folders) } as CSSProperties}
                  >
                    <input
                      type="checkbox"
                      checked={!allSourcesEnabled && sourceSet.has(folder.id)}
                      onChange={() => onSourceFolderToggle(folder.id)}
                    />
                    <span>{folder.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="feed-setting-block">
              <strong>Clip size</strong>
              <div className="feed-size-buttons" role="group" aria-label="Clip size">
                {clipSizes.map(size => (
                  <button
                    key={size}
                    className={`size-btn ${clipSize === size ? 'active' : ''}`}
                    onClick={() => onClipSizeChange(size)}
                  >
                    {size}s
                  </button>
                ))}
              </div>
            </div>

            <div className="feed-setting-block">
              <strong>Playback</strong>
              <label className="feed-toggle-row">
                <input
                  type="checkbox"
                  checked={autoStart}
                  onChange={event => onAutoStartChange(event.target.checked)}
                />
                <span>Auto-start last selected folder</span>
              </label>
              <label className="feed-toggle-row">
                <input
                  type="checkbox"
                  checked={preferSound}
                  onChange={event => onPreferSoundChange(event.target.checked)}
                />
                <span>Start with sound when browser allows it</span>
              </label>
            </div>
          </div>
        </div>
      )}

      <div className="feed-panel feed-folders-panel">
        <div className="feed-panel-header">
          <div>
            <h2>Folders</h2>
            <span>{selectedVideosCount} clips source videos selected</span>
          </div>
        </div>

        <div className="feed-video-picker">
          {groups.length === 0 ? (
            <p className="feed-empty-copy">Add videos to folders on dashboard first.</p>
          ) : groups.map(group => {
            const isCollapsed = collapsedFolders.has(group.key);
            const isSelected = selectedFolderId === group.key;
            return (
              <div
                key={group.key}
                className={`feed-folder-group ${isSelected ? 'selected' : ''}`}
                style={{ '--folder-depth': group.depth } as CSSProperties}
              >
                <div className="feed-folder-group-header">
                  <button
                    type="button"
                    className="feed-folder-toggle"
                    onClick={() => toggleCollapse(group.key)}
                    aria-expanded={!isCollapsed}
                  >
                    <span className={`folder-chevron ${isCollapsed ? '' : 'open'}`}>⌃</span>
                    <strong>{group.name}</strong>
                    <span className="feed-folder-count">
                      {group.videos.length} video{group.videos.length !== 1 ? 's' : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="feed-folder-play"
                    onClick={() => onSelectFolder(group.key)}
                  >
                    {isSelected ? 'Selected' : 'Use'}
                  </button>
                </div>
                {!isCollapsed && (
                  <div className="feed-folder-group-body">
                    {group.videos.map(video => (
                      <div key={video.id} className="feed-video-option feed-video-option-readonly">
                        <span className="feed-video-thumb">
                          {video.thumbnail ? <img src={video.thumbnail} alt="" /> : <span>{video.source === 'youtube' ? 'Play' : 'Local'}</span>}
                        </span>
                        <span className="feed-video-copy">
                          <strong>{video.title}</strong>
                          <span>{video.duration > 0 ? formatTime(video.duration) : 'Duration loads during playback'}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

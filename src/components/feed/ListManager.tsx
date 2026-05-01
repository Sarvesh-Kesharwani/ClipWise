import type { FeedList, Video } from '../../types';
import { formatTime, generateId } from '../../utils/helpers';

interface Props {
  videos: Video[];
  feedLists: FeedList[];
  selectedList: FeedList | null;
  selectedVideosCount: number;
  clipSize: number;
  newListName: string;
  clipSizes: number[];
  onNewListNameChange: (name: string) => void;
  onCreateList: (list: FeedList) => void;
  onSelectList: (listId: string) => void;
  onRenameList: (listId: string, name: string) => void;
  onDeleteList: (listId: string) => void;
  onToggleVideo: (videoId: string) => void;
  onClipSizeChange: (size: number) => void;
  onStartFeed: () => void;
  canStartFeed: boolean;
}

export default function ListManager({
  videos,
  feedLists,
  selectedList,
  selectedVideosCount,
  clipSize,
  newListName,
  clipSizes,
  onNewListNameChange,
  onCreateList,
  onSelectList,
  onRenameList,
  onDeleteList,
  onToggleVideo,
  onClipSizeChange,
  onStartFeed,
  canStartFeed,
}: Props) {
  function createList() {
    const now = Date.now();
    onCreateList({
      id: generateId(),
      name: newListName.trim() || `Feed List ${feedLists.length + 1}`,
      videoIds: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  function renameSelectedList() {
    if (!selectedList) return;
    const name = window.prompt('Rename list', selectedList.name)?.trim();
    if (name) onRenameList(selectedList.id, name);
  }

  function deleteSelectedList() {
    if (!selectedList) return;
    if (window.confirm(`Delete "${selectedList.name}"?`)) onDeleteList(selectedList.id);
  }

  return (
    <section className="feed-builder">
      <div className="feed-panel feed-list-panel">
        <div className="feed-panel-header">
          <div>
            <h2>Lists</h2>
            <span>{feedLists.length} saved</span>
          </div>
        </div>

        <div className="feed-create-row">
          <input
            className="input"
            value={newListName}
            onChange={event => onNewListNameChange(event.target.value)}
            onKeyDown={event => event.key === 'Enter' && createList()}
            placeholder="New list name"
          />
          <button className="btn-primary" onClick={createList}>Create</button>
        </div>

        <div className="feed-list-stack">
          {feedLists.length === 0 ? (
            <p className="feed-empty-copy">Create a list to start building your feed.</p>
          ) : feedLists.map(list => (
            <button
              key={list.id}
              className={`feed-list-row ${selectedList?.id === list.id ? 'active' : ''}`}
              onClick={() => onSelectList(list.id)}
            >
              <strong>{list.name}</strong>
              <span>{list.videoIds.length} video{list.videoIds.length !== 1 ? 's' : ''}</span>
            </button>
          ))}
        </div>

        {selectedList && (
          <div className="feed-list-actions">
            <button className="btn-secondary" onClick={renameSelectedList}>Rename</button>
            <button className="btn-danger" onClick={deleteSelectedList}>Delete</button>
          </div>
        )}
      </div>

      <div className="feed-panel feed-videos-panel">
        <div className="feed-panel-header">
          <div>
            <h2>{selectedList?.name ?? 'Select a list'}</h2>
            <span>{selectedVideosCount} selected videos</span>
          </div>
        </div>

        <div className="feed-clip-size-row">
          <span>Clip size</span>
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

        <div className="feed-video-picker">
          {videos.length === 0 ? (
            <p className="feed-empty-copy">Add videos on the dashboard first.</p>
          ) : videos.map(video => {
            const selected = Boolean(selectedList?.videoIds.includes(video.id));
            return (
              <button
                type="button"
                key={video.id}
                className={`feed-video-option ${selected ? 'selected' : ''}`}
                onClick={() => onToggleVideo(video.id)}
                disabled={!selectedList}
              >
                <span className="feed-video-thumb">
                  {video.thumbnail ? <img src={video.thumbnail} alt="" /> : <span>{video.source === 'youtube' ? 'Play' : 'Local'}</span>}
                </span>
                <span className="feed-video-copy">
                  <strong>{video.title}</strong>
                  <span>{video.duration > 0 ? formatTime(video.duration) : 'Duration loads during playback'}</span>
                </span>
                <span className="feed-check">{selected ? 'Added' : 'Add'}</span>
              </button>
            );
          })}
        </div>

        <button className="btn-primary feed-start-btn" onClick={onStartFeed} disabled={!canStartFeed}>
          Start Feed
        </button>
      </div>
    </section>
  );
}

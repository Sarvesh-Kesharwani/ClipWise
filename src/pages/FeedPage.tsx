import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/useApp';
import ClipPlayer from '../components/feed/ClipPlayer';
import ListManager from '../components/feed/ListManager';
import { createFeedClips } from '../components/feed/feedClips';
import MobileNav from '../components/MobileNav';
import type { Video } from '../types';

const CLIP_SIZES = [15, 30, 60];

export default function FeedPage() {
  const navigate = useNavigate();
  const {
    videos,
    feedLists,
    addFeedList,
    renameFeedList,
    deleteFeedList,
    setFeedListVideos,
    recordClipWatched,
  } = useApp();

  const [selectedListId, setSelectedListId] = useState(feedLists[0]?.id ?? '');
  const [clipSize, setClipSize] = useState(30);
  const [newListName, setNewListName] = useState('');
  const [isPlayingFeed, setIsPlayingFeed] = useState(false);
  const [activeClipId, setActiveClipId] = useState('');

  const selectedList = feedLists.find(list => list.id === (selectedListId || feedLists[0]?.id)) ?? null;
  const selectedVideos = useMemo(() => {
    if (!selectedList) return [];
    return selectedList.videoIds
      .map(videoId => videos.find(video => video.id === videoId))
      .filter((video): video is Video => Boolean(video));
  }, [selectedList, videos]);

  const feedClips = useMemo(() => createFeedClips(selectedVideos, clipSize), [clipSize, selectedVideos]);

  function handleCreateList(list: Parameters<typeof addFeedList>[0]) {
    addFeedList(list);
    setSelectedListId(list.id);
    setNewListName('');
    setIsPlayingFeed(false);
  }

  function handleDeleteList(listId: string) {
    deleteFeedList(listId);
    setSelectedListId(feedLists.find(list => list.id !== listId)?.id ?? '');
    setIsPlayingFeed(false);
  }

  function toggleVideo(videoId: string) {
    if (!selectedList) return;
    const nextVideoIds = selectedList.videoIds.includes(videoId)
      ? selectedList.videoIds.filter(id => id !== videoId)
      : [...selectedList.videoIds, videoId];
    setFeedListVideos(selectedList.id, nextVideoIds);
    setIsPlayingFeed(false);
  }

  if (isPlayingFeed && selectedList) {
    return (
      <ClipPlayer
        listName={selectedList.name}
        clipSize={clipSize}
        clips={feedClips}
        activeClipId={activeClipId}
        onActiveClipChange={setActiveClipId}
        onExit={() => setIsPlayingFeed(false)}
        onHome={() => navigate('/')}
        onClipComplete={recordClipWatched}
      />
    );
  }

  return (
    <div className="feed-page app-page-with-mobile-nav">
      <header className="feed-header">
        <button className="back-btn feed-back" onClick={() => navigate('/')}>Dashboard</button>
        <div>
          <h1>Feed</h1>
          <p>Build lists from saved videos, then watch them as short vertical clips.</p>
        </div>
      </header>

      <ListManager
        videos={videos}
        feedLists={feedLists}
        selectedList={selectedList}
        selectedVideosCount={selectedVideos.length}
        clipSize={clipSize}
        newListName={newListName}
        clipSizes={CLIP_SIZES}
        onNewListNameChange={setNewListName}
        onCreateList={handleCreateList}
        onSelectList={listId => { setSelectedListId(listId); setIsPlayingFeed(false); }}
        onRenameList={renameFeedList}
        onDeleteList={handleDeleteList}
        onToggleVideo={toggleVideo}
        onClipSizeChange={size => { setClipSize(size); setIsPlayingFeed(false); }}
        onStartFeed={() => {
          if (feedClips.length === 0) return;
          setActiveClipId(feedClips[0].id);
          setIsPlayingFeed(true);
        }}
        canStartFeed={Boolean(selectedList && feedClips.length > 0)}
      />

      <MobileNav />
    </div>
  );
}

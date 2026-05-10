import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/useApp';
import ClipPlayer from '../components/feed/ClipPlayer';
import ListManager, { type FeedFolderGroup } from '../components/feed/ListManager';
import { createFeedClips } from '../components/feed/feedClips';
import MobileNav from '../components/MobileNav';
import TopBar from '../components/dashboard/TopBar';
import {
  UNCATEGORIZED_FOLDER_KEY,
  getFolderDepth,
  getFolderOptions,
  getVideosForFolder,
} from '../utils/folders';
import type { Video } from '../types';

const CLIP_SIZES = [15, 30, 60];
const EMPTY_VIDEOS: Video[] = [];

export default function FeedPage() {
  const navigate = useNavigate();
  const {
    videos,
    folders,
    feedSettings,
    featureRequests,
    progress,
    cloudSync,
    updateFeedSettings,
    recordClipWatched,
  } = useApp();

  const folderOptions = useMemo(() => getFolderOptions(folders), [folders]);
  const sourceFolderIds = useMemo(() => feedSettings.sourceFolderIds ?? [], [feedSettings.sourceFolderIds]);
  const clipSize = feedSettings.clipSize || 30;
  const autoStart = feedSettings.autoStart ?? true;
  const preferSound = feedSettings.preferSound ?? false;
  const includeSubfolders = feedSettings.includeSubfolders ?? true;

  const groups = useMemo<FeedFolderGroup[]>(() => {
    const sourceSet = new Set(sourceFolderIds);
    const usingAllFolders = sourceFolderIds.length === 0;

    const folderGroups = folderOptions
      .filter(folder => usingAllFolders || sourceSet.has(folder.id))
      .map(folder => ({
        key: folder.id,
        name: folder.name,
        depth: getFolderDepth(folder, folders),
        videos: getVideosForFolder(videos, folders, folder.id, includeSubfolders),
      }))
      .filter(group => group.videos.length > 0);

    const uncategorized = getVideosForFolder(videos, folders, UNCATEGORIZED_FOLDER_KEY, false);
    if (uncategorized.length > 0 && usingAllFolders) {
      folderGroups.push({
        key: UNCATEGORIZED_FOLDER_KEY,
        name: 'Uncategorized',
        depth: 0,
        videos: uncategorized,
      });
    }

    return folderGroups;
  }, [folderOptions, folders, includeSubfolders, sourceFolderIds, videos]);

  const validLastFolderId = groups.some(group => group.key === feedSettings.lastFolderId)
    ? feedSettings.lastFolderId
    : groups[0]?.key ?? '';
  const [requestedFolderId, setRequestedFolderId] = useState(validLastFolderId);
  const selectedFolderId = groups.some(group => group.key === requestedFolderId)
    ? requestedFolderId
    : validLastFolderId;
  const selectedGroup = groups.find(group => group.key === selectedFolderId) ?? groups[0] ?? null;
  const selectedVideos = selectedGroup?.videos ?? EMPTY_VIDEOS;
  const feedClips = useMemo(() => createFeedClips(selectedVideos, clipSize), [clipSize, selectedVideos]);
  const shouldAutoStartInitial = Boolean(
    autoStart
    && feedSettings.lastFolderId
    && selectedGroup?.key === feedSettings.lastFolderId
    && feedClips.length > 0
  );
  const [view, setView] = useState<'manage' | 'play'>(() => shouldAutoStartInitial ? 'play' : 'manage');
  const [activeClipId, setActiveClipId] = useState(() => shouldAutoStartInitial ? feedClips[0]?.id ?? '' : '');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const requestsOpen = featureRequests.filter(request => !request.completed).length;

  function handleSelectFolder(folderId: string) {
    setRequestedFolderId(folderId);
    updateFeedSettings({ lastFolderId: folderId });
    setView('manage');
  }

  function handleSourceFolderToggle(folderId: string) {
    const current = new Set(sourceFolderIds);
    if (current.has(folderId)) current.delete(folderId);
    else current.add(folderId);
    updateFeedSettings({ sourceFolderIds: Array.from(current), lastFolderId: folderId });
    setRequestedFolderId(folderId);
  }

  function handleStartFeed() {
    if (feedClips.length === 0 || !selectedGroup) return;
    updateFeedSettings({ lastFolderId: selectedGroup.key });
    setActiveClipId(feedClips[0].id);
    setView('play');
  }

  if (view === 'play' && selectedGroup) {
    return (
      <ClipPlayer
        listName={selectedGroup.name}
        clipSize={clipSize}
        clips={feedClips}
        activeClipId={activeClipId}
        preferSound={preferSound}
        onActiveClipChange={setActiveClipId}
        onExit={() => setView('manage')}
        onSettings={() => { setSettingsOpen(true); setView('manage'); }}
        onHome={() => navigate('/')}
        onClipComplete={recordClipWatched}
      />
    );
  }

  return (
    <div className="cw-page feed-page app-page-with-mobile-nav">
      <TopBar
        freezes={progress.freezes}
        requestsCount={requestsOpen}
        profile={cloudSync.userProfile}
      />

      <header className="feed-header">
        <button className="back-btn feed-back" onClick={() => navigate('/')}>Dashboard</button>
        <div>
          <h1>Feed</h1>
          <p>Pick a folder and watch saved videos as short vertical clips.</p>
        </div>
        <div className="feed-header-actions">
          <button
            className="btn-primary feed-start-btn-top"
            onClick={handleStartFeed}
            disabled={!selectedGroup || feedClips.length === 0}
          >
            Start Feed
          </button>
          <button
            className="btn-secondary feed-settings-btn"
            onClick={() => setSettingsOpen(open => !open)}
          >
            Settings
          </button>
        </div>
      </header>

      <ListManager
        groups={groups}
        folders={folderOptions}
        selectedFolderId={selectedGroup?.key ?? ''}
        sourceFolderIds={sourceFolderIds}
        selectedVideosCount={selectedVideos.length}
        clipSize={clipSize}
        clipSizes={CLIP_SIZES}
        autoStart={autoStart}
        preferSound={preferSound}
        includeSubfolders={includeSubfolders}
        settingsOpen={settingsOpen}
        onSettingsOpenChange={setSettingsOpen}
        onSelectFolder={handleSelectFolder}
        onSourceFolderToggle={handleSourceFolderToggle}
        onClipSizeChange={size => updateFeedSettings({ clipSize: size })}
        onAutoStartChange={value => updateFeedSettings({ autoStart: value })}
        onPreferSoundChange={value => updateFeedSettings({ preferSound: value })}
        onIncludeSubfoldersChange={value => updateFeedSettings({ includeSubfolders: value })}
      />

      <MobileNav />
    </div>
  );
}

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/useApp';
import AddVideoModal from '../components/AddVideoModal';
import InstanceSelector from '../components/InstanceSelector';
import CloudSync from '../components/CloudSync';
import WatchMixModal from '../components/WatchMixModal';
import RemixCard from '../components/RemixCard';
import ResetProgressModal from '../components/ResetProgressModal';
import FeatureRequestMenu from '../components/FeatureRequestMenu';
import MobileNav from '../components/MobileNav';

import TopBar from '../components/dashboard/TopBar';
import ContinueCard, { type LastClip } from '../components/dashboard/ContinueCard';
import DailyTargetCard from '../components/dashboard/DailyTargetCard';
import StatsStrip from '../components/dashboard/StatsStrip';
import ActionToolbar, { type DashFilter } from '../components/dashboard/ActionToolbar';
import FolderHeader from '../components/dashboard/FolderHeader';
import ClipCard from '../components/dashboard/ClipCard';
import EmptyCard from '../components/dashboard/EmptyCard';
import KeyboardHints from '../components/dashboard/KeyboardHints';

import { generateId } from '../utils/helpers';
import { CONTEXT_ABOUT_ME_NOTION_URL, DEFAULT_USER_LIFE_CONTEXT } from '../utils/lifeRecommendations';
import { getTodaySnapshot, todayKey } from '../utils/progress';
import type { Folder, Video } from '../types';

const FREEZE_BONUS_MAX = 50;

const LEVEL_NAMES = ['Novice', 'Apprentice', 'Curator', 'Editor', 'Director', 'Sage', 'Master'];

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    videos,
    folders,
    remixes,
    progress,
    instances,
    cloudSync,
    signOut,
    userLifeContext,
    updateUserLifeContext,
    getInstancesForVideo,
    getInstance,
    getVideo,
    addFolder,
    renameFolder,
    deleteFolder,
    deleteRemix,
    resetProgress,
    featureRequests,
  } = useApp();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showWatchMixModal, setShowWatchMixModal] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showFreezesMenu, setShowFreezesMenu] = useState(false);
  const [filter, setFilter] = useState<DashFilter>('all');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [activeFolderSettingsId, setActiveFolderSettingsId] = useState<string | null>(null);
  const [folderDraftName, setFolderDraftName] = useState('');
  const [showLifeContextSettings, setShowLifeContextSettings] = useState(false);
  const [lifeContextDraft, setLifeContextDraft] = useState(userLifeContext);

  // ===== Today's progress snapshot =====
  const todaySnapshot = getTodaySnapshot(progress);

  // ===== Determine last-watched clip =====
  const lastClip: LastClip | null = useMemo(() => {
    const watched = videos
      .filter(v => v.lastWatchedAt)
      .sort((a, b) => (b.lastWatchedAt ?? 0) - (a.lastWatchedAt ?? 0));
    const target = watched[0];
    if (!target) return null;
    const insts = getInstancesForVideo(target.id);
    let currentSec = 0;
    for (const inst of insts) {
      const nextClip = inst.clips.find(c => c.watchCount === 0);
      if (nextClip) { currentSec = nextClip.startTime; break; }
    }
    const folder = folders.find(f => f.id === target.folderId);
    return {
      videoTitle: target.title,
      folderName: folder?.name,
      currentSec,
      durationSec: target.duration || 0,
      xpOnFinish: 12,
    };
  }, [videos, folders, getInstancesForVideo]);

  // ===== Filter logic =====
  const filterFn = useCallback((arr: Video[], f: DashFilter): Video[] => {
    const now = Date.now();
    const todayStr = new Date().toDateString();
    const weekAgo = now - 7 * 86400000;
    switch (f) {
      case 'today':
        return arr.filter(v => v.lastWatchedAt && new Date(v.lastWatchedAt).toDateString() === todayStr);
      case 'week':
        return arr.filter(v => v.lastWatchedAt && v.lastWatchedAt >= weekAgo);
      case 'unwatched':
        return arr.filter(v => !v.lastWatchedAt);
      case 'bookmarked':
        return arr;
      case 'all':
      default:
        return arr;
    }
  }, []);

  const counts = useMemo(() => ({
    all:        filterFn(videos, 'all').length,
    today:      filterFn(videos, 'today').length,
    week:       filterFn(videos, 'week').length,
    unwatched:  filterFn(videos, 'unwatched').length,
    bookmarked: filterFn(videos, 'bookmarked').length,
  }), [videos, filterFn]);

  // ===== Stats =====
  const stats = useMemo(() => {
    const allClips = instances.flatMap(i => i.clips);
    const summarized = allClips.filter(c => c.summary).length;
    const xpPerSummary = 5;
    const xpPerLevel = 50;
    const totalXp = summarized * xpPerSummary;
    const level = Math.max(1, Math.floor(totalXp / xpPerLevel) + 1);
    const xpToNext = Math.max(0, level * xpPerLevel - totalXp);
    const levelName = LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)] ?? 'Curator';

    const last7 = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const key = todayKey(d);
      return progress.daily.find(x => x.date === key)?.clipsCompleted ?? 0;
    });
    const maxBar = Math.max(1, ...last7, todaySnapshot.target);
    const weeklyBars = last7.map(v => (v / maxBar) * 100);
    const clipsThisWeek = last7.reduce((a, b) => a + b, 0);
    const clipsTarget = todaySnapshot.target * 7;

    const focusHrs = (clipsThisWeek * 5) / 60;
    const focusDeltaPct = 18;

    const longFormWatched = videos.filter(v => v.duration > 30 * 60 && v.lastWatchedAt).length;
    const badgeRemaining = Math.max(0, 7 - longFormWatched);

    return {
      level,
      levelName,
      xpToNext,
      clipsThisWeek,
      clipsTarget,
      weeklyBars,
      focusHrs,
      focusDeltaPct,
      badgeName: 'Deep Diver',
      badgeRemaining,
    };
  }, [instances, videos, progress.daily, todaySnapshot.target]);

  // ===== Continue/Resume action =====
  const handleResume = useCallback(() => {
    const watched = videos
      .filter(v => v.lastWatchedAt)
      .sort((a, b) => (b.lastWatchedAt ?? 0) - (a.lastWatchedAt ?? 0));
    const target = watched[0];
    if (target) setSelectedVideoId(target.id);
    else setShowAddModal(true);
  }, [videos]);

  const handleNewFolder = useCallback(() => {
    addFolder({ id: generateId(), name: 'New Folder', createdAt: Date.now() });
  }, [addFolder]);

  // ===== Keyboard shortcuts =====
  useEffect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
    }
    function handler(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (showAddModal || showWatchMixModal || showResetModal || selectedVideoId) return;
      switch (e.key) {
        case 'n': case 'N': setShowAddModal(true); e.preventDefault(); break;
        case 'f': case 'F': navigate('/feed'); e.preventDefault(); break;
        case 'Enter': case ' ': handleResume(); e.preventDefault(); break;
        case '1': setFilter('all'); e.preventDefault(); break;
        case '2': setFilter('today'); e.preventDefault(); break;
        case '3': setFilter('week'); e.preventDefault(); break;
        case '4': setFilter('unwatched'); e.preventDefault(); break;
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, handleResume, showAddModal, showWatchMixModal, showResetModal, selectedVideoId]);

  // ===== Folder layout helpers =====
  const uncategorized = useMemo(
    () => filterFn(
      videos.filter(v => !v.folderId || !folders.some(f => f.id === v.folderId)),
      filter,
    ),
    [videos, folders, filter, filterFn],
  );

  function watchedPctFor(folderVideos: Video[]): number {
    let total = 0, watched = 0;
    for (const v of folderVideos) {
      const insts = getInstancesForVideo(v.id);
      for (const inst of insts) {
        for (const c of inst.clips) {
          total += 1;
          if (c.watchCount > 0) watched += 1;
        }
      }
    }
    return total > 0 ? (watched / total) * 100 : 0;
  }

  function toggleCollapse(id: string) {
    setCollapsedFolders(prev => ({ ...prev, [id]: !(prev[id] ?? false) }));
  }

  function toggleSpaceCollapse(id: string) {
    setCollapsedFolders(prev => ({ ...prev, [id]: !(prev[id] ?? true) }));
  }

  function openFolderSettings(folder: Folder) {
    setActiveFolderSettingsId(folder.id);
    setFolderDraftName(folder.name);
  }

  function saveFolderName() {
    if (!activeFolderSettingsId) return;
    const nextName = folderDraftName.trim();
    if (!nextName) return;
    renameFolder(activeFolderSettingsId, nextName);
    setActiveFolderSettingsId(null);
  }

  function removeActiveFolder() {
    if (!activeFolderSettingsId) return;
    deleteFolder(activeFolderSettingsId);
    setActiveFolderSettingsId(null);
  }

  function openLifeContextSettings() {
    setLifeContextDraft(userLifeContext);
    setShowLifeContextSettings(true);
    setShowAccountMenu(false);
  }

  function saveLifeContext() {
    updateUserLifeContext(lifeContextDraft);
    setShowLifeContextSettings(false);
  }

  function useNotionProfileContext() {
    setLifeContextDraft(DEFAULT_USER_LIFE_CONTEXT);
  }

  const topLevelFolders = folders.filter(f => !f.parentId);
  const activeFolder = activeFolderSettingsId
    ? folders.find(folder => folder.id === activeFolderSettingsId)
    : null;

  const requestsOpen = featureRequests.filter(r => !r.completed).length;
  const isEmpty = folders.length === 0 && videos.length === 0 && remixes.length === 0;

  return (
    <div className="cw-dashboard">
      <TopBar
        freezes={todaySnapshot.freezes}
        requestsCount={requestsOpen}
        profile={cloudSync.userProfile}
        onAvatarClick={() => setShowAccountMenu(s => !s)}
        onFreezesClick={() => setShowFreezesMenu(s => !s)}
      />

      <div className="cw-hero">
        <ContinueCard
          lastClip={lastClip}
          onResume={handleResume}
          onStartFeed={() => navigate('/feed')}
        />
        <DailyTargetCard
          completed={todaySnapshot.clipsCompleted}
          goal={todaySnapshot.target}
          streakDays={todaySnapshot.currentStreak}
          bestWindow="7:30 – 8:15 pm"
          bonusDone={todaySnapshot.extraClipsBank}
          bonusMax={FREEZE_BONUS_MAX}
        />
      </div>

      <StatsStrip {...stats} />

      <ActionToolbar
        filter={filter}
        counts={counts}
        onFilter={setFilter}
        onAddVideo={() => setShowAddModal(true)}
        onWatchMix={() => setShowWatchMixModal(true)}
        onNewFolder={handleNewFolder}
        onReports={() => navigate('/reports')}
      />

      {isEmpty ? (
        <div className="cw-empty-state">
          <h2>No videos yet</h2>
          <p>Add a local video or paste a YouTube link to start your first clip.</p>
          <button className="cw-btn cw-btn-primary" onClick={() => setShowAddModal(true)}>
            Add your first video
          </button>
        </div>
      ) : (
        <>
          {remixes.length > 0 && (
            <section className="cw-folder-section">
              <FolderHeader
                title="Remixes"
                count={remixes.length}
                watchedPct={0}
                collapsed={!!collapsedFolders['__remix']}
                onToggle={() => toggleCollapse('__remix')}
                onAdd={() => setShowWatchMixModal(true)}
              />
              {!collapsedFolders['__remix'] && (
                <div className="cw-grid">
                  {remixes.map(remix => (
                    <RemixCard
                      key={remix.id}
                      remix={remix}
                      getSourceClip={(instanceId, clipIndex) =>
                        getInstance(instanceId)?.clips.find(c => c.index === clipIndex)
                      }
                      getSourceTitle={videoId => getVideo(videoId)?.title ?? 'Missing video'}
                      onClick={() => navigate(`/remix/${remix.id}`)}
                      onDelete={() => deleteRemix(remix.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {(uncategorized.length > 0 || topLevelFolders.length === 0) && (
            <section className="cw-folder-section">
              <FolderHeader
                title="Uncategorized"
                count={uncategorized.length}
                watchedPct={watchedPctFor(uncategorized)}
                collapsed={!!collapsedFolders['__uncat']}
                onToggle={() => toggleCollapse('__uncat')}
                onAdd={() => setShowAddModal(true)}
              />
              {!collapsedFolders['__uncat'] && (
                <div className="cw-grid">
                  {uncategorized.map((v, i) => (
                    <ClipCard
                      key={v.id}
                      video={v}
                      instances={getInstancesForVideo(v.id)}
                      index={i}
                      onClick={() => setSelectedVideoId(v.id)}
                    />
                  ))}
                  <EmptyCard onClick={() => setShowAddModal(true)} />
                </div>
              )}
            </section>
          )}

          {topLevelFolders.map(folder => {
            const inFolder = filterFn(videos.filter(v => v.folderId === folder.id), filter);
            const subs = folders.filter(f => f.parentId === folder.id);
            const collapsed = collapsedFolders[folder.id] ?? true;
            return (
              <section key={folder.id} className="cw-folder-section">
                <FolderHeader
                  title={folder.name}
                  count={inFolder.length}
                  subfolderCount={subs.length}
                  watchedPct={watchedPctFor(inFolder)}
                  collapsed={collapsed}
                  onToggle={() => toggleSpaceCollapse(folder.id)}
                  onAdd={() => setShowAddModal(true)}
                  onSettings={() => openFolderSettings(folder)}
                />
                {!collapsed && (
                  <div className="cw-grid">
                    {inFolder.map((v, i) => (
                      <ClipCard
                        key={v.id}
                        video={v}
                        instances={getInstancesForVideo(v.id)}
                        index={i}
                        onClick={() => setSelectedVideoId(v.id)}
                      />
                    ))}
                    {inFolder.length === 0 && (
                      <EmptyCard onClick={() => setShowAddModal(true)} label="Add a video to this folder" />
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}

      <KeyboardHints />

      {/* Inline floating menus */}
      {showFreezesMenu && (
        <div className="cw-floating-menu cw-floating-menu-freezes">
          <strong className="cw-floating-menu-title">Streak freezes</strong>
          <p className="cw-floating-menu-copy">
            You have <strong className="cw-floating-menu-count">{todaySnapshot.freezes}</strong> freezes.
            Earn a freeze every {FREEZE_BONUS_MAX} extra clips.
          </p>
        </div>
      )}
      {showAccountMenu && (
        <div className="cw-floating-menu cw-floating-menu-account">
          <CloudSync compact />
          <hr className="cw-floating-menu-divider" />
          <FeatureRequestMenu />
          <hr className="cw-floating-menu-divider" />
          <div className="cw-floating-menu-actions">
            <button className="cw-btn cw-btn-secondary" onClick={() => { void signOut(); setShowAccountMenu(false); }}>
              Logout
            </button>
            <button
              className="cw-btn cw-btn-secondary cw-menu-danger"
              onClick={() => { setShowAccountMenu(false); setShowResetModal(true); }}
            >
              Reset progress
            </button>
            <button
              className="cw-btn cw-btn-secondary"
              onClick={() => { setShowRequests(true); setShowAccountMenu(false); }}
            >
              View requests
            </button>
            <button className="cw-btn cw-btn-secondary" onClick={openLifeContextSettings}>
              Life context
            </button>
          </div>
        </div>
      )}
      {showLifeContextSettings && (
        <div className="cw-floating-menu cw-life-context-menu">
          <strong className="cw-floating-menu-title">Life context</strong>
          <label className="cw-folder-settings-field">
            <span>Used for recommendations</span>
            <a className="cw-context-source-link" href={CONTEXT_ABOUT_ME_NOTION_URL} target="_blank" rel="noreferrer">
              Notion context-about-me source
            </a>
            <textarea
              value={lifeContextDraft}
              onChange={event => setLifeContextDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Escape') setShowLifeContextSettings(false);
              }}
              autoFocus
              rows={7}
            />
          </label>
          <div className="cw-folder-settings-actions">
            <button className="cw-btn cw-btn-secondary" onClick={useNotionProfileContext}>
              Use Notion profile
            </button>
            <button className="cw-btn cw-btn-primary" onClick={saveLifeContext} disabled={!lifeContextDraft.trim()}>
              Save
            </button>
            <button className="cw-btn cw-btn-secondary" onClick={() => setShowLifeContextSettings(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {activeFolder && (
        <div className="cw-floating-menu cw-folder-settings-menu">
          <strong className="cw-floating-menu-title">Space settings</strong>
          <label className="cw-folder-settings-field">
            <span>Name</span>
            <input
              value={folderDraftName}
              onChange={event => setFolderDraftName(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') saveFolderName();
                if (event.key === 'Escape') setActiveFolderSettingsId(null);
              }}
              autoFocus
            />
          </label>
          <div className="cw-folder-settings-actions">
            <button className="cw-btn cw-btn-primary" onClick={saveFolderName} disabled={!folderDraftName.trim()}>
              Save
            </button>
            <button className="cw-btn cw-btn-secondary" onClick={() => setActiveFolderSettingsId(null)}>
              Cancel
            </button>
            <button className="cw-btn cw-btn-secondary cw-menu-danger" onClick={removeActiveFolder}>
              Delete
            </button>
          </div>
        </div>
      )}

      {showAddModal && <AddVideoModal onClose={() => setShowAddModal(false)} />}
      {showWatchMixModal && <WatchMixModal onClose={() => setShowWatchMixModal(false)} />}
      {selectedVideoId && (
        <InstanceSelector videoId={selectedVideoId} onClose={() => setSelectedVideoId(null)} />
      )}
      {showResetModal && (
        <ResetProgressModal onConfirm={resetProgress} onClose={() => setShowResetModal(false)} />
      )}
      {showRequests && (
        <div className="cw-floating-menu cw-floating-menu-requests">
          <FeatureRequestMenu />
          <button className="cw-btn cw-btn-secondary cw-floating-menu-close" onClick={() => setShowRequests(false)}>
            Close
          </button>
        </div>
      )}
      <MobileNav />
    </div>
  );
}

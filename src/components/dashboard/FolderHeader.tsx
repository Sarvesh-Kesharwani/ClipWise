import { IconChevronDown, IconFolder, IconPlus, IconSettings } from './DashIcons';

interface Props {
  title: string;
  count: number;
  subfolderCount?: number;
  watchedPct: number;
  collapsed?: boolean;
  onToggle?: () => void;
  onAdd?: () => void;
  onSettings?: () => void;
}

export default function FolderHeader({
  title, count, subfolderCount = 0, watchedPct,
  collapsed = false, onToggle, onAdd, onSettings,
}: Props) {
  return (
    <div className="cw-folder-header">
      <div className="cw-folder-left">
        <button
          className={`cw-folder-collapse ${collapsed ? 'collapsed' : ''}`}
          onClick={onToggle}
          aria-label={collapsed ? 'Expand folder' : 'Collapse folder'}
          aria-expanded={!collapsed}
        >
          <IconChevronDown size={16} />
        </button>
        <span className="cw-folder-tile" aria-hidden>
          <IconFolder size={16} />
        </span>
        <span className="cw-folder-title">{title}</span>
        <span className="cw-folder-meta">
          {count} {count === 1 ? 'video' : 'videos'}
          {subfolderCount > 0 ? ` · ${subfolderCount} ${subfolderCount === 1 ? 'subfolder' : 'subfolders'}` : ''}
        </span>
      </div>

      <div className="cw-folder-right">
        <span className="cw-folder-pct">{Math.round(watchedPct)}% watched</span>
        <div className="cw-folder-bar" aria-hidden>
          <div className="cw-folder-bar-fill" style={{ width: `${Math.max(0, Math.min(100, watchedPct))}%` }} />
        </div>
        <button className="cw-folder-act" onClick={onAdd} aria-label="Add to folder">
          <IconPlus size={14} />
        </button>
        <button className="cw-folder-act" onClick={onSettings} aria-label="Folder settings">
          <IconSettings size={14} />
        </button>
      </div>
    </div>
  );
}

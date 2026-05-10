import { IconPlus, IconShuffle, IconFolder, IconTrendingUp } from './DashIcons';

export type DashFilter = 'all' | 'today' | 'week' | 'unwatched' | 'bookmarked';

interface Counts {
  all: number;
  today: number;
  week: number;
  unwatched: number;
  bookmarked: number;
}

interface Props {
  filter: DashFilter;
  counts: Counts;
  onFilter: (next: DashFilter) => void;
  onAddVideo: () => void;
  onWatchMix: () => void;
  onNewFolder: () => void;
  onReports: () => void;
}

const CHIPS: { key: DashFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'unwatched', label: 'Unwatched' },
  { key: 'bookmarked', label: 'Bookmarked' },
];

export default function ActionToolbar({
  filter, counts, onFilter,
  onAddVideo, onWatchMix, onNewFolder, onReports,
}: Props) {
  return (
    <div className="cw-toolbar" role="toolbar" aria-label="Library actions">
      <div className="cw-toolbar-actions">
        <button className="cw-tool-btn primary" onClick={onAddVideo}>
          <IconPlus size={14} /> Add video
        </button>
        <button className="cw-tool-btn" onClick={onWatchMix}>
          <IconShuffle size={14} /> Watch mix
        </button>
        <button className="cw-tool-btn" onClick={onNewFolder}>
          <IconFolder size={14} /> New folder
        </button>
        <button className="cw-tool-btn" onClick={onReports}>
          <IconTrendingUp size={14} /> Reports
        </button>
      </div>

      <div className="cw-chips" role="tablist" aria-label="Filter">
        {CHIPS.map(c => (
          <button
            key={c.key}
            role="tab"
            aria-selected={filter === c.key}
            className={`cw-chip ${filter === c.key ? 'active' : ''}`}
            onClick={() => onFilter(c.key)}
          >
            {c.label} <span className="num">{counts[c.key]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

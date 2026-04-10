import type { Clip } from '../types';
import { formatTime, getClipStatus, getClipStatusColor, getClipStatusLabel } from '../utils/helpers';

interface Props {
  clips: Clip[];
  activeClipIndex: number;
  onClipClick: (index: number) => void;
  onSummaryClick: (index: number) => void;
}

export default function ClipPanel({ clips, activeClipIndex, onClipClick, onSummaryClick }: Props) {
  const watched = clips.filter(c => c.watchCount > 0).length;
  const summarized = clips.filter(c => c.summary).length;

  return (
    <div className="clip-panel">
      <div className="clip-panel-header">
        <h3>Clips</h3>
        <div className="clip-stats">
          <span className="stat-watched">{watched}/{clips.length} watched</span>
          <span className="stat-summarized">{summarized}/{clips.length} noted</span>
        </div>
      </div>

      <div className="clip-legend">
        <span className="legend-item"><span className="dot" style={{ background: '#FF4B4B' }} /> New</span>
        <span className="legend-item"><span className="dot" style={{ background: '#FFC800' }} /> Watched</span>
        <span className="legend-item"><span className="dot" style={{ background: '#58CC02' }} /> Noted</span>
        <span className="legend-item"><span className="dot" style={{ background: '#1CB0F6' }} /> 2x</span>
        <span className="legend-item"><span className="dot" style={{ background: '#CE82FF' }} /> 3x+</span>
      </div>

      <div className="clip-grid">
        {clips.map(clip => {
          const status = getClipStatus(clip);
          const color = getClipStatusColor(status);
          const isActive = clip.index === activeClipIndex;
          const hasWatch = clip.watchCount > 0;

          return (
            <div
              key={clip.index}
              className={`clip-card ${status} ${isActive ? 'active' : ''}`}
              style={{ backgroundColor: color }}
              onClick={() => onClipClick(clip.index)}
              title={getClipStatusLabel(status)}
            >
              <div className="clip-card-top">
                <span className="clip-number">#{clip.index + 1}</span>
                {clip.watchCount > 1 && (
                  <span className="watch-badge">{clip.watchCount}x</span>
                )}
              </div>
              <div className="clip-card-time">
                {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
              </div>
              <div className="clip-card-bottom">
                {hasWatch && (
                  <button
                    className={`summary-btn ${clip.summary ? 'has-summary' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onSummaryClick(clip.index); }}
                    title={clip.summary || 'Add summary'}
                  >
                    {clip.summary ? '📝' : '✏️'}
                  </button>
                )}
                {isActive && <span className="playing-indicator">▶</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useRef } from 'react';
import type { Clip } from '../types';
import { getClipStatus, getClipStatusColor } from '../utils/helpers';

interface Props {
  clips: Clip[];
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

export default function SegmentedProgressBar({ clips, currentTime, duration, onSeek }: Props) {
  const barRef = useRef<HTMLDivElement>(null);

  function handleClick(e: React.MouseEvent) {
    if (!barRef.current || duration <= 0) return;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(pct * duration);
  }

  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="segmented-bar-wrapper">
      <div className="segmented-bar" ref={barRef} onClick={handleClick}>
        {clips.map(clip => {
          const status = getClipStatus(clip);
          const color = getClipStatusColor(status);
          const widthPct = duration > 0 ? (clip.duration / duration) * 100 : 0;

          return (
            <div
              key={clip.index}
              className="bar-segment"
              style={{
                width: `${widthPct}%`,
                backgroundColor: color,
              }}
            />
          );
        })}
        <div
          className="bar-playhead"
          style={{ left: `${playheadPct}%` }}
        />
      </div>
    </div>
  );
}

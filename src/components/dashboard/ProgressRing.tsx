import { useEffect, useRef } from 'react';

interface Props {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  trackColor?: string;
}

export default function ProgressRing({
  value,
  max,
  size = 132,
  strokeWidth = 11,
  trackColor = '#151712',
}: Props) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const targetOffset = circumference * (1 - ratio);
  const fgRef = useRef<SVGCircleElement | null>(null);

  useEffect(() => {
    const node = fgRef.current;
    if (!node) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.style.strokeDashoffset = String(targetOffset);
      return;
    }
    node.style.transition = 'none';
    node.style.strokeDashoffset = String(circumference);
    void node.getBoundingClientRect();
    node.style.transition = 'stroke-dashoffset 800ms cubic-bezier(.2,.8,.2,1)';
    node.style.strokeDashoffset = String(targetOffset);
  }, [targetOffset, circumference]);

  return (
    <svg width={size} height={size} viewBox="0 0 132 132">
      <defs>
        <linearGradient id="cw-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c6f24e" />
          <stop offset="100%" stopColor="#7adbd1" />
        </linearGradient>
      </defs>
      <g transform="rotate(-90 66 66)">
        <circle
          cx="66" cy="66" r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          ref={fgRef}
          cx="66" cy="66" r={radius}
          stroke="url(#cw-ring-grad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
        />
      </g>
    </svg>
  );
}

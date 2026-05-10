import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...rest,
  };
}

export const IconHouse = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 12l9-9 9 9" /><path d="M5 10v10h14V10" /></svg>
);
export const IconMenu = (p: IconProps) => (
  <svg {...base(p)}><path d="M4 7h16M4 12h16M4 17h10" /></svg>
);
export const IconTrendingUp = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>
);
export const IconSnowflake = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 2v20M2 12h20M5 5l14 14M5 19L19 5" /></svg>
);
export const IconBell = (p: IconProps) => (
  <svg {...base(p)}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 21a2 2 0 0 0 4 0" /></svg>
);
export const IconPlay = (p: IconProps) => (
  <svg {...base(p)}><path d="M8 5l11 7-11 7V5z" fill="currentColor" stroke="none" /></svg>
);
export const IconArrowRight = (p: IconProps) => (
  <svg {...base(p)}><path d="M5 12h14M13 5l7 7-7 7" /></svg>
);
export const IconArrowDown = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 5v14M5 13l7 7 7-7" /></svg>
);
export const IconFlame = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 2s4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 1-3S6 9 6 13a6 6 0 0 0 12 0c0-5-6-11-6-11z" /></svg>
);
export const IconClock = (p: IconProps) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const IconGauge = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 14l4-4" /><circle cx="12" cy="14" r="8" /><path d="M12 6V3M5 9l-2-1M19 9l2-1" /></svg>
);
export const IconStar = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.1l1-5.8L3.5 9.2l5.9-.9L12 3z" /></svg>
);
export const IconMedal = (p: IconProps) => (
  <svg {...base(p)}><circle cx="12" cy="14" r="6" /><path d="M9 8L7 2h10l-2 6" /></svg>
);
export const IconPlus = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconFolder = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" /></svg>
);
export const IconChevronDown = (p: IconProps) => (
  <svg {...base(p)}><path d="M6 9l6 6 6-6" /></svg>
);
export const IconSettings = (p: IconProps) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
);
export const IconBookmark = (p: IconProps) => (
  <svg {...base(p)}><path d="M6 3h12v18l-6-4-6 4V3z" /></svg>
);
export const IconShuffle = (p: IconProps) => (
  <svg {...base(p)}><path d="M16 3h5v5M21 3l-7 7M16 21h5v-5M21 21l-7-7M3 8l4 4-4 4" /></svg>
);

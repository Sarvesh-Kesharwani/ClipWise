import { NavLink } from 'react-router-dom';
import {
  IconHouse, IconMenu, IconTrendingUp, IconSnowflake, IconBell,
} from './DashIcons';
import ThemeToggle from '../ThemeToggle';

interface Profile {
  name?: string;
  email?: string;
  picture?: string;
}

interface Props {
  freezes: number;
  notifications?: number;
  requestsCount?: number;
  profile?: Profile | null;
  onAvatarClick?: () => void;
  onFreezesClick?: () => void;
  onNotificationsClick?: () => void;
}

export default function TopBar({
  freezes,
  requestsCount = 0,
  profile,
  onAvatarClick,
  onFreezesClick,
  onNotificationsClick,
}: Props) {
  const avatarLetter = (profile?.name || profile?.email || 'M').trim()[0]?.toUpperCase() || 'M';
  const avatarContent = profile?.picture
    ? <img src={profile.picture} alt={profile.name || 'avatar'} referrerPolicy="no-referrer" />
    : <span>{avatarLetter}</span>;

  return (
    <div className="cw-topbar">
      <div className="cw-brand">
        <div className="cw-brand-mark" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5l11 7-11 7V5z" />
          </svg>
        </div>
        <div className="cw-brand-text">
          <span className="cw-brand-name">clipwise<span className="dot">.</span></span>
          <span className="cw-brand-tag">Watch smarter · clip by clip</span>
        </div>
      </div>

      <nav className="cw-pillnav" aria-label="Primary">
        <NavLink to="/" end className={({ isActive }) => `cw-pillnav-item ${isActive ? 'active' : ''}`}>
          <IconHouse size={14} /> Library
        </NavLink>
        <NavLink to="/feed" className={({ isActive }) => `cw-pillnav-item ${isActive ? 'active' : ''}`}>
          <IconMenu size={14} /> Feed
        </NavLink>
        <NavLink to="/reports" className={({ isActive }) => `cw-pillnav-item ${isActive ? 'active' : ''}`}>
          <IconTrendingUp size={14} /> Reports
        </NavLink>
        {requestsCount > 0 ? (
          <span className="cw-pillnav-item">
            Requests <span className="cw-pillnav-badge">{requestsCount}</span>
          </span>
        ) : (
          <span className="cw-pillnav-item">Requests</span>
        )}
      </nav>

      <div className="cw-topbar-right">
        <ThemeToggle variant="icon" />
        <button
          className="cw-pillbtn"
          onClick={onFreezesClick}
          title={`${freezes} streak ${freezes === 1 ? 'freeze' : 'freezes'}`}
        >
          <IconSnowflake size={14} className="cw-icon-cyan" />
          Freezes
          <span className="cw-mono">{freezes}</span>
        </button>
        <button className="cw-iconbtn" onClick={onNotificationsClick} aria-label="Notifications">
          <IconBell size={16} />
        </button>
        {onAvatarClick ? (
          <button className="cw-avatar" onClick={onAvatarClick} aria-label="Account">
            {avatarContent}
          </button>
        ) : (
          <div className="cw-avatar cw-avatar-static" aria-label="Account">
            {avatarContent}
          </div>
        )}
      </div>
    </div>
  );
}

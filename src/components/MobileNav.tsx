import { NavLink } from 'react-router-dom';

export default function MobileNav() {
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      <NavLink to="/" end>Home</NavLink>
      <NavLink to="/feed">Feed</NavLink>
      <NavLink to="/reports">Reports</NavLink>
    </nav>
  );
}

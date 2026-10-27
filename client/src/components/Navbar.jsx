import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import Badge from '@mui/material/Badge';
import { useAuth, useAppDispatch } from '../hooks/useAuth';
import { useSelector } from 'react-redux';
import { clearUser } from '../store/authSlice';
import { fetchUnread } from '../store/notificationSlice';
import useTheme from '../hooks/useTheme';

export default function Navbar() {
  const { user } = useAuth();
  const unread = useSelector((s) => s.notifications.unread);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const isStaff = user && ['staff', 'admin'].includes(user.role);

  // Poll for new notifications while logged in.
  useEffect(() => {
    if (!user) return undefined;
    dispatch(fetchUnread());
    const t = setInterval(() => dispatch(fetchUnread()), 30000);
    return () => clearInterval(t);
  }, [user, dispatch]);

  const close = () => setOpen(false);
  const logout = () => { dispatch(clearUser()); close(); navigate('/'); };

  return (
    <nav className="topbar navbar navbar-expand-lg py-3">
      <div className="container">
        <Link to="/" className="brand" onClick={close}>HotelPro</Link>
        <button className="navbar-toggler border-0" aria-label="Toggle navigation" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="navbar-toggler-icon" />
        </button>
        <div className={`collapse navbar-collapse ${open ? 'show' : ''}`}>
          <div className="navbar-nav ms-auto align-items-lg-center gap-lg-2">
            <NavLink to="/" end className="nav-link" onClick={close}>Rooms</NavLink>
            {user && user.role === 'guest' && <NavLink to="/my-bookings" className="nav-link" onClick={close}>My bookings</NavLink>}
            {isStaff && <NavLink to="/admin" className="nav-link" onClick={close}>Dashboard</NavLink>}
            {user && (
              <>
                <NavLink to="/notifications" className="nav-link" onClick={close} aria-label={`Notifications, ${unread} unread`}>
                  <Badge badgeContent={unread} color="warning" max={99}><span aria-hidden="true">🔔</span></Badge>
                </NavLink>
                <NavLink to="/profile" className="nav-link" onClick={close}>{user.name.split(' ')[0]}</NavLink>
              </>
            )}
            <button className="btn btn-sm btn-outline-light" onClick={toggleTheme} aria-label="Toggle dark mode" title="Toggle dark mode">
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            {user ? (
              <button className="btn btn-sm btn-outline-light" onClick={logout}>Log out</button>
            ) : (
              <>
                <NavLink to="/login" className="nav-link" onClick={close}>Log in</NavLink>
                <Link to="/register" className="btn btn-sm btn-light" onClick={close}>Create account</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

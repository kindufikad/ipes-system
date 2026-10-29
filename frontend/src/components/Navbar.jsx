import { useContext, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  FaChalkboardTeacher, FaHome, FaInfoCircle, FaEnvelope, 
  FaSignInAlt, FaUserCircle, FaSignOutAlt, FaBars, FaTimes,
  FaUserGraduate, FaUserShield, FaChevronDown, FaSitemap 
} from 'react-icons/fa';
import LanguageSwitcher from './LanguageSwitcher';
import { LanguageContext } from '../context/LanguageContext';
import { useAuth } from '../context/useAuth';
import toast from 'react-hot-toast';
import NotificationBell from './NotificationBell';
import useLandingContent from '../hooks/useLandingContent';

const Navbar = () => {
  const { strings } = useContext(LanguageContext);
  const { user, role, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const landingContent = useLandingContent();

  const isDashboardPath = ['/student-dashboard', '/instructor-dashboard', '/depthead-dashboard', '/admin-dashboard', '/system-admin-dashboard', '/vice-president-dashboard'].includes(location.pathname);
  const hidePublicNav = isDashboardPath || role === 'depthead';

  const toggleMenu = () => {
    setIsOpen((open) => !open);
    setDropdownOpen(false);
  };
  const toggleDropdown = () => setDropdownOpen(!dropdownOpen);

  const handleLogout = async () => {
    await logout();
    setDropdownOpen(false);
    setIsOpen(false);
    toast.success('Logged out successfully');
  };

  const navLinks = hidePublicNav ? [] : [
    { path: '/', label: strings.navbar.home, icon: FaHome },
    { path: '/about', label: strings.navbar.about, icon: FaInfoCircle },
    { path: '/contact', label: strings.navbar.contact, icon: FaEnvelope },
  ];
  const avatarUrl = user?.profile_photo || user?.profile_picture || user?.avatar;
  const resolvedAvatarUrl = avatarUrl
    ? (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://') || avatarUrl.startsWith('data:')
      ? avatarUrl
      : typeof window !== 'undefined' && avatarUrl.startsWith('/')
        ? `${window.location.origin}${avatarUrl}`
        : avatarUrl)
    : null;

  return (
    <nav className="sticky top-0 z-50 bg-gradient-to-r from-ieps-blue-600 to-ieps-blue-500 shadow-lg">
      <div className="container-custom">
        <div className="flex justify-between items-center h-16 md:h-20">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 md:gap-3 group min-w-0">
            <img src={landingContent.system_logo} alt="IPES system logo" className="h-10 w-10 rounded-lg object-contain" />
            <div className="min-w-0">
              <span className="text-white font-bold text-base md:text-lg tracking-wide block">(IPES)</span>
              <p className="text-white/80 text-[11px] sm:text-xs md:text-sm leading-snug max-w-[220px]">
                Instructor Performance Evaluation System<br />Mekdela Amba University
              </p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div id="public-mobile-navigation" className={`${isOpen ? 'absolute left-0 right-0 top-full flex max-h-[calc(100dvh-4rem)] flex-col items-stretch gap-2 overflow-y-auto border-t border-white/10 bg-gradient-to-r from-ieps-blue-600 to-ieps-blue-500 px-4 py-4 shadow-xl' : 'hidden'} md:static md:flex md:max-h-none md:flex-row md:items-center md:gap-1 md:overflow-visible md:border-0 md:bg-transparent md:p-0 md:shadow-none`}>
            {!hidePublicNav && navLinks.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                onClick={() => setIsOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-4 py-3 text-white/80 transition-all duration-200 hover:bg-white/10 hover:text-white md:py-2 ${isActive ? 'bg-white/20 text-white' : ''}`
                }
              >
                <Icon className="text-sm" />
                <span>{label}</span>
              </NavLink>
            ))}

            <div className="flex items-center gap-2 px-4 py-2 md:px-0 md:py-0">
              <LanguageSwitcher />
              {isAuthenticated && <NotificationBell />}
            </div>

            <div className="hidden h-8 w-px bg-white/20 md:mx-2 md:block"></div>

            {isAuthenticated ? (
              <>
                <div className="relative">
                  <button
                    onClick={toggleDropdown}
                    type="button"
                    aria-expanded={dropdownOpen}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200"
                  >
                    {resolvedAvatarUrl ? (
                      <img src={resolvedAvatarUrl} alt="Profile" className="h-7 w-7 rounded-full border border-white/50 object-cover" />
                    ) : (
                      <FaUserCircle className="text-xl" />
                    )}
                    <span className="font-medium">{user?.name || strings.common.user}</span>
                    <FaChevronDown className={`text-xs transition-transform duration-300 ${dropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {dropdownOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl py-2 border border-gray-100 animate-fadeIn">
                      <div className="px-4 py-2 border-b border-gray-100">
                        <p className="font-semibold text-gray-800">{user?.name || strings.common.user}</p>
                        <p className="text-xs text-gray-500 capitalize">{role}</p>
                      </div>
                      
                      {role === 'student' && (
                          <Link to="/student-dashboard" onClick={() => setIsOpen(false)} className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                          <FaUserGraduate /> {strings.common.dashboard}
                        </Link>
                      )}
                      {role === 'instructor' && (
                          <Link to="/instructor-dashboard" onClick={() => setIsOpen(false)} className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                          <FaChalkboardTeacher /> {strings.common.instructorPanel}
                        </Link>
                      )}
                      {(role === 'admin' || role === 'systemadmin') && (
                        <Link to="/system-admin-dashboard" onClick={() => setIsOpen(false)} className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                          <FaUserShield /> {strings.common.adminPanel}
                        </Link>
                      )}
                      {role === 'depthead' && (
                        <Link to="/depthead-dashboard" onClick={() => setIsOpen(false)} className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                          <FaSitemap /> {strings.common.deptHeadPanel}
                        </Link>
                      )}
                      {role === 'academic_vice_president' && (
                        <Link to="/vice-president-dashboard" onClick={() => setIsOpen(false)} className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                          <FaUserShield /> Vice President Dashboard
                        </Link>
                      )}
                      
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 transition-colors w-full border-t border-gray-100 mt-1"
                      >
                        <FaSignOutAlt /> {strings.common.logout}
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Link
                to="/login"
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-center gap-2 px-6 py-2 bg-ieps-gold-500 text-ieps-blue-600 rounded-full font-semibold hover:bg-ieps-gold-400 transition-all duration-300 shadow-md hover:shadow-lg"
              >
                <FaSignInAlt className="shrink-0" />
                <span className="text-center">Login</span>
              </Link>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={toggleMenu}
            className="md:hidden text-white text-2xl p-2 hover:bg-white/10 rounded-lg transition-colors"
            aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isOpen}
            aria-controls="public-mobile-navigation"
          >
            {isOpen ? <FaTimes /> : <FaBars />}
          </button>
        </div>

      </div>
    </nav>
  );
};

export default Navbar;
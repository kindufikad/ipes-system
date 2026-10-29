import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Megaphone, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { notificationApi } from '../services/api';
import { useAuth } from '../context/useAuth';
import socket from '../services/socketClient';
import NotificationCenter from './NotificationCenter';
import './NotificationStyles.css';

const soundPreferenceKey = 'ipes_notification_sound_enabled';

const readSoundPreference = (fallback = true) => {
  try {
    const saved = window.localStorage.getItem(soundPreferenceKey);
    if (saved === null) return fallback;
    const parsed = JSON.parse(saved);
    return typeof parsed === 'boolean' ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const normalizeNotifications = (rows) => (Array.isArray(rows) ? rows : []).map((notification) => ({
  ...notification,
  is_read: notification.is_read === true || Number(notification.is_read) === 1,
}));

const playNotificationSound = () => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(740, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(520, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.23);
    oscillator.onended = () => { void context.close(); };
  } catch {
    // Audio is optional and can be blocked by the browser.
  }
};

const NotificationBell = () => {
  const { isAuthenticated, authToken, user, role } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const notificationsRef = useRef([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingEvaluationCount, setPendingEvaluationCount] = useState(0);
  const [activeFilter, setActiveFilter] = useState('all');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyAction, setBusyAction] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => readSoundPreference());
  const [hasNewNotification, setHasNewNotification] = useState(false);
  const containerRef = useRef(null);
  const pulseTimerRef = useRef(null);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const loadNotifications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await notificationApi.getAll();
      const payload = response?.data || response || {};
      const rows = Array.isArray(payload) ? payload : payload.notifications;
      const normalizedRows = normalizeNotifications(rows);
      setNotifications(normalizedRows);
      notificationsRef.current = normalizedRows;
      setUnreadCount(Number(payload?.unreadCount ?? normalizedRows.filter((item) => !item.is_read).length));
      setLoadError('');
    } catch (error) {
      setLoadError(error?.message || 'Unable to load notifications right now.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !authToken) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return undefined;
    }
    void loadNotifications();
    const intervalId = window.setInterval(() => void loadNotifications(true), 30000);
    return () => window.clearInterval(intervalId);
  }, [authToken, isAuthenticated, loadNotifications]);

  useEffect(() => {
    if (!isAuthenticated || !authToken) {
      if (socket.connected || socket.connecting) socket.disconnect();
      return undefined;
    }
    socket.auth = { token: authToken };
    const handleNotification = (notification) => {
      const normalized = { ...notification, is_read: false };
      if (normalized.id != null && notificationsRef.current.some((item) => String(item.id) === String(normalized.id))) return;
      const nextNotifications = [normalized, ...notificationsRef.current].slice(0, 50);
      notificationsRef.current = nextNotifications;
      setNotifications(nextNotifications);
      setUnreadCount((count) => count + 1);
      setHasNewNotification(true);
      window.clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = window.setTimeout(() => setHasNewNotification(false), 1800);
      const shouldPlaySound = readSoundPreference(soundEnabled);
      if (shouldPlaySound !== soundEnabled) setSoundEnabled(shouldPlaySound);
      if (shouldPlaySound) playNotificationSound();
      toast.custom((toastItem) => (
        <div className={`notification-toast${toastItem.visible ? ' is-visible' : ''}`} role="status">
          <span className="notification-toast__icon"><Megaphone size={17} /></span>
          <span className="notification-toast__copy"><strong>{normalized.title || 'New notification'}</strong><span>{normalized.message || 'You have a new update.'}</span></span>
          <button type="button" onClick={() => toast.dismiss(toastItem.id)} aria-label="Dismiss notification preview"><X size={16} /></button>
        </div>
      ), { duration: 5000, position: 'top-right' });
    };
    const joinRooms = () => socket.emit('join_rooms', { userId: user?.id ?? user?.user_id, role });
    socket.on('new_notification', handleNotification);
    socket.on('connect', joinRooms);
    if (!socket.connected && !socket.connecting) {
      socket.connect();
    }
    if (socket.connected) joinRooms();
    return () => {
      socket.off('new_notification', handleNotification);
      socket.off('connect', joinRooms);
    };
  }, [authToken, isAuthenticated, role, soundEnabled, user?.id, user?.user_id]);

  useEffect(() => {
    const updatePendingCount = (event) => {
      const count = Number(event.detail?.count);
      setPendingEvaluationCount(Number.isFinite(count) && count >= 0 ? count : 0);
    };
    window.addEventListener('ipes-pending-evaluations-updated', updatePendingCount);
    return () => window.removeEventListener('ipes-pending-evaluations-updated', updatePendingCount);
  }, []);

  useEffect(() => {
    const closeDropdown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setIsOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', closeDropdown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeDropdown);
      document.removeEventListener('keydown', closeOnEscape);
      window.clearTimeout(pulseTimerRef.current);
    };
  }, []);

  const markAllNotificationsRead = async () => {
    const userId = user?.id ?? user?.user_id;
    if (!userId) return;
    setBusyAction(true);
    try {
      await notificationApi.markAllRead(userId);
      setNotifications((current) => current.map((notification) => ({ ...notification, is_read: true })));
      setUnreadCount(0);
      toast.success('All notifications marked as read.');
    } catch (error) {
      toast.error(error?.message || 'Unable to mark notifications as read.');
    } finally {
      setBusyAction(false);
    }
  };

  const clearAllNotifications = async () => {
    const userId = user?.id ?? user?.user_id;
    if (!userId) return;
    setBusyAction(true);
    try {
      await notificationApi.clearAll(userId);
      setNotifications([]);
      setUnreadCount(0);
      notificationsRef.current = [];
      toast.success('Notifications cleared.');
    } catch (error) {
      toast.error(error?.message || 'Unable to clear notifications.');
    } finally {
      setBusyAction(false);
    }
  };

  const markNotificationRead = async (notification) => {
    if (!notification.id) return;
    setBusyAction(true);
    try {
      await notificationApi.markRead(notification.id);
      setNotifications((current) => current.map((item) => (
        String(item.id) === String(notification.id) ? { ...item, is_read: true } : item
      )));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (error) {
      toast.error(error?.message || 'Unable to mark notification as read.');
    } finally {
      setBusyAction(false);
    }
  };

  const deleteOneNotification = async (notification) => {
    if (!notification.id) return;
    setBusyAction(true);
    try {
      await notificationApi.deleteOne(notification.id);
      setNotifications((current) => current.filter((item) => String(item.id) !== String(notification.id)));
      notificationsRef.current = notificationsRef.current.filter((item) => String(item.id) !== String(notification.id));
      if (!notification.is_read) setUnreadCount((count) => Math.max(0, count - 1));
      toast.success('Notification deleted.');
    } catch (error) {
      toast.error(error?.message || 'Unable to delete notification.');
    } finally {
      setBusyAction(false);
    }
  };

  const toggleSound = () => {
    setSoundEnabled((previous) => {
      const updatedState = !previous;
      try {
        window.localStorage.setItem(soundPreferenceKey, JSON.stringify(updatedState));
      } catch {
        // Keep the preference active for this session if storage is unavailable.
      }
      return updatedState;
    });
  };

  const toggleNotifications = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen && loadError) void loadNotifications();
  };

  const displayCount = pendingEvaluationCount + unreadCount;
  return (
    <div ref={containerRef} className="notification-bell">
      <button type="button" onClick={toggleNotifications} className={`notification-bell__trigger${hasNewNotification ? ' has-new-notification' : ''}`} aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} aria-expanded={isOpen} aria-controls="notification-center-panel">
        <Bell className="h-5 w-5" aria-hidden="true" />
        {displayCount > 0 && <span className="notification-bell__count" aria-label={`${displayCount} notifications`}>{displayCount > 99 ? '99+' : displayCount}</span>}
      </button>
      {isOpen && <div className="notification-bell__popover" id="notification-center-panel">
        <NotificationCenter
          notifications={notifications}
          unreadCount={unreadCount}
          loading={loading}
          error={loadError}
          filter={activeFilter}
          onFilterChange={setActiveFilter}
          onMarkAllRead={markAllNotificationsRead}
          onClearAll={clearAllNotifications}
          onMarkRead={markNotificationRead}
          onDelete={deleteOneNotification}
          onRetry={() => void loadNotifications()}
          onToggleSound={toggleSound}
          soundEnabled={soundEnabled}
          busyAction={busyAction}
        />
        {pendingEvaluationCount > 0 && <div className="notification-center__pending"><strong>{pendingEvaluationCount} pending evaluation{pendingEvaluationCount === 1 ? '' : 's'}</strong><span>Complete your assigned evaluations.</span></div>}
      </div>}
    </div>
  );
};

export default NotificationBell;
import { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  CheckCheck,
  Megaphone,
  RefreshCw,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';

export const getNotificationCategory = (notification) => {
  const type = String(notification?.type || '').toLowerCase();
  if (type.includes('manual') || type.includes('broadcast')) return 'broadcast';
  if (type.includes('alert') || type.includes('warning') || type.includes('security') || type.includes('error')) return 'alert';
  if (type.includes('evaluation') || type.includes('reminder') || type.includes('deadline')) return 'evaluation';
  return 'general';
};

const categoryDetails = {
  broadcast: { label: 'Broadcast', Icon: Megaphone },
  alert: { label: 'System alert', Icon: AlertTriangle },
  evaluation: { label: 'Evaluation', Icon: CheckCircle2 },
  general: { label: 'Update', Icon: Bell },
};

const formatNotificationDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const isSafeActionUrl = (value) => typeof value === 'string' && (value.startsWith('/') || /^https?:\/\//i.test(value));

const NotificationCenter = ({
  notifications,
  unreadCount,
  loading,
  error,
  filter,
  onFilterChange,
  onMarkAllRead,
  onClearAll,
  onMarkRead,
  onDelete,
  onRetry,
  onToggleSound,
  soundEnabled,
  busyAction,
}) => {
  const [expandedId, setExpandedId] = useState(null);

  const filteredNotifications = notifications.filter((notification) => {
    if (filter === 'unread') return !notification.is_read;
    if (filter === 'broadcasts') return getNotificationCategory(notification) === 'broadcast';
    return true;
  });

  return (
    <section className="notification-center" aria-label="Notifications" onClick={(event) => event.stopPropagation()}>
      <header className="notification-center__header">
        <div>
          <p className="notification-center__eyebrow">INBOX</p>
          <h2>Notifications <span>{unreadCount > 99 ? '99+' : unreadCount}</span></h2>
        </div>
        <button
          type="button"
          className="notification-center__sound"
          onClick={onToggleSound}
          aria-label={soundEnabled ? 'Turn notification sound off' : 'Turn notification sound on'}
          aria-pressed={soundEnabled}
          title={soundEnabled ? 'Sound on' : 'Sound off'}
        >
          {soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
        </button>
      </header>

      <div className="notification-center__toolbar">
        <div className="notification-center__filters" role="tablist" aria-label="Filter notifications">
          {[
            { id: 'all', label: 'All' },
            { id: 'unread', label: 'Unread' },
            { id: 'broadcasts', label: 'Broadcasts' },
          ].map((item) => (
            <button
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              className={filter === item.id ? 'is-active' : ''}
              key={item.id}
              onClick={() => onFilterChange(item.id)}
            >
              {item.label}
              {item.id === 'unread' && unreadCount > 0 && <span>{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>
          ))}
        </div>
        <div className="notification-center__bulk-actions">
          <button type="button" onClick={onMarkAllRead} disabled={!unreadCount || busyAction} title="Mark all as read">
            <CheckCheck size={15} /><span>Mark all read</span>
          </button>
          <button type="button" onClick={onClearAll} disabled={!notifications.length || busyAction} title="Clear all notifications">
            <Trash2 size={15} /><span>Clear all</span>
          </button>
        </div>
      </div>

      <div className="notification-center__list" aria-live="polite" aria-busy={loading}>
        {loading && notifications.length === 0 && (
          <div className="notification-center__skeletons" aria-label="Loading notifications">
            {[0, 1, 2].map((item) => <div className="notification-skeleton" key={item}><span /><div><i /><i /><i /></div></div>)}
          </div>
        )}

        {!loading && error && notifications.length === 0 && (
          <div className="notification-center__state notification-center__state--error" role="alert">
            <AlertTriangle size={24} />
            <strong>Notifications couldn’t load</strong>
            <p>{error}</p>
            <button type="button" onClick={onRetry}><RefreshCw size={15} /> Try again</button>
          </div>
        )}

        {!loading && !error && filteredNotifications.length === 0 && (
          <div className="notification-center__state">
            <span className="notification-center__empty-icon"><Bell size={25} /></span>
            <strong>{filter === 'unread' ? 'All caught up' : filter === 'broadcasts' ? 'No broadcasts yet' : 'You’re all caught up'}</strong>
            <p>{filter === 'unread' ? 'There are no unread notifications.' : 'New updates will appear here.'}</p>
          </div>
        )}

        {filteredNotifications.map((notification, index) => {
          const category = getNotificationCategory(notification);
          const { label, Icon } = categoryDetails[category];
          const id = notification.id ?? `${notification.created_at}-${index}`;
          const expanded = expandedId === id;
          const actionUrl = notification.action_url || notification.url || notification.link;
          const hasActionUrl = isSafeActionUrl(actionUrl);

          return (
            <article className={`notification-item ${notification.is_read ? 'is-read' : 'is-unread'} category-${category}`} key={id}>
              <span className="notification-item__unread-dot" aria-hidden="true" />
              <span className="notification-item__category-icon" aria-hidden="true"><Icon size={17} /></span>
              <div className="notification-item__content">
                <div className="notification-item__meta">
                  <span className={`notification-type-badge notification-type-badge--${category}`}><Icon size={12} />{label}</span>
                  <time dateTime={notification.created_at || undefined}>{formatNotificationDate(notification.created_at)}</time>
                </div>
                <h3>{notification.title || 'Notification'}</h3>
                <p className={`notification-item__message${expanded ? ' is-expanded' : ''}`}>{notification.message || 'There are no additional details.'}</p>
                {expanded && hasActionUrl && <a className="notification-item__destination" href={actionUrl} target={actionUrl.startsWith('http') ? '_blank' : undefined} rel={actionUrl.startsWith('http') ? 'noopener noreferrer' : undefined}>Open related page <span aria-hidden="true">↗</span></a>}
                <div className="notification-item__actions">
                  <button type="button" className="notification-item__details" onClick={() => setExpandedId(expanded ? null : id)} aria-expanded={expanded}>
                    {expanded ? 'Hide details' : 'View details'}
                  </button>
                  {!notification.is_read && notification.id != null && <button type="button" onClick={() => onMarkRead(notification)} disabled={busyAction} aria-label="Mark notification as read" title="Mark as read"><Check size={15} /><span>Mark read</span></button>}
                  {notification.id != null && <button type="button" className="notification-item__delete" onClick={() => onDelete(notification)} disabled={busyAction} aria-label="Delete notification" title="Delete"><Trash2 size={15} /></button>}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {error && notifications.length > 0 && <p className="notification-center__inline-error" role="status">Couldn’t refresh notifications. Showing the last loaded list.</p>}
      {notifications.length > 0 && <footer className="notification-center__footer"><CheckCircle2 size={14} /> Your notifications are private to this account</footer>}
    </section>
  );
};

export default NotificationCenter;

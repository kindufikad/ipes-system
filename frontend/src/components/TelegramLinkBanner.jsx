import { AlertTriangle } from 'lucide-react';

const TELEGRAM_BOT_URL = import.meta.env.VITE_TELEGRAM_BOT_URL || 'https://t.me/Ipes_mekdela_bot';

const TelegramLinkBanner = ({ profile }) => {
  const linkStatusAvailable = profile?.telegram_linked !== undefined && profile?.telegram_linked !== null;
  const isLinked = profile?.telegram_linked === true || profile?.telegram_linked === 1 || profile?.telegram_linked === '1';
  if (!linkStatusAvailable || isLinked) return null;

  return (
    <aside role="status" className="mb-6 flex flex-col gap-3 border-l-4 border-amber-500 bg-amber-50 p-4 text-amber-950 sm:flex-row sm:items-start">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Telegram notifications are not linked</p>
        <p className="mt-1 text-sm">የቴሌግራም ማስታወቂያዎችን ለማግኘት እባክዎን 'Open IPES Bot' የሚለውን በመጫን የቴሌግራም ቦቱን ያገናኙ::</p>
        <p className="mt-1 text-sm text-amber-900">To receive Telegram notifications, click 'Open IPES Bot' to link your account via Telegram.</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
        <a href={TELEGRAM_BOT_URL} target="_blank" rel="noreferrer" className="rounded-md bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-800">
          Open IPES Bot
        </a>
      </div>
    </aside>
  );
};

export default TelegramLinkBanner;
import React from 'react';
import { Language } from '../types';
import { TRANSLATIONS } from '../translations';

interface HeaderProps {
  language: Language;
  mode?: 'studio' | 'restore';
  credits?: number;
  hasGallery?: boolean;
  onBuyCredits?: () => void;
  onViewHistory?: () => void;
  onLogout?: () => void;
  userEmail?: string | null;
}

const SIGN_OUT: Record<Language, string> = {
  [Language.EN]: 'Sign out',
  [Language.RU]: 'Выйти',
  [Language.ET]: 'Logi välja',
  [Language.LV]: 'Iziet',
  [Language.LT]: 'Atsijungti',
  [Language.FI]: 'Kirjaudu ulos',
};

const Header: React.FC<HeaderProps> = ({
  language,
  mode = 'studio',
  credits = 0,
  hasGallery = false,
  onBuyCredits,
  onViewHistory,
  onLogout,
  userEmail,
}) => {
  const t = TRANSLATIONS[language];

  return (
    <header className="relative py-6 sm:py-12 text-center">
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

      <div className="flex justify-between items-center gap-3 px-4 md:px-12 pt-4 absolute top-0 w-full">
        <div className="flex gap-2 items-center min-w-0">
          {userEmail && hasGallery && onViewHistory && (
            <button
              type="button"
              onClick={onViewHistory}
              className="flex items-center gap-2 text-[10px] text-gold hover:text-white transition-colors uppercase tracking-widest font-bold bg-gold/10 border border-gold/20 px-3 sm:px-4 py-2 rounded-full hover:bg-gold/20 whitespace-nowrap"
            >
              {t.historyTitle || 'My Gallery'}
            </button>
          )}
          {userEmail && onLogout && (
            <button
              type="button"
              onClick={onLogout}
              title={userEmail}
              className="text-[10px] text-slate-500 hover:text-white uppercase tracking-widest font-bold px-2 py-2 whitespace-nowrap"
            >
              {SIGN_OUT[language] || SIGN_OUT[Language.EN]}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 sm:px-4 py-2 whitespace-nowrap">
            <span className="text-[10px] text-white uppercase tracking-widest font-bold">
              {userEmail ? t.creditsLeft : (t.freeCredits || t.creditsLeft)}: <span className="text-gold">{credits}</span>
            </span>
          </div>
          {userEmail && onBuyCredits && (
            <button
              type="button"
              onClick={onBuyCredits}
              className="bg-gold text-black text-[10px] uppercase font-bold tracking-widest px-3 sm:px-5 py-2 rounded-full hover:bg-white transition-all active:scale-95 whitespace-nowrap"
            >
              {t.buyCredits}
            </button>
          )}
        </div>
      </div>

      {mode === 'restore' ? (
        <>
          <h1 className="mt-14 sm:mt-12 text-3xl sm:text-4xl font-serif text-white mb-1">
            ShotMe<span className="text-gold">.ee</span>
          </h1>
          <p className="hidden sm:block text-slate-400 text-sm mb-4 max-w-md mx-auto leading-relaxed">
            {t.restoreHeaderTagline}
          </p>
        </>
      ) : (
        <>
          <div className="hidden sm:inline-block mt-12 mb-4">
            <span className="text-[10px] text-gold uppercase tracking-[0.5em] font-bold border-x border-gold/30 px-6 py-1">
              {t.exclusiveAccess}
            </span>
          </div>

          <h1 className="mt-12 sm:mt-0 text-4xl sm:text-5xl md:text-7xl font-serif text-white mb-2 sm:mb-4">
            Profile <span className="text-gold italic font-light">Studio</span>
          </h1>
          <p className="hidden sm:block text-slate-500 font-light text-[11px] tracking-[0.25em] uppercase mb-6 max-w-md mx-auto leading-relaxed">
            {t.highEndPhotography}
          </p>
        </>
      )}
    </header>
  );
};

export default Header;

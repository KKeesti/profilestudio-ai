import React from 'react';
import { Language } from '../types';
import { TRANSLATIONS } from '../translations';
import { ICONS } from '../constants'; // Assumes ICONS has some icon we can use, if not we'll just use emoji

interface HeaderProps {
  language: Language;
  credits?: number;
  paidCredits?: number;
  onBuyCredits?: () => void;
  onViewHistory?: () => void;
  userEmail?: string | null;
}

const Header: React.FC<HeaderProps> = ({ language, credits = 3, paidCredits = 0, onBuyCredits, onViewHistory, userEmail }) => {
  const t = TRANSLATIONS[language];

  return (
    <header className="relative py-12 text-center">
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent"></div>

      <div className="flex justify-between items-center px-6 md:px-12 pt-4 absolute top-0 w-full">
        <div className="flex gap-4 items-center">
          {userEmail && paidCredits > 0 && onViewHistory && (
            <button
              onClick={onViewHistory}
              className="flex items-center gap-2 text-[10px] text-gold hover:text-white transition-colors uppercase tracking-widest font-bold bg-gold/10 border border-gold/20 px-4 py-1.5 rounded-full hover:bg-gold/20"
            >
              <span>✨</span> {t.historyTitle || 'My Gallery'}
            </button>
          )}
        </div>

        {userEmail && credits !== undefined && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5">
              <span className="text-xl">🪙</span>
              <span className="text-[10px] text-white uppercase tracking-widest font-bold">
                {t.creditsLeft}: <span className="text-gold">{credits}</span>
              </span>
            </div>
            {onBuyCredits && (
              <button
                onClick={onBuyCredits}
                className="bg-gold text-black text-[10px] uppercase font-bold tracking-widest px-5 py-1.5 rounded-full hover:bg-white transition-all transform hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(194,163,93,0.3)]"
              >
                {t.buyCredits}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-12 inline-block mb-4">
        <span className="text-[10px] text-gold uppercase tracking-[0.5em] font-bold border-x border-gold/30 px-6 py-1">
          {t.exclusiveAccess}
        </span>
      </div>

      <h1 className="text-5xl md:text-7xl font-serif text-white tracking-tighter mb-4">
        Profile <span className="text-gold italic font-light">Studio</span>
      </h1>

      <p className="text-slate-500 font-light text-[11px] tracking-[0.25em] uppercase mb-6 max-w-md mx-auto leading-relaxed">
        {t.highEndPhotography}
      </p>
    </header>
  );
};

export default Header;

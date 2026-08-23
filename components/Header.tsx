import React from 'react';
import { Language } from '../types';
import { TRANSLATIONS } from '../translations';

interface HeaderProps {
  language: Language;
  onLanguageChange?: (language: Language) => void;
  mode?: 'studio' | 'restore';
  credits?: number;
  showCredits?: boolean;
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
  onLanguageChange,
  mode = 'studio',
  credits = 0,
  showCredits = false,
  hasGallery = false,
  onBuyCredits,
  onViewHistory,
  onLogout,
  userEmail,
}) => {
  const t = TRANSLATIONS[language];
  const languageOptions = [
    { value: Language.EN, label: 'EN' },
    { value: Language.ET, label: 'ET' },
    { value: Language.RU, label: 'RU' },
    { value: Language.LV, label: 'LV' },
    { value: Language.LT, label: 'LT' },
    { value: Language.FI, label: 'FI' },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-lab-line bg-lab-white font-lab text-lab-ink">
      <div className="mx-auto flex min-h-16 w-full max-w-[1200px] items-center gap-3 px-4 sm:px-6">
        <a href={mode === 'restore' ? '/restore' : '/'} className="shrink-0 text-xl font-extrabold tracking-[-0.03em] text-lab-ink sm:text-2xl">
          ShotMe<span className="text-lab-coral">.ee</span>
        </a>

        <nav className="ml-5 hidden items-center gap-6 md:flex" aria-label="Photo modes">
          <a
            href="/restore"
            aria-current={mode === 'restore' ? 'page' : undefined}
            className={`border-b-2 py-2 text-sm font-semibold transition-colors ${mode === 'restore' ? 'border-lab-teal text-lab-ink' : 'border-transparent text-lab-ink/65 hover:text-lab-ink'}`}
          >
            {t.restoreOldPhoto}
          </a>
          <a
            href="/"
            aria-current={mode === 'studio' ? 'page' : undefined}
            className={`border-b-2 py-2 text-sm font-semibold transition-colors ${mode === 'studio' ? 'border-lab-teal text-lab-ink' : 'border-transparent text-lab-ink/65 hover:text-lab-ink'}`}
          >
            {t.uploadTitle}
          </a>
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          {userEmail && hasGallery && onViewHistory && (
            <button
              type="button"
              onClick={onViewHistory}
              className="hidden rounded-md px-3 py-2 text-sm font-semibold text-lab-teal hover:bg-lab-mist sm:block"
            >
              {t.historyTitle || 'My Gallery'}
            </button>
          )}

          {showCredits && (
            <span className="whitespace-nowrap rounded-full bg-lab-mist px-3 py-2 text-xs font-bold tabular-nums text-lab-ink">
              <span className="hidden sm:inline">{userEmail ? t.creditsLeft : (t.freeCredits || t.creditsLeft)}: </span>{credits}
            </span>
          )}

          {userEmail && onBuyCredits && (
            <button
              type="button"
              onClick={onBuyCredits}
              className="rounded-md bg-lab-coral px-3 py-2 text-xs font-bold text-lab-ink transition-colors hover:bg-lab-ink hover:text-white sm:text-sm"
            >
              {t.buyCredits}
            </button>
          )}

          {onLanguageChange && (
            <label className="relative flex items-center gap-1.5 text-lab-ink/65 hover:text-lab-ink">
              <span className="sr-only">{t.selectLanguage}</span>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
                <path d="M3.5 12h17M12 3c2.2 2.45 3.35 5.45 3.35 9S14.2 18.55 12 21M12 3c-2.2 2.45-3.35 5.45-3.35 9S9.8 18.55 12 21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              <select
                value={language}
                onChange={(event) => onLanguageChange(event.target.value as Language)}
                className="language-select h-9 cursor-pointer border-0 bg-transparent px-0 text-xs font-bold text-lab-ink outline-none"
                aria-label={t.selectLanguage}
              >
                {languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          )}

          {userEmail && onLogout && (
            <button
              type="button"
              onClick={onLogout}
              title={userEmail}
              className="hidden rounded-md px-2 py-2 text-xs font-semibold text-lab-ink/65 hover:bg-lab-mist lg:block"
            >
              {SIGN_OUT[language] || SIGN_OUT[Language.EN]}
            </button>
          )}
        </div>
      </div>

      <nav className="flex border-t border-lab-line px-4 md:hidden" aria-label="Photo modes mobile">
        <a href="/restore" className={`flex-1 border-b-2 px-2 py-3 text-center text-xs font-bold ${mode === 'restore' ? 'border-lab-teal text-lab-ink' : 'border-transparent text-lab-ink/60'}`}>{t.restoreOldPhoto}</a>
        <a href="/" className={`flex-1 border-b-2 px-2 py-3 text-center text-xs font-bold ${mode === 'studio' ? 'border-lab-teal text-lab-ink' : 'border-transparent text-lab-ink/60'}`}>{t.uploadTitle}</a>
      </nav>
    </header>
  );
};

export default Header;

import React, { useState } from 'react';
import { TRANSLATIONS } from '../translations';
import { Language } from '../types';

interface EmailModalProps {
  onSubmit: (email: string) => Promise<string | void> | string | void;
  onClose: () => void;
  language: Language;
  cancellable?: boolean;
  initialEmail?: string;
}

const AUTH_TEXT: Record<Language, { sending: string; sent: string; invalid: string; support: string; submit: string }> = {
  [Language.EN]: {
    sending: 'Securing access...',
    sent: 'A secure login link has been sent. Open it from your email to continue.',
    invalid: 'Please enter a valid email.',
    support: 'Email login is temporarily unavailable. Please contact oleg@lihtneai.ee.',
    submit: 'Continue securely',
  },
  [Language.RU]: {
    sending: 'Защищаем доступ...',
    sent: 'Безопасная ссылка отправлена. Откройте её из письма, чтобы продолжить.',
    invalid: 'Введите правильный email.',
    support: 'Вход по email временно недоступен. Напишите на oleg@lihtneai.ee.',
    submit: 'Продолжить безопасно',
  },
  [Language.ET]: {
    sending: 'Juurdepääsu turvamine...',
    sent: 'Turvaline sisselogimislink on saadetud. Jätkamiseks avage see e-kirjast.',
    invalid: 'Sisestage kehtiv e-posti aadress.',
    support: 'E-posti sisselogimine pole ajutiselt saadaval. Kirjutage oleg@lihtneai.ee.',
    submit: 'Jätka turvaliselt',
  },
  [Language.LV]: {
    sending: 'Piekļuves aizsargāšana...',
    sent: 'Droša pieteikšanās saite ir nosūtīta. Atveriet to e-pastā, lai turpinātu.',
    invalid: 'Ievadiet derīgu e-pasta adresi.',
    support: 'Pieteikšanās ar e-pastu pašlaik nav pieejama. Rakstiet uz oleg@lihtneai.ee.',
    submit: 'Turpināt droši',
  },
  [Language.LT]: {
    sending: 'Prieigos apsauga...',
    sent: 'Saugi prisijungimo nuoroda išsiųsta. Norėdami tęsti, atidarykite ją el. pašte.',
    invalid: 'Įveskite galiojantį el. pašto adresą.',
    support: 'Prisijungimas el. paštu laikinai nepasiekiamas. Rašykite oleg@lihtneai.ee.',
    submit: 'Tęsti saugiai',
  },
  [Language.FI]: {
    sending: 'Suojataan käyttöoikeutta...',
    sent: 'Turvallinen kirjautumislinkki on lähetetty. Jatka avaamalla se sähköpostista.',
    invalid: 'Anna kelvollinen sähköpostiosoite.',
    support: 'Sähköpostikirjautuminen ei ole tilapäisesti käytettävissä. Kirjoita oleg@lihtneai.ee.',
    submit: 'Jatka turvallisesti',
  },
};

const EmailModal: React.FC<EmailModalProps> = ({
  onSubmit,
  onClose,
  language,
  cancellable = true,
  initialEmail = '',
}) => {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const t = TRANSLATIONS[language] || TRANSLATIONS[Language.EN];
  const authText = AUTH_TEXT[language] || AUTH_TEXT[Language.EN];

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError(authText.invalid);
      return;
    }
    if (!acceptedTerms) {
      setError(t.consentHint || 'Tick this box to continue.');
      return;
    }

    setSubmitting(true);
    try {
      const message = await onSubmit(normalizedEmail);
      if (message) setSuccess(message === 'LOGIN_LINK_SENT' ? authText.sent : message);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : '';
      setError(message === 'EMAIL_DELIVERY_NOT_CONFIGURED' ? authText.support : (message || authText.support));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-[#0c0c0c] border border-white/10 rounded-[2rem] p-8 sm:p-10 space-y-7 shadow-[0_0_80px_rgba(194,163,93,0.15)] relative">
        {cancellable && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 text-slate-500 hover:text-white transition-colors text-2xl"
            aria-label="Close"
          >
            x
          </button>
        )}

        <div className="text-center space-y-3">
          <h2 className="text-3xl font-serif text-white italic">{t.saveResult || 'Secure access'}</h2>
          <p className="text-slate-400 text-sm leading-relaxed">{t.enterEmailToSave}</p>
        </div>

        {success ? (
          <div className="rounded-2xl border border-gold/30 bg-gold/10 p-5 text-center text-sm leading-6 text-white">
            {success || authText.sent}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(event) => { setEmail(event.target.value); setError(''); }}
              placeholder="your@email.com"
              autoComplete="email"
              className="w-full bg-white/5 border border-white/10 focus:border-gold rounded-2xl px-6 py-4 text-white outline-none transition-all placeholder:text-slate-600 text-center text-lg"
              autoFocus
            />
            <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-left cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(event) => { setAcceptedTerms(event.target.checked); setError(''); }}
                className="mt-1 h-5 w-5 shrink-0 rounded border-white/30 bg-black/70 accent-[#c2a35d]"
              />
              <span className="text-xs leading-5 text-slate-400">
                {t.consentText}{' '}
                <a href="/terms.html" target="_blank" rel="noreferrer" className="text-gold hover:underline">Terms of Use</a>
                {' / '}
                <a href="/privacy-policy.html" target="_blank" rel="noreferrer" className="text-gold hover:underline">{t.privacyPolicyLink}</a>.
              </span>
            </label>
            {error && <p className="text-red-400 text-xs text-center" role="alert">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-5 bg-gold text-black rounded-2xl font-black text-base hover:bg-white transition-all active:scale-95 disabled:opacity-60 disabled:cursor-wait"
            >
              {submitting ? authText.sending : authText.submit}
            </button>
            <p className="text-slate-500 text-[10px] text-center uppercase tracking-widest mt-4">{t.emailReason}</p>
          </form>
        )}
      </div>
    </div>
  );
};

export default EmailModal;

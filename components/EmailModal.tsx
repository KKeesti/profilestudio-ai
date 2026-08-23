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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-lab-ink/75 p-4 font-lab animate-in fade-in duration-300 sm:p-6">
      <div className="relative w-full max-w-md space-y-6 rounded-lg border border-lab-line bg-white p-6 shadow-[0_24px_70px_rgba(21,48,43,0.25)] sm:p-8">
        {cancellable && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-md text-2xl font-bold text-lab-ink/50 transition-colors hover:bg-lab-mist hover:text-lab-ink"
            aria-label="Close"
          >
            x
          </button>
        )}

        <div className="pr-8 text-left">
          <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-lab-ink sm:text-3xl">{t.saveResult || 'Secure access'}</h2>
          <p className="mt-3 text-sm leading-6 text-lab-ink/65">{t.enterEmailToSave}</p>
        </div>

        {success ? (
          <div className="rounded-md border border-lab-teal bg-[#e7f5f2] p-5 text-center text-sm leading-6 text-lab-ink">
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
              className="w-full rounded-md border border-lab-line bg-lab-paper px-5 py-4 text-lg text-lab-ink outline-none transition-colors placeholder:text-lab-ink/35 focus:border-lab-teal"
              autoFocus
            />
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-lab-line bg-lab-paper p-4 text-left">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(event) => { setAcceptedTerms(event.target.checked); setError(''); }}
                className="mt-1 h-5 w-5 shrink-0 accent-[#08786f]"
              />
              <span className="text-xs leading-5 text-lab-ink/65">
                {t.consentText}{' '}
                <a href="/terms.html" target="_blank" rel="noreferrer" className="font-semibold text-lab-teal hover:underline">Terms of Use</a>
                {' / '}
                <a href="/privacy-policy.html" target="_blank" rel="noreferrer" className="font-semibold text-lab-teal hover:underline">{t.privacyPolicyLink}</a>.
              </span>
            </label>
            {error && <p className="text-center text-xs font-semibold text-red-600" role="alert">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="min-h-14 w-full rounded-md bg-lab-coral px-5 py-4 text-base font-extrabold text-lab-ink transition-colors hover:bg-lab-ink hover:text-white disabled:cursor-wait disabled:opacity-60"
            >
              {submitting ? authText.sending : authText.submit}
            </button>
            <p className="mt-4 text-center text-xs leading-5 text-lab-ink/55">{t.emailReason}</p>
          </form>
        )}
      </div>
    </div>
  );
};

export default EmailModal;

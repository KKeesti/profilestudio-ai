import React, { useState } from 'react';
import { TRANSLATIONS } from '../translations';
import { Language } from '../types';

interface EmailModalProps {
    onSubmit: (email: string) => void;
    onClose: () => void;
    language: Language;
    cancellable?: boolean;
}

const EmailModal: React.FC<EmailModalProps> = ({ onSubmit, onClose, language, cancellable = true }) => {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const t = TRANSLATIONS[language] || TRANSLATIONS[Language.EN];

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.includes('@') || !email.includes('.')) {
            setError(language === Language.RU ? '??????? ?????????? email' : 'Please enter a valid email');
            return;
        }
        if (!acceptedTerms) {
            setError(t.consentHint || (language === Language.RU ? '????????? ???????, ????? ??????????.' : 'Tick this box to continue.'));
            return;
        }
        onSubmit(email);
    };

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="w-full max-w-md bg-[#0c0c0c] border border-white/10 rounded-[2.5rem] p-10 space-y-8 shadow-[0_0_80px_rgba(194,163,93,0.15)] animate-in zoom-in-95 duration-500 relative">
                {cancellable && (
                    <button 
                      onClick={onClose} 
                      className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors"
                    >
                      ✕
                    </button>
                )}
                {/* Icon */}
                <div className="flex justify-center">
                    <div className="w-20 h-20 bg-gold/10 rounded-full flex items-center justify-center text-4xl border border-gold/20">
                        ✨
                    </div>
                </div>

                {/* Text */}
                <div className="text-center space-y-4">
                    <h2 className="text-3xl font-serif text-white italic">{t.saveResult || "Save Result"}</h2>
                    <p className="text-slate-400 text-sm leading-relaxed">
                        {t.enterEmailToSave}
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setError(''); }}
                        placeholder="your@email.com"
                        className="w-full bg-white/5 border border-white/10 focus:border-gold rounded-2xl px-6 py-4 text-white outline-none transition-all placeholder:text-slate-600 text-center text-lg"
                        autoFocus
                    />
                    <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-left cursor-pointer">
                        <input
                            type="checkbox"
                            checked={acceptedTerms}
                            onChange={(e) => { setAcceptedTerms(e.target.checked); setError(''); }}
                            className="mt-1 h-5 w-5 shrink-0 rounded border-white/30 bg-black/70 accent-[#c2a35d]"
                        />
                        <span className="text-xs leading-5 text-slate-400">
                            {t.consentText} <a href="/terms.html" target="_blank" className="text-gold hover:underline">Terms of Use</a> / <a href="/privacy-policy.html" target="_blank" className="text-gold hover:underline">{t.privacyPolicyLink}</a>.
                        </span>
                    </label>
                    {error && <p className="text-red-400 text-xs text-center">{error}</p>}
                    <button
                        type="submit"
                        className="w-full py-5 bg-gold text-black rounded-2xl font-black text-lg hover:bg-white transition-all active:scale-95 shadow-[0_10px_40px_rgba(194,163,93,0.3)]"
                    >
                        {t.saveResult} →
                    </button>
                    
                    <p className="text-slate-500 text-[10px] text-center uppercase tracking-widest mt-4">
                        {t.emailReason}
                    </p>
                </form>

            </div>
        </div>
    );
};

export default EmailModal;

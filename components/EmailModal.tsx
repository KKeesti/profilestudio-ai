import React, { useState } from 'react';

interface EmailModalProps {
    onSubmit: (email: string) => void;
    onClose: () => void;
    language: string;
}

const TEXTS: Record<string, any> = {
    ru: {
        title: 'Вам понравилось?',
        subtitle: '3 бесплатные генерации использованы. Введите email чтобы продолжить — откроем доступ к тарифам.',
        placeholder: 'ваш@email.com',
        btn: 'Продолжить →',
        note: 'Не спамим. Только уведомления о вашем аккаунте.',
    },
    en: {
        title: 'Enjoyed it?',
        subtitle: 'You\'ve used your 3 free generations. Enter your email to continue and unlock premium plans.',
        placeholder: 'your@email.com',
        btn: 'Continue →',
        note: 'No spam. Account notifications only.',
    },
    et: {
        title: 'Meeldis?',
        subtitle: 'Olete kasutanud oma 3 tasuta generatsiooni. Sisestage e-post jätkamiseks.',
        placeholder: 'teie@email.com',
        btn: 'Jätka →',
        note: 'Rämpsposti ei saada. Ainult kontoerinevused.',
    },
};

const EmailModal: React.FC<EmailModalProps> = ({ onSubmit, onClose, language }) => {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const lang = language in TEXTS ? language : 'en';
    const t = TEXTS[lang];

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.includes('@') || !email.includes('.')) {
            setError('Введите корректный email');
            return;
        }
        onSubmit(email);
    };

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[200] flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="w-full max-w-md bg-[#0c0c0c] border border-white/10 rounded-[2.5rem] p-10 space-y-8 shadow-[0_0_80px_rgba(194,163,93,0.15)] animate-in zoom-in-95 duration-500">
                {/* Icon */}
                <div className="flex justify-center">
                    <div className="w-20 h-20 bg-gold/10 rounded-full flex items-center justify-center text-4xl border border-gold/20">
                        ✨
                    </div>
                </div>

                {/* Text */}
                <div className="text-center space-y-3">
                    <h2 className="text-3xl font-serif text-white italic">{t.title}</h2>
                    <p className="text-slate-400 text-sm leading-relaxed">{t.subtitle}</p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setError(''); }}
                        placeholder={t.placeholder}
                        className="w-full bg-white/5 border border-white/10 focus:border-gold rounded-2xl px-6 py-4 text-white outline-none transition-all placeholder:text-slate-600 text-center text-lg"
                        autoFocus
                    />
                    {error && <p className="text-red-400 text-xs text-center">{error}</p>}
                    <button
                        type="submit"
                        className="w-full py-5 bg-gold text-black rounded-2xl font-black text-lg hover:bg-white transition-all active:scale-95 shadow-[0_10px_40px_rgba(194,163,93,0.3)]"
                    >
                        {t.btn}
                    </button>
                </form>

                <p className="text-slate-600 text-[10px] text-center uppercase tracking-widest">{t.note}</p>
            </div>
        </div>
    );
};

export default EmailModal;

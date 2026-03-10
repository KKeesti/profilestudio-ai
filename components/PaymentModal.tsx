import React from 'react';

interface PaymentModalProps {
    onSelect: (planId: string) => void;
    language: string;
}

const TEXTS: Record<string, any> = {
    ru: {
        title: 'Выберите ваш пакет',
        subtitle: 'Ваши бесплатные попытки закончились. Выберите пакет генераций чтобы продолжить создание шедевров.',
        plan1: 'Старт',
        plan1Desc: '20 генераций высокого качества',
        plan1Price: '5 €',
        plan2: 'Профи',
        plan2Desc: '50 генераций + приоритет нейросети',
        plan2Price: '10 €',
        btn: 'Купить сейчас',
        secure: 'Безопасная оплата через Stripe'
    },
    en: {
        title: 'Choose your plan',
        subtitle: 'Free trials used. Choose a pack to continue generating professional photos.',
        plan1: 'Start',
        plan1Desc: '20 high-quality generations',
        plan1Price: '5 €',
        plan2: 'Pro',
        plan2Desc: '50 generations + priority processing',
        plan2Price: '10 €',
        btn: 'Buy Now',
        secure: 'Secure payment via Stripe'
    },
    et: {
        title: 'Vali oma pakett',
        subtitle: 'Tasuta prooviversioonid on otsas. Vali pakett, et jätkata.',
        plan1: 'Start',
        plan1Desc: '20 kvaliteetset generatsiooni',
        plan1Price: '5 €',
        plan2: 'Pro',
        plan2Desc: '50 generatsiooni + prioriteetne töötlus',
        plan2Price: '10 €',
        btn: 'Osta kohe',
        secure: 'Turvaline makse Stripe kaudu'
    }
};

const PaymentModal: React.FC<PaymentModalProps> = ({ onSelect, language }) => {
    const lang = language in TEXTS ? language : 'en';
    const t = TEXTS[lang];

    return (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl z-[210] flex items-center justify-center p-6 animate-in fade-in duration-500">
            <div className="w-full max-w-2xl space-y-10 animate-in slide-in-from-bottom-10 duration-700">
                <div className="text-center space-y-4">
                    <h2 className="text-4xl md:text-5xl font-serif text-white italic">{t.title}</h2>
                    <p className="text-slate-400 max-w-md mx-auto">{t.subtitle}</p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    {/* Plan 1 */}
                    <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 space-y-8 hover:border-gold transition-all group relative overflow-hidden">
                        <div className="space-y-4">
                            <h3 className="text-2xl font-bold text-white">{t.plan1}</h3>
                            <p className="text-slate-400 text-sm">{t.plan1Desc}</p>
                        </div>
                        <div className="text-4xl font-black text-gold">{t.plan1Price}</div>
                        <button
                            onClick={() => onSelect('plan_small')}
                            className="w-full py-4 bg-white/10 text-white rounded-2xl font-bold hover:bg-gold hover:text-black transition-all"
                        >
                            {t.btn}
                        </button>
                    </div>

                    {/* Plan 2 */}
                    <div className="bg-gold/10 border border-gold/30 rounded-[2.5rem] p-8 space-y-8 hover:border-gold transition-all group relative overflow-hidden shadow-[0_0_50px_rgba(194,163,93,0.2)]">
                        <div className="absolute top-4 right-6 bg-gold text-black text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Best Value</div>
                        <div className="space-y-4">
                            <h3 className="text-2xl font-bold text-white">{t.plan2}</h3>
                            <p className="text-slate-400 text-sm">{t.plan2Desc}</p>
                        </div>
                        <div className="text-4xl font-black text-gold">{t.plan2Price}</div>
                        <button
                            onClick={() => onSelect('plan_large')}
                            className="w-full py-4 bg-gold text-black rounded-2xl font-bold hover:bg-white transition-all shadow-lg"
                        >
                            {t.btn}
                        </button>
                    </div>
                </div>

                <div className="flex items-center justify-center gap-2 text-slate-600 text-[10px] uppercase tracking-[0.3em] font-bold">
                    <span>🔒</span> {t.secure}
                </div>
            </div>
        </div>
    );
};

export default PaymentModal;

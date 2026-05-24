import React from 'react';

interface PaymentModalProps {
    onSelect: (planId: string) => void;
    onClose?: () => void;
    language: string;
}

const TEXTS: Record<string, any> = {
    ru: {
        title: 'Выберите ваш пакет',
        subtitle: 'Бесплатные попытки закончились. Выберите пакет генераций, чтобы продолжить.',
        plan1: 'Старт',
        plan1Desc: '20 генераций',
        plan1Price: '5 €',
        plan2: 'Профи',
        plan2Desc: '50 генераций',
        plan2Price: '10 €',
        btn: 'Купить сейчас',
        best: 'Лучший выбор',
        secure: 'Безопасная оплата через Stripe',
        featuresTitle: 'В платном пакете:',
        features: ['личная галерея портретов', 'ручные правки результата', 'голосовые правки']
    },
    en: {
        title: 'Choose your plan',
        subtitle: 'Free attempts are over. Choose a generation pack to continue.',
        plan1: 'Start',
        plan1Desc: '20 generations',
        plan1Price: '5 €',
        plan2: 'Pro',
        plan2Desc: '50 generations',
        plan2Price: '10 €',
        btn: 'Buy Now',
        best: 'Best Value',
        secure: 'Secure payment via Stripe',
        featuresTitle: 'Included in paid packs:',
        features: ['your private portrait gallery', 'manual result corrections', 'voice corrections']
    },
    et: {
        title: 'Vali oma pakett',
        subtitle: 'Tasuta katsed on läbi. Vali jätkamiseks genereerimiste pakett.',
        plan1: 'Start',
        plan1Desc: '20 genereerimist',
        plan1Price: '5 €',
        plan2: 'Pro',
        plan2Desc: '50 genereerimist',
        plan2Price: '10 €',
        btn: 'Osta kohe',
        best: 'Parim valik',
        secure: 'Turvaline makse Stripe kaudu',
        featuresTitle: 'Tasulises paketis:',
        features: ['isiklik portreegalerii', 'käsitsi parandused', 'häälparandused']
    },
    lv: {
        title: 'Izvēlieties paketi',
        subtitle: 'Bezmaksas mēģinājumi ir beigušies. Izvēlieties ģenerāciju paketi, lai turpinātu.',
        plan1: 'Starts',
        plan1Desc: '20 ģenerācijas',
        plan1Price: '5 €',
        plan2: 'Pro',
        plan2Desc: '50 ģenerācijas',
        plan2Price: '10 €',
        btn: 'Pirkt tagad',
        best: 'Labākā izvēle',
        secure: 'Droša apmaksa ar Stripe',
        featuresTitle: 'Maksas paketē:',
        features: ['personīgā portretu galerija', 'manuāli labojumi', 'balss labojumi']
    },
    lt: {
        title: 'Pasirinkite paketą',
        subtitle: 'Nemokami bandymai baigėsi. Pasirinkite generacijų paketą, kad tęstumėte.',
        plan1: 'Startas',
        plan1Desc: '20 generacijų',
        plan1Price: '5 €',
        plan2: 'Pro',
        plan2Desc: '50 generacijų',
        plan2Price: '10 €',
        btn: 'Pirkti dabar',
        best: 'Geriausias pasirinkimas',
        secure: 'Saugus mokėjimas per Stripe',
        featuresTitle: 'Mokamame pakete:',
        features: ['asmeninė portretų galerija', 'rankiniai pataisymai', 'balso pataisymai']
    },
    fi: {
        title: 'Valitse paketti',
        subtitle: 'Ilmaiset kokeilut ovat loppuneet. Valitse generointipaketti jatkaaksesi.',
        plan1: 'Start',
        plan1Desc: '20 generointia',
        plan1Price: '5 €',
        plan2: 'Pro',
        plan2Desc: '50 generointia',
        plan2Price: '10 €',
        btn: 'Osta nyt',
        best: 'Paras valinta',
        secure: 'Turvallinen maksu Stripen kautta',
        featuresTitle: 'Maksulliseen pakettiin kuuluu:',
        features: ['oma muotokuvagalleria', 'manuaaliset korjaukset', 'äänikorjaukset']
    }
};

const PaymentModal: React.FC<PaymentModalProps> = ({ onSelect, onClose, language }) => {
    const lang = language in TEXTS ? language : 'en';
    const t = TEXTS[lang];

    return (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl z-[210] flex items-center justify-center p-6 animate-in fade-in duration-500">
            {onClose && (
                <button
                    onClick={onClose}
                    className="absolute top-10 right-10 text-white/40 hover:text-white transition-colors text-4xl p-4 z-[220]"
                    aria-label="Close"
                >
                    x
                </button>
            )}
            <div className="w-full max-w-2xl space-y-8 animate-in slide-in-from-bottom-10 duration-700">
                <div className="text-center space-y-4">
                    <h2 className="text-4xl md:text-5xl font-serif text-white italic">{t.title}</h2>
                    <p className="text-slate-400 max-w-md mx-auto">{t.subtitle}</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-3xl px-6 py-5">
                    <p className="text-gold text-[10px] font-black uppercase tracking-[0.3em] mb-3">{t.featuresTitle}</p>
                    <div className="grid sm:grid-cols-3 gap-3">
                        {t.features.map((feature: string) => (
                            <div key={feature} className="text-slate-300 text-xs bg-black/20 border border-white/5 rounded-2xl px-4 py-3">
                                {feature}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
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

                    <div className="bg-gold/10 border border-gold/30 rounded-[2.5rem] p-8 space-y-8 hover:border-gold transition-all group relative overflow-hidden shadow-[0_0_50px_rgba(194,163,93,0.2)]">
                        <div className="absolute top-4 right-6 bg-gold text-black text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">{t.best}</div>
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
                    {t.secure}
                </div>
            </div>
        </div>
    );
};

export default PaymentModal;

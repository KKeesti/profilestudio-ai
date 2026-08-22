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
        <div className="fixed inset-0 z-[210] flex items-center justify-center overflow-y-auto bg-lab-ink/75 p-4 font-lab animate-in fade-in duration-300 sm:p-6">
            {onClose && (
                <button
                    onClick={onClose}
                    className="fixed right-4 top-4 z-[220] flex h-11 w-11 items-center justify-center rounded-md bg-white text-2xl font-bold text-lab-ink shadow-lg transition-colors hover:bg-lab-coral hover:text-white sm:right-8 sm:top-8"
                    aria-label="Close"
                >
                    x
                </button>
            )}
            <div className="my-auto w-full max-w-3xl rounded-lg bg-lab-paper p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] animate-in slide-in-from-bottom-10 duration-500 sm:p-8">
                <div className="text-center">
                    <h2 className="text-3xl font-extrabold tracking-[-0.03em] text-lab-ink sm:text-4xl">{t.title}</h2>
                    <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-lab-ink/65 sm:text-base">{t.subtitle}</p>
                </div>

                <div className="mt-6 border-y border-lab-line py-5">
                    <p className="mb-3 text-sm font-extrabold text-lab-ink">{t.featuresTitle}</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                        {t.features.map((feature: string) => (
                            <div key={feature} className="flex items-start gap-2 rounded-md bg-white px-3 py-3 text-xs font-semibold leading-5 text-lab-ink">
                                <span className="text-lab-teal">✓</span><span>{feature}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-lab-line bg-white p-5 sm:p-6">
                        <div>
                            <h3 className="text-xl font-extrabold text-lab-ink">{t.plan1}</h3>
                            <p className="mt-1 text-sm text-lab-ink/60">{t.plan1Desc}</p>
                        </div>
                        <div className="my-6 text-4xl font-extrabold tabular-nums text-lab-ink">{t.plan1Price}</div>
                        <button
                            onClick={() => onSelect('plan_small')}
                            className="min-h-12 w-full rounded-md border border-lab-teal bg-white px-4 py-3 font-extrabold text-lab-teal transition-colors hover:bg-lab-teal hover:text-white"
                        >
                            {t.btn}
                        </button>
                    </div>

                    <div className="relative rounded-lg border border-lab-teal bg-lab-teal p-5 text-white shadow-[0_16px_36px_rgba(8,120,111,0.2)] sm:p-6">
                        <div className="absolute right-4 top-4 rounded-full bg-white px-3 py-1 text-xs font-extrabold text-lab-teal">{t.best}</div>
                        <div>
                            <h3 className="text-xl font-extrabold">{t.plan2}</h3>
                            <p className="mt-1 text-sm text-white/75">{t.plan2Desc}</p>
                        </div>
                        <div className="my-6 text-4xl font-extrabold tabular-nums">{t.plan2Price}</div>
                        <button
                            onClick={() => onSelect('plan_large')}
                            className="min-h-12 w-full rounded-md bg-lab-coral px-4 py-3 font-extrabold text-white transition-colors hover:bg-white hover:text-lab-ink"
                        >
                            {t.btn}
                        </button>
                    </div>
                </div>

                <div className="mt-5 flex items-center justify-center gap-2 text-xs font-semibold text-lab-ink/55">
                    {t.secure}
                </div>
            </div>
        </div>
    );
};

export default PaymentModal;

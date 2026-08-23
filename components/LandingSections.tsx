import React from 'react';
import { ICONS } from '../constants';
import { LANDING_CONTENT } from '../landingContent';
import { TRANSLATIONS } from '../translations';
import { Language } from '../types';
import BeforeAfter from './BeforeAfter';

interface LandingSectionsProps {
  language: Language;
  onUpload: () => void;
  onShowPricing: () => void;
}

const SOURCE_LINKS = {
  restoreMain: 'https://commons.wikimedia.org/wiki/File:Portrait_of_woman,_1940.jpg',
  restoreFamily: 'https://commons.wikimedia.org/wiki/File:1895_Boston_family_portrait.jpg',
  restoreDoty: 'https://commons.wikimedia.org/wiki/File:Daguerreotype_of_The_Doty_Family_by_Robert_Peckham.jpg',
};

const GENERATIONS: Record<Language, string> = {
  [Language.EN]: 'generations',
  [Language.ET]: 'genereerimist',
  [Language.RU]: 'генераций',
  [Language.LV]: 'ģenerācijas',
  [Language.LT]: 'generacijų',
  [Language.FI]: 'generointia',
};

const CheckIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="m5 10.5 3.1 3L15 6.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LandingSections: React.FC<LandingSectionsProps> = ({
  language,
  onUpload,
  onShowPricing,
}) => {
  const copy = LANDING_CONTENT[language];
  const t = TRANSLATIONS[language];
  const restoreExamples = [
    {
      before: '/demo/restoration-before.webp',
      after: '/demo/restoration-after.webp',
      title: copy.restoreExamples[0],
      source: SOURCE_LINKS.restoreMain,
      objectPosition: 'center top',
    },
    {
      before: '/examples/restore-family-1895-before.webp',
      after: '/examples/restore-family-1895-after.webp',
      title: copy.restoreExamples[1],
      source: SOURCE_LINKS.restoreFamily,
      objectPosition: 'center',
    },
    {
      before: '/examples/restore-doty-before.webp',
      after: '/examples/restore-doty-after.webp',
      title: copy.restoreExamples[2],
      source: SOURCE_LINKS.restoreDoty,
      objectPosition: 'center',
    },
  ];
  const examples = restoreExamples;
  const processImages = ['/demo/restoration-before.webp', '/examples/restore-family-1895-after.webp', '/demo/restoration-after.webp'];

  return (
    <>
      <section id="examples" className="bg-white px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-[1200px]">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div className="max-w-3xl">
              <h2 className="text-balance text-3xl font-extrabold leading-tight text-lab-ink sm:text-5xl">
                {copy.galleryRestoreTitle}
              </h2>
              <p className="mt-4 max-w-[70ch] text-base leading-7 text-lab-ink/70">{copy.galleryIntro}</p>
            </div>
            <span className="text-sm font-bold text-lab-teal">{copy.realResults}</span>
          </div>

          <div className="mt-9 grid gap-6 lg:grid-cols-3">
            {examples.map((example) => (
              <article key={example.title} className="min-w-0">
                <BeforeAfter
                  before={example.before}
                  after={example.after}
                  beforeLabel={t.demoBefore}
                  afterLabel={t.demoAfter}
                  ariaLabel={`${copy.compareLabel}: ${example.title}`}
                  className="aspect-[4/5] rounded-lg"
                  objectPosition={example.objectPosition}
                />
                <div className="mt-4 flex items-start justify-between gap-3">
                  <h3 className="text-lg font-extrabold text-lab-ink">{example.title}</h3>
                  <a
                    href={example.source}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-xs font-semibold text-lab-ink/55 underline decoration-lab-line underline-offset-4 hover:text-lab-teal"
                  >
                    {copy.sourcePhoto}
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-lab-paper px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-[1200px]">
          <div className="max-w-3xl">
            <h2 className="text-balance text-3xl font-extrabold leading-tight text-lab-ink sm:text-5xl">{copy.howTitle}</h2>
            <p className="mt-4 max-w-[65ch] text-base leading-7 text-lab-ink/70">{copy.howIntro}</p>
          </div>
          <div className="mt-9 grid gap-8 md:grid-cols-3">
            {copy.steps.map((step, index) => (
              <div key={step.title}>
                <div className="relative aspect-[16/10] overflow-hidden rounded-lg bg-lab-mist">
                  <img src={processImages[index]} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
                  {index === 2 && (
                    <span className="absolute bottom-4 left-4 flex h-11 w-11 items-center justify-center rounded-md bg-lab-coral text-lab-ink shadow-[0_8px_20px_rgba(21,48,43,0.24)]">
                      <ICONS.Download />
                    </span>
                  )}
                </div>
                <h3 className="mt-5 text-xl font-extrabold text-lab-ink">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-lab-ink/65">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-white px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-[1200px]">
          <div className="max-w-3xl">
            <h2 className="text-balance text-3xl font-extrabold leading-tight text-lab-ink sm:text-5xl">{copy.pricingTitle}</h2>
            <p className="mt-4 max-w-[65ch] text-base leading-7 text-lab-ink/70">{copy.pricingIntro}</p>
          </div>
          <div className="mt-9 grid gap-4 lg:grid-cols-3">
            <article className="rounded-lg border border-lab-line bg-lab-paper p-6">
              <h3 className="text-xl font-extrabold text-lab-ink">{copy.freePlanName}</h3>
              <p className="mt-2 min-h-12 text-sm leading-6 text-lab-ink/65">{copy.freePlanDesc}</p>
              <p className="mt-7 text-4xl font-extrabold tabular-nums text-lab-ink">0 €</p>
              <button type="button" onClick={onUpload} className="mt-7 min-h-12 w-full rounded-md bg-lab-coral px-5 py-3 font-extrabold text-lab-ink transition-colors hover:bg-lab-ink hover:text-white">
                {copy.startFree}
              </button>
            </article>
            {[
              { name: 'Start', amount: 20, price: '5 €' },
              { name: 'Pro', amount: 50, price: '10 €' },
            ].map((plan) => (
              <article key={plan.name} className="rounded-lg border border-lab-line bg-white p-6">
                <h3 className="text-xl font-extrabold text-lab-ink">{plan.name}</h3>
                <p className="mt-2 text-sm text-lab-ink/65">{plan.amount} {GENERATIONS[language]}</p>
                <p className="mt-7 text-4xl font-extrabold tabular-nums text-lab-ink">{plan.price}</p>
                <p className="mt-2 text-xs font-semibold text-lab-ink/50">{copy.oneTimePayment}</p>
                <button type="button" onClick={onShowPricing} className="mt-6 min-h-12 w-full rounded-md border border-lab-teal bg-white px-5 py-3 font-extrabold text-lab-teal transition-colors hover:bg-lab-teal hover:text-white">
                  {copy.choosePackage}
                </button>
              </article>
            ))}
          </div>
          <div className="mt-7 border-t border-lab-line pt-6">
            <p className="text-sm font-extrabold text-lab-ink">{copy.paidFeaturesTitle}</p>
            <ul className="mt-3 flex flex-col gap-3 text-sm font-semibold text-lab-ink/70 sm:flex-row sm:gap-8">
              {copy.paidFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-lab-teal"><CheckIcon /><span className="text-lab-ink/70">{feature}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="bg-lab-ink px-4 py-14 text-white sm:px-6 sm:py-20">
        <div className="mx-auto grid max-w-[1200px] gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <h2 className="text-balance text-3xl font-extrabold leading-tight sm:text-5xl">{copy.privacyTitle}</h2>
            <p className="mt-5 max-w-[60ch] text-base leading-7 text-[#d8ece6]">{copy.privacyIntro}</p>
            <a href="/privacy-policy.html" target="_blank" className="mt-6 inline-block text-sm font-bold text-white underline decoration-lab-teal underline-offset-4">
              {t.privacyPolicyLink}
            </a>
          </div>
          <ul className="divide-y divide-white/15 border-y border-white/15">
            {copy.privacyPoints.map((point) => (
              <li key={point} className="flex gap-4 py-5 text-sm font-semibold leading-6 text-[#d8ece6]">
                <span className="mt-0.5 text-lab-coral"><CheckIcon /></span><span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="faq" className="bg-lab-paper px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto grid max-w-[1200px] gap-8 lg:grid-cols-[0.65fr_1.35fr] lg:gap-16">
          <h2 className="text-balance text-3xl font-extrabold leading-tight text-lab-ink sm:text-5xl">{copy.faqTitle}</h2>
          <div className="border-t border-lab-line">
            {copy.faqs.map((faq) => (
              <details key={faq.question} className="group border-b border-lab-line py-1">
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 py-4 text-left text-base font-extrabold text-lab-ink marker:content-none">
                  <span>{faq.question}</span>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xl font-normal text-lab-teal transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p className="max-w-[70ch] pb-5 pr-12 text-sm leading-6 text-lab-ink/70">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-7 border-y border-lab-line py-10 md:flex-row md:items-center">
          <h2 className="max-w-3xl text-balance text-3xl font-extrabold leading-tight text-lab-ink sm:text-5xl">
            {copy.finalRestoreTitle}
          </h2>
          <button type="button" onClick={onUpload} className="flex min-h-14 w-full shrink-0 items-center justify-center gap-3 rounded-md bg-lab-coral px-6 py-4 text-base font-extrabold text-lab-ink transition-colors hover:bg-lab-ink hover:text-white md:w-auto">
            <ICONS.Camera /> {copy.finalRestoreCta}
          </button>
        </div>
      </section>
    </>
  );
};

export default LandingSections;

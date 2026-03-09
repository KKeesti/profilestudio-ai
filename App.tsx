
import React, { useState, useEffect, useRef } from 'react';
import { AppStep, ProcessingState, PhotoStyle, AspectRatio, Language } from './types';
import Header from './components/Header';
import { GeminiService } from './services/geminiService';
import { ICONS } from './constants';
import { TRANSLATIONS } from './translations';

const App: React.FC = () => {
  const [language, setLanguage] = useState<Language>(Language.RU);
  const [step, setStep] = useState<AppStep>(AppStep.LANGUAGE_SELECT);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [selectedStyle, setSelectedStyle] = useState<PhotoStyle | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [correctionRequest, setCorrectionRequest] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [credits, setCredits] = useState<number>(3);
  const [processing, setProcessing] = useState<ProcessingState>({
    isProcessing: false,
    status: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      try {
        // @ts-ignore
        if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
          // @ts-ignore
          const keyStatus = await window.aistudio.hasSelectedApiKey();
          setHasKey(keyStatus);
        } else {
          setHasKey(!!process.env.API_KEY);
        }
      } catch (e) {
        setHasKey(false);
      }
    };
    checkKey();
  }, []);

  const handleKeySetup = async () => {
    try {
      // @ts-ignore
      if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
        // @ts-ignore
        await window.aistudio.openSelectKey();
        setHasKey(true);
      } else {
        alert("Настройка ключа доступна только внутри среды AI Studio.");
      }
    } catch (e) {
      console.error("Key setup error:", e);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setOriginalImage(event.target?.result as string);
        setStep(AppStep.CHOOSE_STYLE);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async (style: PhotoStyle) => {
    if (!originalImage) return;
    if (!hasKey) {
      await handleKeySetup();
      return;
    }

    const t = TRANSLATIONS[language];

    if (credits <= 0) {
      alert(t.outOfCredits);
      return;
    }

    const statusMap = {
      [PhotoStyle.CLASSIC_STUDIO]: t.processingClassic,
      [PhotoStyle.FASHION_EDITORIAL]: t.processingFashion,
      [PhotoStyle.BUSINESS_LUXE]: t.processingBusiness,
    };

    setProcessing({ isProcessing: true, status: statusMap[style] });

    try {
      const base64Data = originalImage.split(',')[1];
      const mimeType = originalImage.split(';')[0].split(':')[1];
      const res = await GeminiService.generateStudioPhoto(base64Data, mimeType, style, aspectRatio, customPrompt);
      setResultImage(res);
      setStep(AppStep.RESULT);
      setCredits(prev => Math.max(0, prev - 1));
    } catch (error: any) {
      console.error("Generation error:", error);
      if (error.message?.includes("Requested entity was not found.")) {
        setHasKey(false);
        await handleKeySetup();
      } else {
        alert("Произошла ошибка при генерации. Попробуйте обновить страницу.");
      }
    } finally {
      setProcessing({ isProcessing: false, status: '' });
    }
  };

  const handleRefine = async () => {
    if (!resultImage || !correctionRequest) return;
    const t = TRANSLATIONS[language];
    setProcessing({ isProcessing: true, status: t.processingRefine });
    try {
      const base64Data = resultImage.split(',')[1];
      const mimeType = resultImage.split(';')[0].split(':')[1];
      const res = await GeminiService.refinePhoto(base64Data, mimeType, correctionRequest, aspectRatio);
      setResultImage(res);
      setCorrectionRequest('');
    } catch (error: any) {
      console.error("Refine error:", error);
      alert("Не удалось применить правки.");
    } finally {
      setProcessing({ isProcessing: false, status: '' });
    }
  };

  const addTag = (tag: string) => {
    setCustomPrompt(prev => prev ? `${prev}, ${tag.toLowerCase()}` : tag);
  };

  const renderContent = () => {
    const t = TRANSLATIONS[language];
    const QUICK_TAGS = [
      t.forTinder,
      t.instaStyle,
      t.businessPortrait,
      t.softSmile,
      t.studioLight,
      t.elegantLook,
      t.cinematic,
      t.naturalLook
    ];

    switch (step) {
      case AppStep.LANGUAGE_SELECT:
        return (
          <div className="max-w-2xl mx-auto py-20 px-8 bg-white/5 border border-white/10 rounded-[3rem] flex flex-col items-center gap-12 shadow-2xl animate-in fade-in zoom-in-95 duration-500">
            <div className="text-center space-y-4">
              <h2 className="text-4xl md:text-5xl font-serif text-white italic">ProfileStudio AI</h2>
              <p className="text-slate-400 max-w-sm mx-auto leading-relaxed">
                Select your language / Valige keel / Выберите язык
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
              {[
                { id: Language.EN, label: 'English', flag: '🇺🇸' },
                { id: Language.ET, label: 'Eesti', flag: '🇪🇪' },
                { id: Language.RU, label: 'Русский', flag: '🇷🇺' }
              ].map(lang => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => {
                    setLanguage(lang.id);
                    setStep(AppStep.UPLOAD);
                  }}
                  className="group px-6 py-8 bg-white/5 hover:bg-gold text-white hover:text-black rounded-[2rem] font-bold text-xl transition-all transform hover:-translate-y-1 border border-white/10 flex flex-col items-center gap-3 active:scale-95"
                >
                  <span className="text-4xl">{lang.flag}</span>
                  {lang.label}
                </button>
              ))}
            </div>
          </div>
        );

      case AppStep.UPLOAD:
        return (
          <div className="max-w-2xl mx-auto py-20 px-8 bg-white/5 border border-white/10 rounded-[3rem] flex flex-col items-center gap-12 shadow-2xl animate-in fade-in zoom-in-95 duration-500">
            <div className="w-28 h-28 bg-gold/10 rounded-full flex items-center justify-center text-gold ring-1 ring-gold/20 relative">
              <ICONS.Camera />
              <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-gold rounded-full flex items-center justify-center text-black text-xs font-bold animate-bounce">+</div>
            </div>
            <div className="text-center space-y-4">
              <h2 className="text-4xl md:text-5xl font-serif text-white italic">{t.uploadTitle}</h2>
              <p className="text-slate-400 max-w-sm mx-auto leading-relaxed">
                {t.uploadDesc}
              </p>
            </div>
            <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group px-16 py-6 bg-gold text-black rounded-full font-bold text-xl hover:bg-white transition-all transform hover:-translate-y-1 shadow-[0_20px_50px_rgba(194,163,93,0.3)] flex items-center gap-3 active:scale-95"
            >
              {t.startBtn} <ICONS.Magic />
            </button>
          </div>
        );

      case AppStep.CHOOSE_STYLE:
        return (
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-start animate-in slide-in-from-bottom-8 duration-700">
            <div className="relative rounded-[3rem] overflow-hidden border border-white/10 sticky top-10 shadow-2xl bg-black group hidden lg:block">
              {originalImage && <img src={originalImage} alt="Original" className="w-full h-auto opacity-70 group-hover:opacity-100 transition-opacity duration-1000" />}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>
              <div className="absolute bottom-8 left-8">
                <span className="text-[10px] text-gold font-bold uppercase tracking-[0.3em] bg-black/50 backdrop-blur-md px-4 py-2 rounded-full border border-gold/20">{t.originalPhoto}</span>
              </div>
            </div>

            <div className="space-y-10 pb-20">
              <div className="space-y-4">
                <h2 className="text-4xl md:text-5xl font-serif text-white italic">{t.chooseStyle}</h2>
                <div className="flex items-center gap-4">
                  <div className="h-px w-16 bg-gold/50"></div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{t.setupShot}</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <label className="text-gold text-[10px] uppercase font-bold tracking-[0.4em]">{t.aspectRatio}</label>
                </div>
                <div className="flex gap-4">
                  {[
                    { id: '9:16' as AspectRatio, label: t.portrait, sub: '9:16' },
                    { id: '16:9' as AspectRatio, label: t.landscape, sub: '16:9' }
                  ].map(format => (
                    <button
                      key={format.id}
                      type="button"
                      onClick={() => setAspectRatio(format.id)}
                      className={`flex-1 py-5 rounded-[2rem] border-2 transition-all flex flex-col items-center justify-center gap-1 ${aspectRatio === format.id ? 'border-gold bg-gold/10 text-gold shadow-lg' : 'border-white/5 bg-white/5 text-slate-500 hover:border-white/20'}`}
                    >
                      <span className="font-bold">{format.label}</span>
                      <span className="text-[8px] opacity-50 uppercase tracking-widest">{format.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-gold text-[10px] uppercase font-bold tracking-[0.4em]">{t.chooseStyleLabel}</label>
                  {!hasKey && (
                    <span className="text-[8px] text-red-500 uppercase font-bold bg-red-500/10 px-2 py-0.5 rounded animate-pulse">API KEY REQUIRED</span>
                  )}
                </div>
                <div className="grid gap-3">
                  {[
                    { id: PhotoStyle.CLASSIC_STUDIO, icon: <ICONS.Studio />, title: t.classicStudio, desc: t.classicStudioDesc },
                    { id: PhotoStyle.FASHION_EDITORIAL, icon: <ICONS.Fashion />, title: t.fashionEditorial, desc: t.fashionEditorialDesc },
                    { id: PhotoStyle.BUSINESS_LUXE, icon: <ICONS.Luxe />, title: t.businessLuxe, desc: t.businessLuxeDesc }
                  ].map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setSelectedStyle(style.id)}
                      className={`p-5 rounded-[1.8rem] border-2 flex items-center gap-5 text-left transition-all group ${selectedStyle === style.id ? 'border-gold bg-gold/5 ring-1 ring-gold/20' : 'border-white/5 bg-white/5 hover:bg-white/10'}`}
                    >
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${selectedStyle === style.id ? 'bg-gold text-black' : 'bg-white/5 text-slate-500'}`}>{style.icon}</div>
                      <div>
                        <div className={`font-bold text-lg ${selectedStyle === style.id ? 'text-gold' : 'text-white'}`}>{style.title}</div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest">{style.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <label className="text-gold text-[10px] uppercase font-bold tracking-[0.4em]">{t.customPrompt}</label>
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {QUICK_TAGS.map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => addTag(tag)}
                        className="px-4 py-2 bg-white/5 hover:bg-gold/10 border border-white/10 rounded-full text-[10px] text-slate-400 hover:text-gold transition-all whitespace-nowrap uppercase tracking-widest font-bold"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder={t.customPromptPlaceholder}
                      className="w-full bg-white/5 border border-white/10 rounded-[2rem] p-6 text-white focus:border-gold outline-none h-32 md:h-40 resize-none transition-all placeholder:text-slate-700 text-lg shadow-inner focus:bg-white/[0.07]"
                    />

                    {customPrompt.length > 0 && selectedStyle && (
                      <div className="mt-8 animate-in fade-in slide-in-from-top-6 duration-500">
                        <button
                          type="button"
                          onClick={() => handleGenerate(selectedStyle)}
                          className="w-full py-7 bg-gold text-black rounded-[2rem] font-black text-2xl flex items-center justify-center gap-5 transition-all hover:bg-white hover:scale-[1.02] shadow-[0_20px_50px_rgba(194,163,93,0.35)] active:scale-95"
                        >
                          <ICONS.Magic /> {t.generateBtn}
                        </button>
                        <p className="text-center mt-4 text-[9px] text-slate-600 uppercase tracking-[0.4em] font-bold">Neural Engine Processing ~30s</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <button type="button" onClick={() => setStep(AppStep.UPLOAD)} className="text-slate-600 hover:text-white text-[10px] uppercase tracking-[0.5em] font-bold py-4 transition-all hover:translate-x-[-4px]">← {t.backToStyles}</button>
            </div>
          </div>
        );

      case AppStep.RESULT:
        return (
          <div className="max-w-6xl mx-auto flex flex-col items-center gap-12 lg:gap-16 animate-in fade-in zoom-in-95 duration-1000 mb-20">
            <div className="text-center space-y-4">
              <h2 className="text-5xl md:text-6xl font-serif text-white italic">{t.resultTitle}</h2>
              <div className="inline-block px-6 py-1 bg-gold/5 rounded-full border border-gold/20 text-gold text-[10px] uppercase tracking-[0.5em] font-bold">Professional 8K Render</div>
            </div>

            <div className="flex flex-col items-center gap-6 w-full">
              <div
                className={`relative rounded-[3.5rem] overflow-hidden border border-white/10 shadow-[0_0_100px_rgba(194,163,93,0.15)] group transition-all duration-700 w-full ${aspectRatio === '9:16' ? 'max-w-md' : 'max-w-5xl'}`}
                onMouseDown={() => setShowOriginal(true)}
                onMouseUp={() => setShowOriginal(false)}
                onTouchStart={() => setShowOriginal(true)}
                onTouchEnd={() => setShowOriginal(false)}
              >
                <img
                  src={showOriginal ? originalImage! : resultImage!}
                  alt="Result"
                  className="w-full h-auto transition-opacity duration-300"
                />
                <div className="absolute top-8 right-8 bg-black/60 backdrop-blur-xl border border-white/10 px-5 py-2 rounded-full text-[10px] text-white uppercase tracking-widest font-bold z-20">
                  {showOriginal ? t.originalPhoto : t.resultTitle}
                </div>

                {!showOriginal && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-8">
                    <span className="text-xs text-gold/80 italic font-medium bg-black/40 px-6 py-3 rounded-full backdrop-blur-md border border-gold/20">
                      {t.showOriginal}
                    </span>
                  </div>
                )}
              </div>

              <button
                className="lg:hidden px-8 py-3 bg-white/5 border border-white/10 rounded-full text-[10px] text-slate-400 uppercase tracking-widest font-bold active:bg-gold active:text-black transition-colors"
                onPointerDown={() => setShowOriginal(true)}
                onPointerUp={() => setShowOriginal(false)}
              >
                {t.showOriginal}
              </button>
            </div>

            <div className="w-full max-w-3xl space-y-8">
              <div className="bg-white/5 backdrop-blur-2xl p-8 md:p-10 rounded-[2.5rem] border border-white/10 space-y-8 shadow-2xl">
                <div className="flex items-center justify-between">
                  <label className="text-gold text-[10px] font-bold uppercase tracking-[0.4em]">{t.refineTitle}</label>
                  <ICONS.Magic />
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                  <input
                    type="text"
                    value={correctionRequest}
                    onChange={(e) => setCorrectionRequest(e.target.value)}
                    placeholder={t.refinePlaceholder}
                    className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-white focus:border-gold outline-none transition-all placeholder:text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={handleRefine}
                    disabled={!correctionRequest || processing.isProcessing}
                    className="px-10 bg-gold text-black rounded-2xl font-black hover:bg-white transition-all disabled:opacity-20 shadow-xl active:scale-95"
                  >
                    {t.refineBtn}
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href={resultImage!}
                  download="profile-studio-portrait.png"
                  className="flex-2 py-6 bg-white text-black rounded-[2rem] font-black text-lg flex items-center justify-center gap-4 hover:scale-[1.02] transition-all shadow-xl active:scale-95 px-12"
                >
                  <ICONS.Download /> DOWNLOAD 8K
                </a>
                <button
                  type="button"
                  onClick={() => setStep(AppStep.CHOOSE_STYLE)}
                  className="flex-1 py-6 bg-white/5 border border-white/20 text-white rounded-[2rem] font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-3 active:scale-95"
                >
                  <ICONS.Rotate /> {t.backToStyles}
                </button>
              </div>
            </div>

            <button type="button" onClick={() => setStep(AppStep.UPLOAD)} className="text-slate-600 hover:text-gold text-[10px] uppercase tracking-[0.5em] font-bold pb-10 transition-colors">NEW SESSION</button>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen pb-24 bg-dark font-sans selection:bg-gold selection:text-black scroll-smooth">
      <Header
        onKeyClick={handleKeySetup}
        language={language}
        credits={credits}
        onBuyCredits={() => {
          alert('💳 Redirecting to Stripe Checkout payment page...\n\n(Mock mode: added 10 credits)');
          setCredits(prev => prev + 10);
        }}
      />
      <main className="container mx-auto px-6 pt-8 relative z-10">
        {renderContent()}
      </main>

      {processing.isProcessing && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-3xl z-[100] flex items-center justify-center animate-in fade-in duration-500">
          <div className="text-center space-y-12 p-10">
            <div className="relative w-32 h-32 mx-auto">
              <div className="absolute inset-0 border-[4px] border-gold/10 rounded-full"></div>
              <div className="absolute inset-0 border-[4px] border-gold border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-gold scale-[1.5]"><ICONS.Magic /></div>
            </div>
            <div className="space-y-6">
              <h2 className="text-3xl md:text-4xl font-serif text-white italic tracking-wide animate-pulse">{processing.status}</h2>
              <div className="flex flex-col items-center gap-2">
                <p className="text-gold/60 text-[10px] uppercase tracking-[0.5em] font-bold">Neural Engine Processing</p>
                <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-gold animate-[loading_30s_linear]"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes loading {
          from { width: 0%; }
          to { width: 100%; }
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default App;

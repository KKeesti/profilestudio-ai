
import React, { useState, useEffect, useRef } from 'react';
import { AppStep, ProcessingState, PhotoStyle, AspectRatio, Language } from './types';
import Header from './components/Header';
import EmailModal from './components/EmailModal';
import PaymentModal from './components/PaymentModal';
import { GeminiService } from './services/geminiService';
import { ICONS } from './constants';
import { TRANSLATIONS } from './translations';

const App: React.FC = () => {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('ps_language');
    return saved && Object.values(Language).includes(saved as Language) ? saved as Language : Language.EN;
  });
  const [step, setStep] = useState<AppStep>(() => {
    return localStorage.getItem('ps_consent') === 'true' ? AppStep.UPLOAD : AppStep.LANGUAGE_SELECT;
  });
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [selectedStyle, setSelectedStyle] = useState<PhotoStyle | null>(PhotoStyle.CLASSIC_STUDIO);
  const [customPrompt, setCustomPrompt] = useState('');
  const [correctionRequest, setCorrectionRequest] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const [isConsentChecked, setIsConsentChecked] = useState(() => localStorage.getItem('ps_consent') === 'true');
  const [hasGallery, setHasGallery] = useState(false);
  const [showEmailModalForGenerate, setShowEmailModalForGenerate] = useState(false);

  const [credits, setCredits] = useState<number>(() => {
    const saved = localStorage.getItem('ps_credits');
    const val = saved ? parseInt(saved, 10) : null;
    // Only use saved value if email is also saved — otherwise 0
    const hasEmail = !!localStorage.getItem('ps_email');
    return (hasEmail && val !== null && !isNaN(val)) ? val : 0;
  });
  const [userEmail, setUserEmail] = useState<string | null>(localStorage.getItem('ps_email'));
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [historyItems, setHistoryItems] = useState<Array<{
    id: string;
    created_at: string;
    style_name: string;
    aspect_ratio: string;
    generated_image_url: string;
  }>>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [processing, setProcessing] = useState<ProcessingState>({
    isProcessing: false,
    status: '',
  });
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'cancel' | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const refreshCredits = async () => {
      const email = localStorage.getItem('ps_email');
      console.log('[Sync] Refreshing credits for:', email);
      if (email) {
        try {
          const userData = await GeminiService.checkUser(email);
          console.log('[Sync] Server returned credits:', userData.credits);
          setCredits(userData.credits);
          setHasGallery(userData.hasPaid || false);
        } catch (e) {
          console.error("[Sync] Failed to refresh credits:", e);
        }
      }
    };

    refreshCredits();

    // Check URL for payment status
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      setPaymentStatus('success');
      // Очищаем URL от параметров
      window.history.replaceState({}, '', window.location.pathname);
      // Обновляем баланс (может занять пару секунд из-за webhook)
      setTimeout(refreshCredits, 2000);
    } else if (params.get('payment') === 'cancel') {
      setPaymentStatus('cancel');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Загружаем историю при переходе на соответствующий экран
  useEffect(() => {
    if (step !== AppStep.HISTORY || !userEmail) return;
    setLoadingHistory(true);
    GeminiService.getHistory(userEmail)
      .then(items => setHistoryItems(items))
      .catch(err => console.error('Failed to load history:', err))
      .finally(() => setLoadingHistory(false));
  }, [step, userEmail]);

  useEffect(() => {
    if (userEmail) {
      localStorage.setItem('ps_credits', credits.toString());
    }
  }, [credits, userEmail]);

  useEffect(() => {
    localStorage.setItem('ps_language', language);
  }, [language]);

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

  const handleGenerate = async (style: PhotoStyle, emailOverride?: string) => {
    console.log('--- handleGenerate started ---');
    if (!originalImage) {
      console.log('No original image found - aborting');
      return;
    }
    
    const activeEmail = emailOverride || userEmail;
    console.log('Active email:', activeEmail);
    
    // Prompt for email ONLY WHEN generating!
    if (!activeEmail) {
      console.log('No active email, showing email modal');
      setShowEmailModalForGenerate(true);
      return;
    }

    let currentCredits = Number(credits);
    console.log('Generate clicked. activeEmail:', activeEmail, 'local credits:', currentCredits);

    // Refresh user explicitly before deducting locally
    try {
      console.log('Fetching user data...');
      const userData = await GeminiService.checkUser(activeEmail);
      console.log('Fetched user data:', userData);
      currentCredits = userData.credits;
      setCredits(userData.credits);
      setHasGallery(userData.hasPaid || false);
      
      if (activeEmail !== userEmail) {
        setUserEmail(activeEmail);
        localStorage.setItem('ps_email', activeEmail);
      }
    } catch (e: any) {
      console.error('Failed to sync user before generation', e);
      alert('Network error syncing user: ' + e.message);
      return;
    }

    console.log('Credits after sync:', currentCredits);
    if (currentCredits <= 0) {
      console.log('User out of credits, showing payment modal');
      setShowPaymentModal(true);
      return;
    }

    console.log('Starting processing state');
    const t = TRANSLATIONS[language];

    const statusMap = {
      [PhotoStyle.CLASSIC_STUDIO]: t.processingClassic,
      [PhotoStyle.FASHION_EDITORIAL]: t.processingFashion,
      [PhotoStyle.BUSINESS_LUXE]: t.processingBusiness,
    };

    setProcessing({ isProcessing: true, status: statusMap[style] });

    try {
      const base64Data = originalImage.split(',')[1];
      const mimeType = originalImage.split(';')[0].split(':')[1];
      const res = await GeminiService.generateStudioPhoto(base64Data, mimeType, style, aspectRatio, customPrompt, activeEmail);
      setResultImage(res);
      setStep(AppStep.RESULT);

      setCredits(prev => Math.max(0, prev - 1));
      
    } catch (error: any) {
      console.error("Generation error:", error);
      if (error.message === 'OUT_OF_CREDITS') {
        setShowPaymentModal(true);
      } else {
        alert("Generation error: " + error.message);
      }
    } finally {
      setProcessing({ isProcessing: false, status: '' });
    }
  };

  const handleRefine = async () => {
    if (!resultImage || !correctionRequest || !userEmail) return;

    setProcessing({ isProcessing: true, status: language === Language.RU ? 'Применяем правки...' : 'Refining...' });

    try {
      const res = await GeminiService.refinePhoto(resultImage, correctionRequest, userEmail);
      setResultImage(res);
      setCorrectionRequest('');
      setCredits(prev => Math.max(0, prev - 1));
    } catch (error: any) {
      if (error.message === 'OUT_OF_CREDITS') {
        setShowPaymentModal(true);
      } else {
        alert("Refinement error: " + error.message);
      }
    } finally {
      setProcessing({ isProcessing: false, status: '' });
    }
  };

  const downloadDataUrl = (dataUrl: string, filename: string) => {
    try {
      const [header, base64Content] = dataUrl.split(',');
      if (!base64Content) throw new Error('Invalid image data');
      const mime = header.match(/^data:(.*?);base64$/)?.[1] || 'image/jpeg';
      const byteCharacters = atob(base64Content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1500);
    } catch (e) {
      console.error("Download failed:", e);
      const opened = window.open(dataUrl, '_blank', 'noopener,noreferrer');
      if (!opened) {
        window.location.href = dataUrl;
      }
    }
  };

  const handleDownload = () => {
    if (!resultImage) return;
    downloadDataUrl(resultImage, 'profile-studio-ai-portrait.jpg');
  };

  const addTag = (tag: string) => {
    setCustomPrompt(prev => prev ? `${prev}, ${tag.toLowerCase()}` : tag);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          if (userEmail) {
            setProcessing({ isProcessing: true, status: language === Language.RU ? 'Распознаем голос...' : 'Transcribing voice...' });
            try {
              const text = await GeminiService.transcribe(base64Audio, 'audio/webm', userEmail);
              if (text) {
                setCorrectionRequest(text);
                // Автоматически запускаем правку после распознавания
                setProcessing({ isProcessing: true, status: language === Language.RU ? 'Применяем правки...' : 'Refining...' });
                const res = await GeminiService.refinePhoto(resultImage!, text, userEmail);
                setResultImage(res);
                setCredits(prev => Math.max(0, prev - 1));
              }
            } catch (err: any) {
              alert(err.message === 'VOICE_PREMIUM_ONLY' 
                ? (language === Language.RU ? 'Голосовые правки доступны только после оплаты' : 'Voice corrections are only available for premium users')
                : "Transcription error: " + err.message);
            } finally {
              setProcessing({ isProcessing: false, status: '' });
            }
          }
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Microphone access denied or not supported.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
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
            
            <div className="w-full max-w-sm mx-auto flex items-start gap-4 text-left bg-black/20 p-4 rounded-2xl border border-white/5">
              <input
                type="checkbox"
                id="consentCheck"
                checked={isConsentChecked}
                onChange={(e) => {
                  setIsConsentChecked(e.target.checked);
                  if (e.target.checked) {
                    localStorage.setItem('ps_consent', 'true');
                  } else {
                    localStorage.removeItem('ps_consent');
                  }
                }}
                className="mt-1 w-5 h-5 rounded border-white/20 text-gold focus:ring-gold bg-black/50 cursor-pointer"
              />
              <label htmlFor="consentCheck" className="text-[10px] text-slate-400 leading-relaxed cursor-pointer select-none">
                {t.consentText || "I agree to the Terms of Use and"} <a href="/terms.html" target="_blank" className="text-gold hover:underline">Terms of Use</a> / <a href="/privacy-policy.html" target="_blank" className="text-gold hover:underline">{t.privacyPolicyLink || "Privacy Policy"}</a>.
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
              {[
                { id: Language.EN, label: 'English', flag: '🇺🇸' },
                { id: Language.ET, label: 'Eesti', flag: '🇪🇪' },
                { id: Language.RU, label: 'Русский', flag: '🇷🇺' },
                { id: Language.LV, label: 'Latviešu', flag: '🇱🇻' },
                { id: Language.LT, label: 'Lietuvių', flag: '🇱🇹' },
                { id: Language.FI, label: 'Suomi', flag: '🇫🇮' }
              ].map(lang => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => {
                    if (!isConsentChecked) {
                      alert("Please accept the terms and privacy policy down below first.");
                      return;
                    }
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
              className="group px-16 py-6 rounded-full font-bold text-xl transition-all flex items-center gap-3 bg-gold text-black hover:bg-white transform hover:-translate-y-1 shadow-[0_20px_50px_rgba(194,163,93,0.3)] active:scale-95"
            >
              {t.startBtn} <ICONS.Magic />
            </button>
            <div className="w-full max-w-lg mx-auto bg-white/5 p-6 rounded-3xl border border-white/10 mt-4 text-center">
              <h3 className="text-gold text-[10px] uppercase font-bold tracking-[0.4em] mb-4">{t.howItWorksTitle || 'How it works'}</h3>
              <div className="text-slate-300 text-sm leading-relaxed space-y-2">
                <p>{t.stepUpload || '1. Upload a selfie'}</p>
                <p>{t.stepChoose || '2. Choose a portrait style'}</p>
                <p>{t.stepGenerate || '3. Generate and download'}</p>
              </div>
            </div>
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
                <h2 className="text-4xl md:text-5xl font-serif text-white italic">2. {t.chooseStyle}</h2>
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
                  </div>

                  {selectedStyle && (
                    <div className="mt-4 animate-in fade-in slide-in-from-top-6 duration-500">
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

              <button type="button" onClick={() => setStep(AppStep.UPLOAD)} className="text-slate-600 hover:text-white text-[10px] uppercase tracking-[0.5em] font-bold py-4 transition-all hover:translate-x-[-4px]">← {t.backToUpload || "Back to Upload"}</button>
            </div>
          </div>
        );

      case AppStep.RESULT:
        return (
          <div className="max-w-6xl mx-auto flex flex-col items-center gap-12 lg:gap-16 animate-in fade-in zoom-in-95 duration-1000 mb-20">
            <div className="text-center space-y-4">
              <h2 className="text-5xl md:text-6xl font-serif text-white italic">{t.resultTitle}</h2>
              <div className="inline-block px-6 py-1 bg-gold/5 rounded-full border border-gold/20 text-gold text-[10px] uppercase tracking-[0.5em] font-bold">Professional AI Portrait</div>
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
                  <div className="flex-1 flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={correctionRequest}
                        onChange={(e) => setCorrectionRequest(e.target.value)}
                        placeholder={t.refinePlaceholder}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-white focus:border-gold outline-none transition-all placeholder:text-slate-700"
                      />
                    </div>
                    {hasGallery && (
                      <button
                        type="button"
                        onMouseDown={startRecording}
                        onMouseUp={stopRecording}
                        onTouchStart={startRecording}
                        onTouchEnd={stopRecording}
                        className={`w-16 flex items-center justify-center rounded-2xl border-2 transition-all ${isRecording ? 'bg-red-500/20 border-red-500 text-red-500 animate-pulse' : 'bg-gold/10 border-gold/20 text-gold hover:bg-gold hover:text-black'}`}
                        title={language === Language.RU ? 'Удерживайте для записи голоса' : 'Hold to record voice'}
                      >
                        <ICONS.Mic />
                      </button>
                    )}
                  </div>
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
                <button
                  onClick={handleDownload}
                  className="flex-2 py-6 bg-white text-black rounded-[2rem] font-black text-lg flex items-center justify-center gap-4 hover:scale-[1.02] transition-all shadow-xl active:scale-95 px-12"
                >
                  <ICONS.Download /> DOWNLOAD
                </button>
                <button
                  type="button"
                  onClick={() => setStep(AppStep.UPLOAD)}
                  className="flex-1 py-6 bg-white/5 border border-white/20 text-white rounded-[2rem] font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-3 active:scale-95"
                >
                  <ICONS.Rotate /> {t.backToUpload}
                </button>
              </div>
            </div>

            <button type="button" onClick={() => setStep(AppStep.UPLOAD)} className="text-slate-600 hover:text-gold text-[10px] uppercase tracking-[0.5em] font-bold pb-10 transition-colors">NEW SESSION</button>
          </div>
        );

      case AppStep.HISTORY:
        return (
          <div className="max-w-5xl mx-auto flex flex-col items-center gap-10 animate-in fade-in zoom-in-95 duration-1000 mb-20">
            <div className="text-center space-y-3">
              <h2 className="text-4xl md:text-5xl font-serif text-white italic">{t.historyTitle || 'My Portraits'}</h2>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">
                {userEmail ? userEmail : ''}
              </p>
            </div>

            {loadingHistory ? (
              <div className="flex flex-col items-center gap-6 py-20">
                <div className="w-16 h-16 border-4 border-gold/20 border-t-gold rounded-full animate-spin" />
                <p className="text-slate-500 text-sm uppercase tracking-widest">Loading...</p>
              </div>
            ) : historyItems.length === 0 ? (
              <div className="w-full bg-white/5 border border-white/10 rounded-3xl p-16 text-center">
                <div className="w-20 h-20 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">📸</div>
                <p className="text-slate-400 text-lg mb-8">{t.historyEmpty || "You don't have any generated portraits yet."}</p>
                <button
                  type="button"
                  onClick={() => setStep(AppStep.UPLOAD)}
                  className="px-8 py-4 bg-gold text-black rounded-full font-bold hover:bg-white transition-all transform hover:-translate-y-1 shadow-[0_10px_30px_rgba(194,163,93,0.3)] active:scale-95 inline-flex items-center gap-3"
                >
                  <ICONS.Magic /> {t.startBtn}
                </button>
              </div>
            ) : (
              <div className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {historyItems.map((item) => (
                  <div key={item.id} className="group relative rounded-[1.5rem] overflow-hidden border border-white/10 bg-black shadow-xl hover:border-gold/40 transition-all duration-500">
                    <img
                      src={item.generated_image_url}
                      alt={item.style_name}
                      className="w-full h-auto block group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4 gap-3">
                      <div>
                        <p className="text-gold text-[9px] uppercase tracking-widest font-bold">{item.style_name?.replace(/_/g, ' ')}</p>
                        <p className="text-slate-400 text-[8px]">{new Date(item.created_at).toLocaleDateString()}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          // Blob-based download — работает на iOS Safari
                          const byteString = atob(item.generated_image_url.split(',')[1]);
                          const mime = 'image/jpeg';
                          const ab = new ArrayBuffer(byteString.length);
                          const ia = new Uint8Array(ab);
                          for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                          const blob = new Blob([ab], { type: mime });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `portrait-${item.id}.jpg`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="w-full py-2.5 bg-gold text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        <ICONS.Download /> {t.download || 'Download'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button type="button" onClick={() => setStep(AppStep.UPLOAD)} className="text-slate-500 hover:text-white text-[10px] uppercase tracking-[0.5em] font-bold transition-all">← {t.backToUpload || "Back to Upload"}</button>
          </div>
        );
    }
  };

  // No blocked root. We can render main layout directly.

  return (
    <div className="min-h-screen flex flex-col pb-24 bg-dark font-sans selection:bg-gold selection:text-black scroll-smooth">
      <Header
        language={language}
        credits={credits}
        userEmail={userEmail}
        hasGallery={hasGallery}
        onViewHistory={() => setStep(AppStep.HISTORY)}
        onBuyCredits={() => setShowPaymentModal(true)}
      />
      <main className="container mx-auto px-6 pt-8 relative z-10 flex-grow">
        {renderContent()}
      </main>

      <footer className="text-center py-10 opacity-50 hover:opacity-100 transition-opacity mt-auto">
        <a href="mailto:oleg@lihtneai.ee" className="text-[10px] text-slate-500 hover:text-white uppercase tracking-widest block mb-2">{TRANSLATIONS[language]?.deleteDataMsg || 'To delete your images and data, write to oleg@lihtneai.ee'}</a>
        <a href="/privacy-policy.html" target="_blank" className="text-[10px] text-slate-500 hover:text-white uppercase tracking-widest block underline">{TRANSLATIONS[language]?.privacyPolicyLink || 'Privacy Policy'}</a>
      </footer>

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

      {showPaymentModal && (
        <PaymentModal
          language={language}
          onSelect={async (planId) => {
            if (!userEmail) return;
            const creditsToAdd = planId === 'plan_small' ? 20 : 50;
            try {
              const session = await GeminiService.createCheckoutSession(userEmail, planId, creditsToAdd);
              if (session.url) window.location.href = session.url;
            } catch (e: any) {
              alert("Payment Error: " + e.message);
            }
          }}
          onClose={() => setShowPaymentModal(false)}
        />
      )}

      {showEmailModalForGenerate && (
        <EmailModal
          language={language}
          cancellable={true}
          onClose={() => setShowEmailModalForGenerate(false)}
          onSubmit={async (email) => {
            // First we save locally to immediately display it
            setUserEmail(email);
            localStorage.setItem('ps_email', email);
            setShowEmailModalForGenerate(false);
            if (selectedStyle) {
              await handleGenerate(selectedStyle, email);
            }
          }}
        />
      )}

      {paymentStatus && (
        <div className="fixed bottom-10 left-10 z-[300] bg-gold text-black px-8 py-4 rounded-2xl font-bold shadow-2xl animate-in slide-in-from-left-10 duration-500 flex items-center gap-4">
          <span className="text-2xl">{paymentStatus === 'success' ? '✅' : '❌'}</span>
          <div>
            <div className="text-sm">
              {paymentStatus === 'success'
                ? (language === Language.RU ? 'Оплата прошла успешно!' : 'Payment successful!')
                : (language === Language.RU ? 'Оплата отменена' : 'Payment cancelled')}
            </div>
            <div className="text-[10px] opacity-70 uppercase tracking-widest">
              {paymentStatus === 'success'
                ? (language === Language.RU ? 'Кредиты скоро будут зачислены' : 'Credits will be added shortly')
                : (language === Language.RU ? 'Попробуйте еще раз' : 'Please try again')}
            </div>
          </div>
          <button onClick={() => setPaymentStatus(null)} className="ml-4 hover:scale-110 transition-transform">✕</button>
        </div>
      )}
    </div>
  );
};

export default App;

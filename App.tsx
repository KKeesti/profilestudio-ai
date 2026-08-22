
import React, { useState, useEffect, useRef } from 'react';
import { AppStep, ProcessingState, PhotoStyle, AspectRatio, Language } from './types';
import Header from './components/Header';
import EmailModal from './components/EmailModal';
import PaymentModal from './components/PaymentModal';
import { GeminiService } from './services/geminiService';
import { ICONS } from './constants';
import { TRANSLATIONS } from './translations';
import { classifyFunnelError, trackFunnel } from './services/analyticsService';

const FREE_TRIAL_LIMIT = 10;

const isRestoreEntryPoint = () => {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/+$/, '');
  return path === '/restore' || new URLSearchParams(window.location.search).get('mode') === 'restore';
};

const detectBrowserLanguage = (): Language => {
  if (typeof navigator === 'undefined') return Language.EN;
  const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];

  for (const rawLanguage of browserLanguages) {
    const base = rawLanguage.toLowerCase().split('-')[0];
    if (base === 'ru') return Language.RU;
    if (base === 'et') return Language.ET;
    if (base === 'lv') return Language.LV;
    if (base === 'lt') return Language.LT;
    if (base === 'fi') return Language.FI;
    if (base === 'en') return Language.EN;
  }

  return Language.EN;
};

const getStoredFreeGenerationsUsed = () => {
  const saved = localStorage.getItem('ps_free_generations_used');
  const parsed = saved ? parseInt(saved, 10) : 0;
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(FREE_TRIAL_LIMIT, parsed);
};

const App: React.FC = () => {
  const [isRestoreMode] = useState(isRestoreEntryPoint);
  const [language, setLanguage] = useState<Language>(() => detectBrowserLanguage());
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [selectedStyle, setSelectedStyle] = useState<PhotoStyle | null>(PhotoStyle.CLASSIC_STUDIO);
  const [customPrompt, setCustomPrompt] = useState('');
  const [correctionRequest, setCorrectionRequest] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const [isConsentChecked, setIsConsentChecked] = useState(() => localStorage.getItem('ps_consent') === 'true');
  const [showConsentHint, setShowConsentHint] = useState(false);
  const [hasGallery, setHasGallery] = useState(false);
  const [showEmailModalForGenerate, setShowEmailModalForGenerate] = useState(false);
  const [freeGenerationsUsed, setFreeGenerationsUsed] = useState(getStoredFreeGenerationsUsed);

  const [credits, setCredits] = useState<number>(0);
  const [userEmail, setUserEmail] = useState<string | null>(null);
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
  const [showAnimatePaywall, setShowAnimatePaywall] = useState(false);
  const [generationError, setGenerationError] = useState<'restricted' | 'unavailable' | null>(null);
  const [restoreDemoAfter, setRestoreDemoAfter] = useState(true);
  const [isUploadDragging, setIsUploadDragging] = useState(false);
  const [pendingUploadStyle, setPendingUploadStyle] = useState<PhotoStyle | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadCtaRef = useRef<HTMLButtonElement>(null);
  const ctaImpressionTrackedRef = useRef(false);
  const scrollDepthsTrackedRef = useRef<Set<number>>(new Set());
  const freeCreditsLeft = Math.max(0, FREE_TRIAL_LIMIT - freeGenerationsUsed);
  const premiumFeaturesEnabled = Boolean(userEmail && hasGallery);

  useEffect(() => {
    trackFunnel('page_view', { language, screen: AppStep.UPLOAD });
  }, []);

  useEffect(() => {
    const t = TRANSLATIONS[language];
    document.documentElement.lang = language;
    document.title = isRestoreMode
      ? `ShotMe.ee - ${t.restoreLandingTitle}`
      : 'ShotMe.ee - AI Photo Studio';
  }, [isRestoreMode, language]);

  useEffect(() => {
    if (step !== AppStep.UPLOAD || ctaImpressionTrackedRef.current || !uploadCtaRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      ctaImpressionTrackedRef.current = true;
      trackFunnel('cta_impression', { language, screen: AppStep.UPLOAD });
      observer.disconnect();
    }, { threshold: 0.6 });
    observer.observe(uploadCtaRef.current);
    return () => observer.disconnect();
  }, [language, step]);

  useEffect(() => {
    const thresholds = [25, 50, 75, 100] as const;
    const recordScrollDepth = () => {
      const pageHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      const reached = Math.min(100, Math.round(((window.scrollY + window.innerHeight) / pageHeight) * 100));
      thresholds.forEach((depth) => {
        if (reached >= depth && !scrollDepthsTrackedRef.current.has(depth)) {
          scrollDepthsTrackedRef.current.add(depth);
          trackFunnel('scroll_depth', { language, screen: step, depth });
        }
      });
    };
    recordScrollDepth();
    window.addEventListener('scroll', recordScrollDepth, { passive: true });
    window.addEventListener('resize', recordScrollDepth);
    return () => {
      window.removeEventListener('scroll', recordScrollDepth);
      window.removeEventListener('resize', recordScrollDepth);
    };
  }, []);

  useEffect(() => {
    trackFunnel('screen_view', { language, screen: step });
  }, [language, step]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [step]);

  useEffect(() => {
    let cancelled = false;

    const initializeSession = async () => {
      try {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const accessToken = hashParams.get('access_token');
        if (accessToken) {
          await GeminiService.establishLoginSession(accessToken);
          window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
        }

        const currentUser = await GeminiService.getCurrentUser();
        const params = new URLSearchParams(window.location.search);
        if (params.get('payment') === 'success') {
          trackFunnel('checkout_success', { language, screen: AppStep.UPLOAD });
        } else if (params.get('payment') === 'cancel') {
          trackFunnel('checkout_cancel', { language, screen: AppStep.UPLOAD });
        }

        if (!currentUser) {
          localStorage.removeItem('ps_email');
          localStorage.removeItem('ps_credits');
          if (params.get('payment') === 'cancel') setPaymentStatus('cancel');
          if (params.has('payment')) window.history.replaceState({}, '', window.location.pathname);
          return;
        }

        const userData = await GeminiService.checkUser(getStoredFreeGenerationsUsed());
        if (cancelled) return;
        setUserEmail(currentUser.email);
        localStorage.setItem('ps_email', currentUser.email);
        setCredits(userData.credits);
        setHasGallery(userData.hasPaid || false);

        if (params.get('payment') === 'success') {
          setPaymentStatus('success');
          window.history.replaceState({}, '', window.location.pathname);
          window.setTimeout(async () => {
            try {
              const refreshed = await GeminiService.checkUser(getStoredFreeGenerationsUsed());
              if (!cancelled) {
                setCredits(refreshed.credits);
                setHasGallery(refreshed.hasPaid || false);
              }
            } catch (error) {
              console.error('Failed to refresh paid credits', error);
            }
          }, 2000);
        } else if (params.get('payment') === 'cancel') {
          setPaymentStatus('cancel');
          window.history.replaceState({}, '', window.location.pathname);
        }
      } catch (error) {
        console.error('Failed to initialize secure session', error);
        localStorage.removeItem('ps_email');
        localStorage.removeItem('ps_credits');
      }
    };

    void initializeSession();
    return () => { cancelled = true; };
  }, []);

  // Загружаем историю при переходе на соответствующий экран
  useEffect(() => {
    if (step !== AppStep.HISTORY || !userEmail) return;
    setLoadingHistory(true);
    GeminiService.getHistory()
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
    localStorage.setItem('ps_free_generations_used', freeGenerationsUsed.toString());
  }, [freeGenerationsUsed]);

  const handleGenerate = async (style: PhotoStyle, sourceImage = originalImage) => {
    if (!sourceImage) return;

    const generationEntryScreen = isRestoreMode ? AppStep.UPLOAD : AppStep.CHOOSE_STYLE;
    const activeEmail = userEmail;
    const isAnonymousFreeGeneration = !activeEmail;
    let currentCredits = Number(credits);
    let canUsePremiumDetails = premiumFeaturesEnabled;

    if (isAnonymousFreeGeneration) {
      if (freeCreditsLeft <= 0) {
        trackFunnel('email_gate_opened', { language, screen: generationEntryScreen });
        setShowEmailModalForGenerate(true);
        return;
      }
    } else {
      try {
        const userData = await GeminiService.checkUser(freeGenerationsUsed);
        currentCredits = userData.credits;
        setCredits(userData.credits);
        setHasGallery(userData.hasPaid || false);
        canUsePremiumDetails = Boolean(userData.hasPaid);

      } catch (e: any) {
        alert('Network error syncing user: ' + e.message);
        return;
      }

      if (currentCredits <= 0) {
        trackFunnel('payment_opened', { language, screen: generationEntryScreen });
        setShowPaymentModal(true);
        return;
      }
    }

    const t = TRANSLATIONS[language];
    const statusMap = {
      [PhotoStyle.RESTORE_OLD_PHOTO]: t.processingRestore || 'Restoring and colorizing the old photo...',
      [PhotoStyle.CLASSIC_STUDIO]: t.processingClassic,
      [PhotoStyle.FASHION_EDITORIAL]: t.processingFashion,
      [PhotoStyle.BUSINESS_LUXE]: t.processingBusiness,
    };

    trackFunnel('generation_started', { language, screen: generationEntryScreen, style });
    setProcessing({ isProcessing: true, status: statusMap[style] });

    try {
      const base64Data = sourceImage.split(',')[1];
      const mimeType = sourceImage.split(';')[0].split(':')[1];
      const promptToSend = canUsePremiumDetails ? customPrompt : '';
      const res = await GeminiService.generateStudioPhoto(base64Data, mimeType, style, aspectRatio, promptToSend);
      setResultImage(res);
      trackFunnel('generation_succeeded', { language, screen: AppStep.RESULT, style });
      setStep(AppStep.RESULT);

      if (activeEmail) {
        setCredits(prev => Math.max(0, prev - 1));
      } else {
        setFreeGenerationsUsed(prev => Math.min(FREE_TRIAL_LIMIT, prev + 1));
      }
    } catch (error: any) {
      trackFunnel('generation_failed', { language, screen: generationEntryScreen, style, reason: classifyFunnelError(error) });
      console.error("Generation error:", error);
      if (error.message === 'OUT_OF_CREDITS') {
        setShowPaymentModal(true);
      } else {
        setGenerationError(error.message === 'IMAGE_RESTRICTED' ? 'restricted' : 'unavailable');
      }
    } finally {
      setProcessing({ isProcessing: false, status: '' });
    }
  };

  const processImageFile = (file: File) => {
    trackFunnel('photo_selected', { language, screen: step });
    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;
      setOriginalImage(imageData);
      setResultImage(null);
      setShowOriginal(false);

      const immediateStyle = isRestoreMode ? PhotoStyle.RESTORE_OLD_PHOTO : pendingUploadStyle;
      if (immediateStyle && !premiumFeaturesEnabled) {
        setSelectedStyle(immediateStyle);
        setPendingUploadStyle(null);
        trackFunnel('style_selected', { language, screen: AppStep.UPLOAD, style: immediateStyle });
        void handleGenerate(immediateStyle, imageData);
        return;
      }

      if (immediateStyle) setSelectedStyle(immediateStyle);
      setPendingUploadStyle(null);
      setStep(AppStep.CHOOSE_STYLE);
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (file) processImageFile(file);
    input.value = '';
  };

  const handleImageDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsUploadDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file?.type.startsWith('image/')) processImageFile(file);
  };

  const handleRefine = async () => {
    if (!resultImage || !correctionRequest || !userEmail || !premiumFeaturesEnabled) return;

    setProcessing({ isProcessing: true, status: language === Language.RU ? 'Применяем правки...' : 'Refining...' });

    try {
      const res = await GeminiService.refinePhoto(resultImage, correctionRequest);
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
    trackFunnel('result_downloaded', { language, screen: AppStep.RESULT, style: selectedStyle || undefined });
    downloadDataUrl(resultImage, isRestoreMode ? 'shotme-restored-photo.jpg' : 'profile-studio-ai-portrait.jpg');
  };

  const handleAnimatePhotoClick = () => {
    trackFunnel('animate_photo_clicked', {
      language,
      screen: AppStep.RESULT,
      style: selectedStyle || undefined,
    });
    setShowAnimatePaywall(true);
  };

  const addTag = (tag: string) => {
    setCustomPrompt(prev => prev ? `${prev}, ${tag.toLowerCase()}` : tag);
  };

  const startRecording = async () => {
    if (isRecording || processing.isProcessing || !premiumFeaturesEnabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recordingStreamRef.current = stream;
      audioChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const duration = Date.now() - recordingStartedAtRef.current;
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        stream.getTracks().forEach(track => track.stop());
        recordingStreamRef.current = null;

        if (duration < 500 || audioBlob.size < 512) {
          alert(language === Language.RU ? 'Скажите фразу чуть дольше и удерживайте кнопку записи.' : 'Hold the voice button a little longer and say the correction again.');
          return;
        }

        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          if (userEmail) {
            setProcessing({ isProcessing: true, status: language === Language.RU ? 'Распознаем голос...' : 'Transcribing voice...' });
            try {
              const text = await GeminiService.transcribe(base64Audio, mimeType);
              if (text) {
                setCorrectionRequest(text);
                // Автоматически запускаем правку после распознавания
                setProcessing({ isProcessing: true, status: language === Language.RU ? 'Применяем правки...' : 'Refining...' });
                const res = await GeminiService.refinePhoto(resultImage!, text);
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
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Microphone access denied or not supported.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    recordingStreamRef.current?.getTracks().forEach(track => track.stop());
    setIsRecording(false);
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
            
            <div
              className={`relative w-full max-w-lg mx-auto flex items-start gap-4 text-left p-5 sm:p-6 rounded-[1.75rem] border transition-all duration-300 ${showConsentHint ? 'bg-red-500/10 border-red-400/80 shadow-[0_0_0_3px_rgba(248,113,113,0.22),0_0_34px_rgba(248,113,113,0.24)] animate-pulse' : 'bg-black/25 border-white/10'}`}
            >
              {showConsentHint && (
                <div className="absolute -top-4 left-6 rounded-full bg-red-500 px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-white shadow-lg">
                  {t.consentHint || 'Tick this box to continue'}
                </div>
              )}
              <input
                type="checkbox"
                id="consentCheck"
                checked={isConsentChecked}
                aria-invalid={showConsentHint && !isConsentChecked}
                aria-describedby={showConsentHint ? 'consentHint' : undefined}
                onChange={(e) => {
                  setIsConsentChecked(e.target.checked);
                  if (e.target.checked) {
                    setShowConsentHint(false);
                    localStorage.setItem('ps_consent', 'true');
                  } else {
                    localStorage.removeItem('ps_consent');
                  }
                }}
                className={`mt-1 h-8 w-8 shrink-0 rounded-lg border-2 bg-black/70 accent-[#c2a35d] cursor-pointer transition-all focus:outline-none focus:ring-4 ${showConsentHint ? 'border-red-400 ring-4 ring-red-400/30' : 'border-white/50 focus:ring-gold/35'}`}
              />
              <div className="space-y-2">
                <label htmlFor="consentCheck" className="block text-sm sm:text-[13px] text-slate-300 leading-6 cursor-pointer select-none">
                  {t.consentText || "I agree to the Terms of Use and"} <a href="/terms.html" target="_blank" className="text-gold hover:underline">Terms of Use</a> / <a href="/privacy-policy.html" target="_blank" className="text-gold hover:underline">{t.privacyPolicyLink || "Privacy Policy"}</a>.
                </label>
                {showConsentHint && !isConsentChecked && (
                  <p id="consentHint" className="text-sm font-bold text-red-200">
                    {t.consentHint || 'Tick this box to continue'}
                  </p>
                )}
              </div>
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
                      setShowConsentHint(true);
                      window.setTimeout(() => document.getElementById('consentCheck')?.focus(), 0);
                      return;
                    }
                    setShowConsentHint(false);
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
          <div className="mx-auto w-full max-w-[1200px] animate-in fade-in duration-500">
            <section className="overflow-hidden rounded-lg bg-lab-ink text-white">
              <div className="grid lg:min-h-[620px] lg:grid-cols-[0.9fr_1.1fr]">
                <div className="order-2 flex flex-col justify-center px-4 py-4 min-[360px]:px-6 min-[360px]:py-8 sm:px-10 lg:order-none lg:px-14 lg:py-16">
                  <h1 className="max-w-xl text-[28px] font-extrabold leading-[1.04] tracking-[-0.03em] min-[360px]:text-4xl sm:text-5xl lg:text-6xl">
                    {isRestoreMode ? t.restoreLandingTitle : (t.homeHeroTitle || t.uploadTitle)}
                  </h1>
                  <p className="mt-3 max-w-xl text-[15px] leading-6 text-[#d8ece6] max-[359px]:hidden min-[360px]:mt-5 min-[360px]:text-base min-[360px]:leading-7 sm:text-lg">
                    {isRestoreMode ? t.restoreLandingDesc : (t.homeHeroDesc || t.uploadDesc)}
                  </p>

                  <button
                    ref={uploadCtaRef}
                    type="button"
                    onClick={() => {
                      setPendingUploadStyle(isRestoreMode ? PhotoStyle.RESTORE_OLD_PHOTO : null);
                      trackFunnel('upload_cta_clicked', { language, screen: AppStep.UPLOAD });
                      fileInputRef.current?.click();
                    }}
                    onDragEnter={(event) => { event.preventDefault(); setIsUploadDragging(true); }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={() => setIsUploadDragging(false)}
                    onDrop={handleImageDrop}
                    className={`mt-4 flex min-h-14 w-full max-w-md items-center justify-center gap-3 rounded-md px-4 py-3 text-base font-extrabold text-white shadow-[0_16px_36px_rgba(0,0,0,0.24)] transition-colors active:translate-y-px min-[360px]:mt-7 min-[360px]:min-h-16 min-[360px]:px-5 min-[360px]:py-4 sm:text-lg ${isUploadDragging ? 'bg-white text-lab-ink' : 'bg-lab-coral hover:bg-white hover:text-lab-ink'}`}
                  >
                    <ICONS.Camera /> {isRestoreMode ? t.restoreLandingCta : t.startBtn}
                  </button>
                  <p className="mt-2 text-xs font-semibold leading-5 text-[#d8ece6] min-[360px]:mt-3 min-[360px]:text-sm">
                    {isRestoreMode ? t.restoreLandingFree : t.freeNoSignup}
                  </p>
                </div>

                <figure className="order-1 grid h-24 grid-cols-2 overflow-hidden bg-[#0c201d] min-[360px]:h-40 lg:hidden">
                  <div className="relative overflow-hidden border-r border-white/40">
                    <img src="/demo/restoration-before.webp" alt={t.demoBefore} className="h-full w-full object-cover object-top" />
                    <span className="absolute bottom-2 left-2 rounded bg-lab-ink px-2 py-1 text-xs font-bold text-white">{t.demoBefore}</span>
                  </div>
                  <div className="relative overflow-hidden">
                    <img src="/demo/restoration-after.webp" alt={t.demoAfter} className="h-full w-full object-cover object-top" />
                    <span className="absolute bottom-2 left-2 rounded bg-lab-teal px-2 py-1 text-xs font-bold text-white">{t.demoAfter}</span>
                  </div>
                </figure>

                <figure className="relative hidden min-h-[360px] overflow-hidden bg-[#0c201d] lg:block lg:min-h-full">
                  <img
                    src={restoreDemoAfter ? '/demo/restoration-after.webp' : '/demo/restoration-before.webp'}
                    alt={restoreDemoAfter ? t.demoAfter : t.demoBefore}
                    className="absolute inset-0 h-full w-full object-cover object-top"
                  />
                  <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3">
                    <div className="grid grid-cols-2 rounded-md bg-white p-1 shadow-[0_10px_26px_rgba(0,0,0,0.24)]" role="group" aria-label={`${t.demoBefore} / ${t.demoAfter}`}>
                      <button
                        type="button"
                        onClick={() => setRestoreDemoAfter(false)}
                        aria-pressed={!restoreDemoAfter}
                        className={`min-h-10 rounded px-4 text-sm font-bold ${!restoreDemoAfter ? 'bg-lab-ink text-white' : 'text-lab-ink hover:bg-lab-mist'}`}
                      >
                        {t.demoBefore}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRestoreDemoAfter(true)}
                        aria-pressed={restoreDemoAfter}
                        className={`min-h-10 rounded px-4 text-sm font-bold ${restoreDemoAfter ? 'bg-lab-teal text-white' : 'text-lab-ink hover:bg-lab-mist'}`}
                      >
                        {t.demoAfter}
                      </button>
                    </div>
                    <a href="https://commons.wikimedia.org/wiki/File:Portrait_of_woman,_1940.jpg" target="_blank" rel="noreferrer" className="rounded bg-white px-3 py-2 text-xs font-semibold text-lab-ink underline underline-offset-2">
                      {t.demoSource}
                    </a>
                  </div>
                </figure>
              </div>
            </section>

            <div className="grid border-x border-b border-lab-line bg-white sm:grid-cols-3">
              {[t.restoreTrustFace, t.restoreTrustOriginal, t.restoreTrustPreview].map((promise, index) => (
                <div key={promise} className={`flex min-h-20 items-center gap-3 px-5 py-4 text-sm font-semibold leading-5 text-lab-ink ${index > 0 ? 'border-t border-lab-line sm:border-l sm:border-t-0' : ''}`}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lab-teal text-sm font-extrabold text-white" aria-hidden="true">✓</span>
                  <span>{promise}</span>
                </div>
              ))}
            </div>

            {!isRestoreMode && (
              <section className="py-12 sm:py-16">
                <div className="mb-7 max-w-2xl">
                  <h2 className="text-3xl font-extrabold tracking-[-0.03em] text-lab-ink sm:text-4xl">{t.chooseStyle}</h2>
                  <p className="mt-3 text-base leading-7 text-lab-ink/70">{t.modeStartHint || t.howItWorks}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { id: PhotoStyle.RESTORE_OLD_PHOTO, icon: <ICONS.Restore />, title: t.restoreOldPhoto, desc: t.restoreOldPhotoDesc, tone: 'bg-lab-teal text-white' },
                    { id: PhotoStyle.CLASSIC_STUDIO, icon: <ICONS.Studio />, title: t.classicStudio, desc: t.classicStudioDesc, tone: 'bg-white text-lab-ink' },
                    { id: PhotoStyle.FASHION_EDITORIAL, icon: <ICONS.Fashion />, title: t.fashionEditorial, desc: t.fashionEditorialDesc, tone: 'bg-[#fff1ed] text-lab-ink' },
                    { id: PhotoStyle.BUSINESS_LUXE, icon: <ICONS.Luxe />, title: t.businessLuxe, desc: t.businessLuxeDesc, tone: 'bg-[#eaf0ff] text-lab-ink' },
                  ].map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => {
                        setPendingUploadStyle(style.id);
                        trackFunnel('style_selected', { language, screen: AppStep.UPLOAD, style: style.id });
                        fileInputRef.current?.click();
                      }}
                      className={`min-h-48 rounded-lg border border-lab-line p-5 text-left transition-transform hover:-translate-y-1 ${style.tone}`}
                    >
                      <span className="mb-8 flex h-11 w-11 items-center justify-center rounded-md border border-current/20">{style.icon}</span>
                      <span className="block text-lg font-extrabold">{style.title}</span>
                      <span className="mt-2 block text-sm leading-5 opacity-75">{style.desc}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        );

      case AppStep.CHOOSE_STYLE:
        return (
          <div className="mx-auto grid max-w-[1120px] items-start gap-8 py-4 font-lab animate-in slide-in-from-bottom-8 duration-500 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12 lg:py-8">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label={t.replacePhoto}
              className="group relative sticky top-28 hidden w-full cursor-pointer overflow-hidden rounded-lg border border-lab-line bg-white text-left shadow-[0_18px_48px_rgba(21,48,43,0.12)] transition-colors hover:border-lab-teal lg:block"
            >
              {originalImage && <img src={originalImage} alt={t.originalPhoto} className="h-auto max-h-[680px] w-full object-contain" />}
              <div className="pointer-events-none absolute inset-x-6 bottom-6 flex items-center justify-between gap-3">
                <span className="rounded-md bg-lab-ink px-4 py-2 text-xs font-bold text-white">{t.originalPhoto}</span>
                <span className="flex min-h-11 items-center gap-2 rounded-md bg-lab-coral px-4 py-2 text-xs font-extrabold text-white shadow-lg">
                  <ICONS.Camera /> {t.replacePhoto}
                </span>
              </div>
            </button>

            <div className="space-y-8 pb-16">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label={t.replacePhoto}
                className="group relative h-52 w-full overflow-hidden rounded-lg border border-lab-line bg-white shadow-[0_12px_32px_rgba(21,48,43,0.1)] sm:h-64 lg:hidden"
              >
                {originalImage && <img src={originalImage} alt={t.originalPhoto} className="h-full w-full object-contain" />}
                <span className="pointer-events-none absolute inset-x-3 bottom-3 flex min-h-12 items-center justify-center gap-2 rounded-md bg-lab-coral px-4 py-3 text-sm font-extrabold text-white shadow-lg">
                  <ICONS.Camera /> {t.replacePhoto}
                </span>
              </button>

              <div>
                <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-lab-ink sm:text-4xl">{t.chooseStyle}</h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-lab-ink/65">{premiumFeaturesEnabled ? t.setupShot : t.modeStartHint}</p>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold text-lab-ink">{t.aspectRatio}</label>
                <div className="grid grid-cols-2 rounded-lg border border-lab-line bg-white p-1">
                  {[
                    { id: '9:16' as AspectRatio, label: t.portrait, sub: '9:16' },
                    { id: '16:9' as AspectRatio, label: t.landscape, sub: '16:9' }
                  ].map(format => (
                    <button
                      key={format.id}
                      type="button"
                      onClick={() => setAspectRatio(format.id)}
                      className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-md px-3 py-2 transition-colors ${aspectRatio === format.id ? 'bg-lab-blue text-white' : 'text-lab-ink hover:bg-lab-mist'}`}
                    >
                      <span className="font-bold">{format.label}</span>
                      <span className="text-xs opacity-70">{format.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold text-lab-ink">{t.chooseStyleLabel}</label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { id: PhotoStyle.RESTORE_OLD_PHOTO, icon: <ICONS.Restore />, title: t.restoreOldPhoto || 'Restore Old Photo', desc: t.restoreOldPhotoDesc || 'Repair damage and colorize with period-accurate tones.' },
                    { id: PhotoStyle.CLASSIC_STUDIO, icon: <ICONS.Studio />, title: t.classicStudio, desc: t.classicStudioDesc },
                    { id: PhotoStyle.FASHION_EDITORIAL, icon: <ICONS.Fashion />, title: t.fashionEditorial, desc: t.fashionEditorialDesc },
                    { id: PhotoStyle.BUSINESS_LUXE, icon: <ICONS.Luxe />, title: t.businessLuxe, desc: t.businessLuxeDesc }
                  ].map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => {
                        setSelectedStyle(style.id);
                        trackFunnel('style_selected', { language, screen: AppStep.CHOOSE_STYLE, style: style.id });
                        if (!premiumFeaturesEnabled) {
                          void handleGenerate(style.id);
                        }
                      }}
                      disabled={processing.isProcessing}
                      className={`group flex min-h-32 items-start gap-4 rounded-lg border p-4 text-left transition-all ${selectedStyle === style.id ? 'border-lab-teal bg-lab-teal text-white shadow-[0_12px_26px_rgba(8,120,111,0.18)]' : 'border-lab-line bg-white text-lab-ink hover:-translate-y-0.5 hover:border-lab-teal'}`}
                    >
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${selectedStyle === style.id ? 'bg-white text-lab-teal' : 'bg-lab-mist text-lab-ink'}`}>{style.icon}</div>
                      <div className="min-w-0">
                        <div className="text-base font-extrabold leading-5">{style.title}</div>
                        <div className={`mt-2 text-sm leading-5 ${selectedStyle === style.id ? 'text-white/80' : 'text-lab-ink/60'}`}>{style.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {premiumFeaturesEnabled && (
                <div className="space-y-4 border-t border-lab-line pt-6">
                  <label className="text-sm font-bold text-lab-ink">{t.customPrompt}</label>
                  <div className="space-y-4">
                    {selectedStyle !== PhotoStyle.RESTORE_OLD_PHOTO && (
                      <div className="flex flex-wrap gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {QUICK_TAGS.map(tag => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => addTag(tag)}
                            className="whitespace-nowrap rounded-full border border-lab-line bg-white px-4 py-2 text-xs font-semibold text-lab-ink transition-colors hover:border-lab-teal hover:text-lab-teal"
                          >
                            + {tag}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="relative">
                      <textarea
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder={selectedStyle === PhotoStyle.RESTORE_OLD_PHOTO ? (t.restorationDetailsPlaceholder || 'Optional: approximate decade, country, uniform, or family context...') : t.customPromptPlaceholder}
                        className="h-32 w-full resize-none rounded-lg border border-lab-line bg-white p-5 text-base text-lab-ink outline-none transition-colors placeholder:text-lab-ink/40 focus:border-lab-teal md:h-36"
                      />
                    </div>
                  </div>
                </div>
              )}

              {selectedStyle && premiumFeaturesEnabled && (
                <div className="mt-4 animate-in fade-in slide-in-from-top-6 duration-500">
                  <button
                    type="button"
                    onClick={() => handleGenerate(selectedStyle)}
                    className="flex min-h-16 w-full items-center justify-center gap-4 rounded-md bg-lab-coral px-5 py-4 text-lg font-extrabold text-white shadow-[0_16px_34px_rgba(240,100,73,0.25)] transition-colors hover:bg-lab-ink"
                  >
                    <ICONS.Magic /> {selectedStyle === PhotoStyle.RESTORE_OLD_PHOTO ? (t.restorePhotoBtn || 'Restore Old Photo') : t.generateBtn}
                  </button>
                  <p className="mt-3 text-center text-sm font-semibold text-lab-ink/60">
                    {userEmail ? `${t.creditsLeft}: ${credits}` : `${t.freeCredits}: ${freeCreditsLeft}`}
                  </p>
                </div>
              )}

              <button type="button" onClick={() => setStep(AppStep.UPLOAD)} className="rounded-md px-2 py-3 text-sm font-bold text-lab-teal transition-colors hover:bg-lab-mist">← {t.backToUpload || "Back to Upload"}</button>
            </div>
          </div>
        );

      case AppStep.RESULT:
        return (
          <div className="mx-auto mb-16 flex max-w-[1120px] flex-col items-center gap-6 py-3 font-lab animate-in fade-in zoom-in-95 duration-500 sm:gap-8 sm:py-8 lg:gap-10">
            <div className="text-center">
              <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-lab-ink sm:text-5xl">{selectedStyle === PhotoStyle.RESTORE_OLD_PHOTO ? (t.restoredPhotoTitle || 'Restored Photo') : t.resultTitle}</h1>
              <p className="mt-3 hidden text-sm font-semibold text-lab-teal sm:block">{selectedStyle === PhotoStyle.RESTORE_OLD_PHOTO ? (t.restoredPhotoBadge || 'AI Photo Restoration') : t.uploadTitle}</p>
            </div>

            <div className="flex w-full flex-col items-center gap-4">
              <div
                className={`photo-arrive group relative w-full overflow-hidden rounded-lg border border-lab-line bg-white shadow-[0_20px_58px_rgba(21,48,43,0.16)] transition-all duration-500 ${aspectRatio === '9:16' ? 'max-w-md' : 'max-w-5xl'}`}
                onMouseDown={() => setShowOriginal(true)}
                onMouseUp={() => setShowOriginal(false)}
                onTouchStart={() => setShowOriginal(true)}
                onTouchEnd={() => setShowOriginal(false)}
              >
                <img
                  src={showOriginal ? originalImage! : resultImage!}
                  alt="Result"
                  className="mx-auto h-auto max-h-[420px] w-auto max-w-full object-contain transition-opacity duration-300 sm:max-h-none sm:w-full"
                />
                <div className="absolute right-3 top-3 z-20 rounded-md bg-lab-ink px-4 py-2 text-xs font-bold text-white sm:right-5 sm:top-5">
                  {showOriginal ? t.originalPhoto : (selectedStyle === PhotoStyle.RESTORE_OLD_PHOTO ? t.demoAfter : t.resultTitle)}
                </div>

                {!showOriginal && (
                  <div className="absolute inset-x-0 bottom-0 flex justify-center bg-lab-ink/70 p-4 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="rounded-md bg-white px-5 py-2 text-xs font-bold text-lab-ink">
                      {t.showOriginal}
                    </span>
                  </div>
                )}
              </div>

              <button
                className="min-h-11 rounded-md border border-lab-line bg-white px-6 py-3 text-sm font-bold text-lab-teal transition-colors active:bg-lab-teal active:text-white"
                onPointerDown={() => setShowOriginal(true)}
                onPointerUp={() => setShowOriginal(false)}
              >
                {t.showOriginal}
              </button>
            </div>

            <div className="w-full max-w-3xl space-y-5">
              {premiumFeaturesEnabled && (
                <div className="space-y-6 rounded-lg border border-lab-line bg-white p-6 shadow-[0_12px_34px_rgba(21,48,43,0.08)] sm:p-8">
                  <div className="flex items-center justify-between">
                    <label className="text-base font-extrabold text-lab-ink">{t.refineTitle}</label>
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
                          className="w-full rounded-md border border-lab-line bg-lab-paper px-5 py-4 text-lab-ink outline-none transition-colors placeholder:text-lab-ink/40 focus:border-lab-teal"
                        />
                      </div>
                      <button
                        type="button"
                        onPointerDown={startRecording}
                        onPointerUp={stopRecording}
                        onPointerCancel={stopRecording}
                        onPointerLeave={stopRecording}
                        className={`flex w-14 items-center justify-center rounded-md border transition-all ${isRecording ? 'animate-pulse border-red-500 bg-red-50 text-red-600' : 'border-lab-line bg-lab-mist text-lab-teal hover:bg-lab-teal hover:text-white'}`}
                        title={language === Language.RU ? 'Удерживайте для записи голоса' : 'Hold to record voice'}
                      >
                        <ICONS.Mic />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleRefine}
                      disabled={!correctionRequest || processing.isProcessing}
                      className="rounded-md bg-lab-teal px-8 py-4 font-extrabold text-white transition-colors hover:bg-lab-ink disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t.refineBtn}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleDownload}
                  className="flex min-h-16 flex-[2] items-center justify-center gap-3 rounded-md bg-lab-coral px-8 py-4 text-lg font-extrabold text-white shadow-[0_14px_32px_rgba(240,100,73,0.22)] transition-colors hover:bg-lab-ink"
                >
                  <ICONS.Download /> {t.download}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(AppStep.UPLOAD)}
                  className="flex min-h-16 flex-1 items-center justify-center gap-3 rounded-md border border-lab-line bg-white px-6 py-4 font-bold text-lab-ink transition-colors hover:bg-lab-mist"
                >
                  <ICONS.Rotate /> {t.backToUpload}
                </button>
              </div>

              {selectedStyle === PhotoStyle.RESTORE_OLD_PHOTO && !premiumFeaturesEnabled && (
                <button
                  type="button"
                  onClick={handleAnimatePhotoClick}
                  className="flex min-h-14 w-full max-w-md items-center justify-center gap-3 rounded-md border border-lab-blue bg-[#eaf0ff] px-6 py-4 text-base font-extrabold text-lab-blue transition-colors hover:bg-lab-blue hover:text-white"
                >
                  <span aria-hidden="true" className="text-lg">▶</span>
                  {t.animatePhoto}
                  <span className="rounded-md border border-current px-2 py-0.5 text-[9px] uppercase tracking-widest">PRO</span>
                </button>
              )}
            </div>

            <button type="button" onClick={() => setStep(AppStep.UPLOAD)} className="rounded-md px-4 py-3 text-sm font-bold text-lab-teal transition-colors hover:bg-lab-mist">{t.backToUpload}</button>
          </div>
        );

      case AppStep.HISTORY:
        return (
          <div className="mx-auto mb-16 flex max-w-5xl flex-col items-center gap-8 py-6 font-lab animate-in fade-in zoom-in-95 duration-500">
            <div className="text-center">
              <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-lab-ink sm:text-5xl">{t.historyTitle || 'My Portraits'}</h1>
              <p className="mt-3 text-sm font-semibold text-lab-ink/55">
                {userEmail ? userEmail : ''}
              </p>
            </div>

            {loadingHistory ? (
              <div className="flex flex-col items-center gap-6 py-20">
                <div className="h-14 w-14 animate-spin rounded-full border-4 border-lab-mist border-t-lab-teal" />
                <p className="text-sm font-semibold text-lab-ink/60">Loading...</p>
              </div>
            ) : historyItems.length === 0 ? (
              <div className="w-full rounded-lg border border-lab-line bg-white px-6 py-14 text-center sm:p-16">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-md bg-lab-mist text-lab-teal"><ICONS.Camera /></div>
                <p className="mb-8 text-lg text-lab-ink/70">{t.historyEmpty || "You don't have any generated portraits yet."}</p>
                <button
                  type="button"
                  onClick={() => setStep(AppStep.UPLOAD)}
                  className="inline-flex min-h-14 items-center gap-3 rounded-md bg-lab-coral px-8 py-4 font-extrabold text-white transition-colors hover:bg-lab-ink"
                >
                  <ICONS.Magic /> {t.startBtn}
                </button>
              </div>
            ) : (
              <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {historyItems.map((item) => (
                  <div key={item.id} className="group relative overflow-hidden rounded-lg border border-lab-line bg-white shadow-[0_10px_28px_rgba(21,48,43,0.08)] transition-all duration-300 hover:-translate-y-1 hover:border-lab-teal">
                    <img
                      src={item.generated_image_url}
                      alt={item.style_name}
                      className="w-full h-auto block group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-lab-ink/90 p-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      <div>
                        <p className="text-xs font-bold text-white">{item.style_name?.replace(/_/g, ' ')}</p>
                        <p className="mt-1 text-xs text-white/65">{new Date(item.created_at).toLocaleDateString()}</p>
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
                        className="flex w-full items-center justify-center gap-2 rounded-md bg-lab-coral px-3 py-2.5 text-xs font-extrabold text-white transition-colors hover:bg-white hover:text-lab-ink"
                      >
                        <ICONS.Download /> {t.download || 'Download'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button type="button" onClick={() => setStep(AppStep.UPLOAD)} className="rounded-md px-4 py-3 text-sm font-bold text-lab-teal transition-colors hover:bg-lab-mist">← {t.backToUpload || "Back to Upload"}</button>
          </div>
        );
    }
  };

  // No blocked root. We can render main layout directly.

  return (
    <div className="flex min-h-screen flex-col bg-lab-paper font-lab text-lab-ink selection:bg-lab-coral selection:text-white">
      <Header
        language={language}
        onLanguageChange={setLanguage}
        mode={isRestoreMode ? 'restore' : 'studio'}
        credits={userEmail ? credits : freeCreditsLeft}
        userEmail={userEmail}
        hasGallery={hasGallery}
        onViewHistory={() => setStep(AppStep.HISTORY)}
        onBuyCredits={() => {
          trackFunnel('payment_opened', { language, screen: step });
          setShowPaymentModal(true);
        }}
        onLogout={async () => {
          try {
            await GeminiService.logout();
          } finally {
            setUserEmail(null);
            setCredits(0);
            setHasGallery(false);
            setHistoryItems([]);
            setResultImage(null);
            setStep(AppStep.UPLOAD);
            localStorage.removeItem('ps_email');
            localStorage.removeItem('ps_credits');
          }
        }}
      />
      <input
        type="file"
        accept="image/*"
        className="hidden"
        ref={fileInputRef}
        onChange={handleImageUpload}
      />
      <main className="relative z-10 w-full flex-grow px-4 py-4 sm:px-6 sm:py-6">
        {renderContent()}
      </main>

      <footer className="mt-auto border-t border-lab-line bg-white px-4 py-8 text-center">
        <a href="mailto:oleg@lihtneai.ee" className="block text-xs leading-5 text-lab-ink/60 hover:text-lab-teal">{TRANSLATIONS[language]?.deleteDataMsg || 'To delete your images and data, write to oleg@lihtneai.ee'}</a>
        <a href="/privacy-policy.html" target="_blank" className="mt-2 block text-xs font-semibold text-lab-teal underline underline-offset-4">{TRANSLATIONS[language]?.privacyPolicyLink || 'Privacy Policy'}</a>
      </footer>

      {processing.isProcessing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-lab-paper/95 px-5 animate-in fade-in duration-300">
          <div className="w-full max-w-lg rounded-lg border border-lab-line bg-white p-7 text-center shadow-[0_24px_70px_rgba(21,48,43,0.18)] sm:p-10">
            <div className="relative mx-auto h-20 w-20">
              <div className="absolute inset-0 rounded-md bg-lab-mist"></div>
              <div className="absolute inset-0 flex items-center justify-center scale-[1.35] text-lab-teal"><ICONS.Magic /></div>
            </div>
            <div className="mt-7">
              <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-lab-ink sm:text-3xl">{processing.status}</h2>
              <p className="mt-3 text-sm text-lab-ink/60">ShotMe.ee</p>
              <div className="mx-auto mt-7 h-2 w-full max-w-sm overflow-hidden rounded-full bg-lab-mist">
                <div className="h-full origin-left rounded-full bg-lab-teal animate-[lab-progress_30s_linear]"></div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {showPaymentModal && (
        <PaymentModal
          language={language}
          onSelect={async (planId) => {
            if (!userEmail) {
              trackFunnel('email_gate_opened', { language, screen: step });
              setShowPaymentModal(false);
              setShowEmailModalForGenerate(true);
              return;
            }
            try {
              trackFunnel('checkout_started', { language, screen: step, plan: planId });
              const session = await GeminiService.createCheckoutSession(planId);
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
          initialEmail={localStorage.getItem('ps_email') || ''}
          onSubmit={async (email) => {
            try {
              await GeminiService.createDeviceSession(email, freeGenerationsUsed);
              const userData = await GeminiService.checkUser(freeGenerationsUsed);
              setUserEmail(userData.email);
              localStorage.setItem('ps_email', userData.email);
              setCredits(userData.credits);
              setHasGallery(userData.hasPaid || false);
              setShowEmailModalForGenerate(false);
              if (userData.credits <= 0) setShowPaymentModal(true);
            } catch (error) {
              if (error instanceof Error && error.message === 'EMAIL_VERIFICATION_REQUIRED') {
                await GeminiService.requestLoginLink(email);
                localStorage.setItem('ps_email', email);
                return 'LOGIN_LINK_SENT';
              }
              throw error;
            }
          }}
        />
      )}

      {generationError && (
        <div
          className="fixed inset-0 z-[330] flex items-center justify-center bg-lab-ink/75 px-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="generation-error-title"
          onClick={() => setGenerationError(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-lab-line bg-white p-7 text-center shadow-[0_24px_70px_rgba(21,48,43,0.24)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-[#fff1ed] text-xl font-black text-lab-coral"
              aria-hidden="true"
            >
              !
            </div>
            <h2 id="generation-error-title" className="mb-3 text-2xl font-extrabold text-lab-ink">
              {TRANSLATIONS[language].generationErrorTitle}
            </h2>
            <p className="mb-3 leading-relaxed text-lab-ink/70">
              {generationError === 'restricted'
                ? TRANSLATIONS[language].imageRestrictedMessage
                : TRANSLATIONS[language].generationUnavailableMessage}
            </p>
            <p className="mb-6 text-sm font-semibold text-lab-teal">
              {TRANSLATIONS[language].generationAttemptNotCharged}
            </p>
            <button
              type="button"
              onClick={() => setGenerationError(null)}
              className="min-h-12 w-full rounded-md bg-lab-coral px-5 py-3 font-extrabold text-white transition-colors hover:bg-lab-ink"
            >
              {TRANSLATIONS[language].understood}
            </button>
          </div>
        </div>
      )}

      {showAnimatePaywall && (
        <div
          className="fixed inset-0 z-[320] flex items-center justify-center bg-lab-ink/75 px-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="animate-paywall-title"
          onClick={() => setShowAnimatePaywall(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-lab-line bg-white p-7 text-center shadow-[0_24px_70px_rgba(21,48,43,0.24)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="text-5xl mb-4" aria-hidden="true">😔</div>
            <h2 id="animate-paywall-title" className="mb-3 text-2xl font-extrabold text-lab-ink">{TRANSLATIONS[language].animatePhoto}</h2>
            <p className="mb-6 leading-relaxed text-lab-ink/70">{TRANSLATIONS[language].animatePremiumOnly}</p>
            <button
              type="button"
              onClick={() => setShowAnimatePaywall(false)}
              className="min-h-12 w-full rounded-md bg-lab-coral px-5 py-3 font-extrabold text-white transition-colors hover:bg-lab-ink"
            >
              {TRANSLATIONS[language].understood}
            </button>
          </div>
        </div>
      )}

      {paymentStatus && (
        <div className="fixed bottom-5 left-4 right-4 z-[300] flex items-center gap-4 rounded-lg bg-lab-ink px-5 py-4 font-bold text-white shadow-[0_20px_50px_rgba(21,48,43,0.25)] animate-in slide-in-from-left-10 duration-500 sm:bottom-8 sm:left-8 sm:right-auto">
          <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${paymentStatus === 'success' ? 'bg-lab-teal' : 'bg-lab-coral'}`}>{paymentStatus === 'success' ? '✓' : '×'}</span>
          <div>
            <div className="text-sm">
              {paymentStatus === 'success'
                ? (language === Language.RU ? 'Оплата прошла успешно!' : 'Payment successful!')
                : (language === Language.RU ? 'Оплата отменена' : 'Payment cancelled')}
            </div>
            <div className="mt-1 text-xs opacity-70">
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

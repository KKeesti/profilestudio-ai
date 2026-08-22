
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

      if (isRestoreMode) {
        setSelectedStyle(PhotoStyle.RESTORE_OLD_PHOTO);
        trackFunnel('style_selected', { language, screen: AppStep.UPLOAD, style: PhotoStyle.RESTORE_OLD_PHOTO });
        void handleGenerate(PhotoStyle.RESTORE_OLD_PHOTO, imageData);
        return;
      }

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
        if (isRestoreMode) {
          return (
            <section className="mx-auto flex w-full max-w-3xl flex-col items-center animate-in fade-in duration-500">
              <div className="max-w-2xl text-center">
                <h2 className="text-balance font-serif text-4xl leading-[1.08] text-white sm:text-5xl lg:text-6xl">
                  {t.restoreLandingTitle}
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
                  {t.restoreLandingDesc}
                </p>
              </div>

              <button
                ref={uploadCtaRef}
                type="button"
                onClick={() => {
                  trackFunnel('upload_cta_clicked', { language, screen: AppStep.UPLOAD });
                  fileInputRef.current?.click();
                }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsUploadDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setIsUploadDragging(false)}
                onDrop={handleImageDrop}
                className={`mt-7 flex min-h-20 w-full max-w-xl flex-col items-center justify-center gap-1 rounded-2xl border px-6 py-4 text-black shadow-[0_18px_44px_rgba(194,163,93,0.28)] transition-all focus:outline-none focus:ring-4 focus:ring-gold/30 active:scale-[0.99] ${isUploadDragging ? 'border-white bg-white' : 'border-gold bg-gold hover:border-white hover:bg-white'}`}
              >
                <span className="flex items-center justify-center gap-3 text-base font-black sm:text-lg">
                  <ICONS.Camera /> {t.restoreLandingCta}
                </span>
                <span className="hidden text-xs font-semibold text-black/60 sm:block">{t.restoreDropHint}</span>
              </button>
              <p className="mt-3 text-center text-sm font-bold text-white">{t.restoreLandingFree}</p>

              <div className="mt-7 w-full max-w-xl border-y border-white/10 text-left">
                {[t.restoreTrustFace, t.restoreTrustOriginal, t.restoreTrustPreview].map((promise, index) => (
                  <div key={promise} className={`flex min-h-12 items-center gap-3 py-3 text-sm leading-5 text-slate-300 ${index > 0 ? 'border-t border-white/10' : ''}`}>
                    <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gold/70">
                      <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                    </span>
                    <span>{promise}</span>
                  </div>
                ))}
              </div>

              <figure className="mt-12 w-full max-w-xl">
                <h3 className="mb-4 text-center font-serif text-2xl text-white sm:text-3xl">{t.restoreExampleTitle}</h3>
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#111419] shadow-2xl">
                  <div className="relative aspect-[4/3] overflow-hidden bg-black">
                    <img
                      src={restoreDemoAfter ? '/demo/restoration-after.webp' : '/demo/restoration-before.webp'}
                      alt={restoreDemoAfter ? t.demoAfter : t.demoBefore}
                      className="h-full w-full object-cover object-top"
                    />
                    <span className={`absolute bottom-3 left-3 rounded-md px-3 py-1.5 text-xs font-bold uppercase ${restoreDemoAfter ? 'bg-gold text-black' : 'bg-black/80 text-white'}`}>
                      {restoreDemoAfter ? t.demoAfter : t.demoBefore}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
                    <div className="grid flex-1 grid-cols-2 rounded-xl bg-black/50 p-1" role="group" aria-label={`${t.demoBefore} / ${t.demoAfter}`}>
                      <button
                        type="button"
                        onClick={() => setRestoreDemoAfter(false)}
                        aria-pressed={!restoreDemoAfter}
                        className={`min-h-11 rounded-lg px-3 text-sm font-bold transition-colors ${!restoreDemoAfter ? 'bg-white text-black' : 'text-slate-300 hover:text-white'}`}
                      >
                        {t.demoBefore}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRestoreDemoAfter(true)}
                        aria-pressed={restoreDemoAfter}
                        className={`min-h-11 rounded-lg px-3 text-sm font-bold transition-colors ${restoreDemoAfter ? 'bg-gold text-black' : 'text-slate-300 hover:text-white'}`}
                      >
                        {t.demoAfter}
                      </button>
                    </div>
                    <a
                      href="https://commons.wikimedia.org/wiki/File:Portrait_of_woman,_1940.jpg"
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-xs text-slate-400 underline decoration-slate-600 underline-offset-4 hover:text-white"
                    >
                      {t.demoSource}
                    </a>
                  </div>
                </div>
                <figcaption className="px-2 pt-3 text-center text-xs leading-5 text-slate-400">{t.demoCaption}</figcaption>
              </figure>
            </section>
          );
        }

        return (
          <section className="max-w-2xl mx-auto flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
            <div className="text-center mb-4 sm:mb-6">
              <p className="text-gold text-[10px] uppercase font-bold tracking-[0.28em] mb-2">{t.demoEyebrow}</p>
              <h2 className="text-3xl sm:text-5xl font-serif text-white italic leading-tight">{t.uploadTitle}</h2>
              <p className="text-slate-400 text-sm sm:text-base max-w-lg mx-auto mt-2 leading-relaxed">{t.uploadDesc}</p>
            </div>

            <button
              ref={uploadCtaRef}
              type="button"
              onClick={() => {
                trackFunnel('upload_cta_clicked', { language, screen: AppStep.UPLOAD });
                fileInputRef.current?.click();
              }}
              className="group mb-3 w-full max-w-md min-h-14 rounded-2xl bg-gold px-6 py-4 text-lg font-black text-black shadow-[0_16px_40px_rgba(194,163,93,0.3)] transition-all hover:bg-white active:scale-[0.98] flex items-center justify-center gap-3"
            >
              {t.startBtn} <ICONS.Magic />
            </button>
            <p className="mb-5 text-center text-xs font-semibold text-slate-300">{t.freeNoSignup}</p>

            <figure className="w-full max-w-md">
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 shadow-2xl">
                <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-black">
                  <img src="/demo/restoration-before.webp" alt={t.demoBefore} className="h-full w-full object-cover object-top" />
                  <span className="absolute bottom-2 left-2 rounded-md bg-black/75 px-2.5 py-1 text-[10px] font-bold uppercase text-white">{t.demoBefore}</span>
                </div>
                <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-black">
                  <img src="/demo/restoration-after.webp" alt={t.demoAfter} className="h-full w-full object-cover object-top" />
                  <span className="absolute bottom-2 left-2 rounded-md bg-gold px-2.5 py-1 text-[10px] font-bold uppercase text-black">{t.demoAfter}</span>
                </div>
              </div>
              <figcaption className="flex items-start justify-between gap-3 px-1 pt-2 text-[10px] leading-relaxed text-slate-500">
                <span>{t.demoCaption}</span>
                <a
                  href="https://commons.wikimedia.org/wiki/File:Portrait_of_woman,_1940.jpg"
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 underline decoration-slate-700 underline-offset-2 hover:text-white"
                >
                  {t.demoSource}
                </a>
              </figcaption>
            </figure>
            <p className="mt-3 hidden sm:block text-center text-[11px] text-slate-600">{t.howItWorks}</p>
          </section>
        );

      case AppStep.CHOOSE_STYLE:
        return (
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-start animate-in slide-in-from-bottom-8 duration-700">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label={t.replacePhoto}
              className="group relative sticky top-10 hidden w-full cursor-pointer overflow-hidden rounded-[3rem] border border-white/10 bg-black text-left shadow-2xl transition-colors hover:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold lg:block"
            >
              {originalImage && <img src={originalImage} alt={t.originalPhoto} className="h-auto w-full opacity-75 transition-opacity duration-500 group-hover:opacity-100 group-focus:opacity-100" />}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>
              <div className="pointer-events-none absolute inset-x-6 bottom-6 flex items-center justify-between gap-3">
                <span className="rounded-full border border-gold/20 bg-black/70 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-gold backdrop-blur-md">{t.originalPhoto}</span>
                <span className="flex min-h-11 items-center gap-2 rounded-full bg-gold px-4 py-2 text-xs font-black text-black shadow-lg">
                  <ICONS.Camera /> {t.replacePhoto}
                </span>
              </div>
            </button>

            <div className="space-y-10 pb-20">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label={t.replacePhoto}
                className="group relative h-52 w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-xl focus:outline-none focus:ring-2 focus:ring-gold sm:h-64 lg:hidden"
              >
                {originalImage && <img src={originalImage} alt={t.originalPhoto} className="h-full w-full object-contain" />}
                <span className="pointer-events-none absolute inset-x-3 bottom-3 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3 text-sm font-black text-black shadow-lg">
                  <ICONS.Camera /> {t.replacePhoto}
                </span>
              </button>

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

              {premiumFeaturesEnabled && (
                <div className="space-y-6">
                  <label className="text-gold text-[10px] uppercase font-bold tracking-[0.4em]">{t.customPrompt}</label>
                  <div className="space-y-4">
                    {selectedStyle !== PhotoStyle.RESTORE_OLD_PHOTO && (
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
                    )}

                    <div className="relative">
                      <textarea
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder={selectedStyle === PhotoStyle.RESTORE_OLD_PHOTO ? (t.restorationDetailsPlaceholder || 'Optional: approximate decade, country, uniform, or family context...') : t.customPromptPlaceholder}
                        className="w-full bg-white/5 border border-white/10 rounded-[2rem] p-6 text-white focus:border-gold outline-none h-32 md:h-40 resize-none transition-all placeholder:text-slate-700 text-lg shadow-inner focus:bg-white/[0.07]"
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
                    className="w-full py-7 bg-gold text-black rounded-[2rem] font-black text-2xl flex items-center justify-center gap-5 transition-all hover:bg-white hover:scale-[1.02] shadow-[0_20px_50px_rgba(194,163,93,0.35)] active:scale-95"
                  >
                    <ICONS.Magic /> {selectedStyle === PhotoStyle.RESTORE_OLD_PHOTO ? (t.restorePhotoBtn || 'Restore Old Photo') : t.generateBtn}
                  </button>
                  <p className="text-center mt-4 text-[10px] text-slate-500 uppercase tracking-[0.35em] font-bold">
                    {userEmail ? `${t.creditsLeft}: ${credits}` : `${t.freeCredits}: ${freeCreditsLeft}`}
                  </p>
                </div>
              )}

              <button type="button" onClick={() => setStep(AppStep.UPLOAD)} className="text-slate-600 hover:text-white text-[10px] uppercase tracking-[0.5em] font-bold py-4 transition-all hover:translate-x-[-4px]">← {t.backToUpload || "Back to Upload"}</button>
            </div>
          </div>
        );

      case AppStep.RESULT:
        return (
          <div className="max-w-6xl mx-auto flex flex-col items-center gap-12 lg:gap-16 animate-in fade-in zoom-in-95 duration-1000 mb-20">
            <div className="text-center space-y-4">
              <h2 className="text-5xl md:text-6xl font-serif text-white italic">{selectedStyle === PhotoStyle.RESTORE_OLD_PHOTO ? (t.restoredPhotoTitle || 'Restored Photo') : t.resultTitle}</h2>
              <div className="inline-block px-6 py-1 bg-gold/5 rounded-full border border-gold/20 text-gold text-[10px] uppercase tracking-[0.5em] font-bold">{selectedStyle === PhotoStyle.RESTORE_OLD_PHOTO ? (t.restoredPhotoBadge || 'AI Photo Restoration') : 'Professional AI Portrait'}</div>
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
                  {showOriginal ? t.originalPhoto : (selectedStyle === PhotoStyle.RESTORE_OLD_PHOTO ? (t.restoredPhotoTitle || 'Restored Photo') : t.resultTitle)}
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
              {premiumFeaturesEnabled && (
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
                      <button
                        type="button"
                        onPointerDown={startRecording}
                        onPointerUp={stopRecording}
                        onPointerCancel={stopRecording}
                        onPointerLeave={stopRecording}
                        className={`w-16 flex items-center justify-center rounded-2xl border-2 transition-all ${isRecording ? 'bg-red-500/20 border-red-500 text-red-500 animate-pulse' : 'bg-gold/10 border-gold/20 text-gold hover:bg-gold hover:text-black'}`}
                        title={language === Language.RU ? 'Удерживайте для записи голоса' : 'Hold to record voice'}
                      >
                        <ICONS.Mic />
                      </button>
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
              )}

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

              {selectedStyle === PhotoStyle.RESTORE_OLD_PHOTO && !premiumFeaturesEnabled && (
                <button
                  type="button"
                  onClick={handleAnimatePhotoClick}
                  className="w-full max-w-md min-h-14 border border-gold/50 bg-gold/10 text-gold rounded-2xl px-6 py-4 font-black text-base flex items-center justify-center gap-3 hover:bg-gold hover:text-black transition-all active:scale-[0.98]"
                >
                  <span aria-hidden="true" className="text-lg">▶</span>
                  {t.animatePhoto}
                  <span className="rounded-md border border-current px-2 py-0.5 text-[9px] uppercase tracking-widest">PRO</span>
                </button>
              )}
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
      <main className="container mx-auto px-4 sm:px-6 pt-2 sm:pt-8 relative z-10 flex-grow">
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
          className="fixed inset-0 z-[330] flex items-center justify-center bg-black/85 backdrop-blur-md px-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="generation-error-title"
          onClick={() => setGenerationError(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111417] p-7 text-center shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-gold/50 bg-gold/10 text-xl font-black text-gold"
              aria-hidden="true"
            >
              !
            </div>
            <h2 id="generation-error-title" className="mb-3 font-serif text-2xl italic text-white">
              {TRANSLATIONS[language].generationErrorTitle}
            </h2>
            <p className="mb-3 leading-relaxed text-slate-300">
              {generationError === 'restricted'
                ? TRANSLATIONS[language].imageRestrictedMessage
                : TRANSLATIONS[language].generationUnavailableMessage}
            </p>
            <p className="mb-6 text-sm font-semibold text-gold">
              {TRANSLATIONS[language].generationAttemptNotCharged}
            </p>
            <button
              type="button"
              onClick={() => setGenerationError(null)}
              className="min-h-12 w-full rounded-xl bg-gold px-5 py-3 font-black text-black transition-colors hover:bg-white"
            >
              {TRANSLATIONS[language].understood}
            </button>
          </div>
        </div>
      )}

      {showAnimatePaywall && (
        <div
          className="fixed inset-0 z-[320] flex items-center justify-center bg-black/85 backdrop-blur-md px-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="animate-paywall-title"
          onClick={() => setShowAnimatePaywall(false)}
        >
          <div
            className="w-full max-w-sm border border-white/10 bg-[#111417] p-7 text-center shadow-2xl rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="text-5xl mb-4" aria-hidden="true">😔</div>
            <h2 id="animate-paywall-title" className="font-serif text-2xl text-white italic mb-3">{TRANSLATIONS[language].animatePhoto}</h2>
            <p className="text-slate-300 leading-relaxed mb-6">{TRANSLATIONS[language].animatePremiumOnly}</p>
            <button
              type="button"
              onClick={() => setShowAnimatePaywall(false)}
              className="w-full min-h-12 rounded-xl bg-gold px-5 py-3 font-black text-black hover:bg-white transition-colors"
            >
              {TRANSLATIONS[language].understood}
            </button>
          </div>
        </div>
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

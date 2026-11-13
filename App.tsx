
import React, { useState, useEffect, useRef } from 'react';
import { AppStep, ProcessingState, PhotoStyle, AspectRatio, Language } from './types';
import Header from './components/Header';
import EmailModal from './components/EmailModal';
import PaymentModal from './components/PaymentModal';
import LandingSections from './components/LandingSections';
import { GeminiService } from './services/geminiService';
import { ICONS } from './constants';
import { TRANSLATIONS } from './translations';
import { LANDING_CONTENT } from './landingContent';
import { classifyFunnelError, trackFunnel } from './services/analyticsService';

const FREE_TRIAL_LIMIT = 3;
const ANIMATION_CREDIT_COST = 10;
const OWNER_ACCESS_LABEL: Record<Language, string> = {
  [Language.EN]: 'Owner access',
  [Language.ET]: 'Omaniku ligipääs',
  [Language.RU]: 'Доступ владельца',
  [Language.LV]: 'Īpašnieka piekļuve',
  [Language.LT]: 'Savininko prieiga',
  [Language.FI]: 'Omistajan käyttöoikeus',
};

const MOBILE_UPLOAD_COPY: Record<Language, { camera: string; gallery: string; privacy: string }> = {
  [Language.EN]: { camera: 'Photograph the old photo', gallery: 'Choose from gallery', privacy: 'Your photo stays yours' },
  [Language.ET]: { camera: 'Pildista vana foto', gallery: 'Vali galeriist', privacy: 'Sinu foto jääb sulle' },
  [Language.RU]: { camera: 'Сфотографировать старое фото', gallery: 'Выбрать из галереи', privacy: 'Ваше фото остаётся вашим' },
  [Language.LV]: { camera: 'Nofotografēt veco foto', gallery: 'Izvēlēties no galerijas', privacy: 'Jūsu foto paliek jūsu' },
  [Language.LT]: { camera: 'Nufotografuoti seną nuotrauką', gallery: 'Pasirinkti iš galerijos', privacy: 'Jūsų nuotrauka lieka jūsų' },
  [Language.FI]: { camera: 'Kuvaa vanha valokuva', gallery: 'Valitse galleriasta', privacy: 'Kuvasi pysyy omana' },
};

const RESTORE_FOLLOW_UP: Record<Language, string> = {
  [Language.EN]: 'First restore the photo. After that, you can choose to animate it.',
  [Language.ET]: 'Esmalt taastage foto. Seejärel saate soovi korral selle elustada.',
  [Language.RU]: 'Сначала восстановите фото. Затем, если захотите, сможете его оживить.',
  [Language.LV]: 'Vispirms atjaunojiet foto. Pēc tam, ja vēlaties, varēsiet to atdzīvināt.',
  [Language.LT]: 'Pirmiausia atkurkite nuotrauką. Tada, jei norėsite, galėsite ją atgaivinti.',
  [Language.FI]: 'Entisöi kuva ensin. Sen jälkeen voit halutessasi elävöittää sen.',
};

const ANIMATION_COPY: Record<Language, { cost: string; detail: string; processing: string; result: string; download: string; permission: string }> = {
  [Language.EN]: { cost: '10 credits', detail: 'Short animated video', processing: 'Bringing your photo to life…', result: 'Your animated photo', download: 'Download video', permission: 'By continuing, you confirm that you have permission to animate everyone in this photo.' },
  [Language.ET]: { cost: '10 krediiti', detail: 'Lühike animeeritud video', processing: 'Elustame teie fotot…', result: 'Teie elustatud foto', download: 'Laadi video alla', permission: 'Jätkates kinnitate, et teil on õigus kõiki sellel fotol olevaid inimesi animeerida.' },
  [Language.RU]: { cost: '10 обработок', detail: 'Короткий оживлённый ролик', processing: 'Оживляем фотографию…', result: 'Ваше оживлённое фото', download: 'Скачать видео', permission: 'Продолжая, вы подтверждаете, что имеете право оживить всех людей на этом фото.' },
  [Language.LV]: { cost: '10 kredīti', detail: 'Īss animēts video', processing: 'Atdzīvinām jūsu foto…', result: 'Jūsu atdzīvinātais foto', download: 'Lejupielādēt video', permission: 'Turpinot, jūs apstiprināt, ka jums ir tiesības animēt visus cilvēkus šajā fotoattēlā.' },
  [Language.LT]: { cost: '10 kreditų', detail: 'Trumpas animuotas vaizdo įrašas', processing: 'Atgaiviname jūsų nuotrauką…', result: 'Jūsų atgaivinta nuotrauka', download: 'Atsisiųsti vaizdo įrašą', permission: 'Tęsdami patvirtinate, kad turite teisę animuoti visus šioje nuotraukoje esančius žmones.' },
  [Language.FI]: { cost: '10 krediittiä', detail: 'Lyhyt animoitu video', processing: 'Elävöitämme kuvaasi…', result: 'Elävöitetty kuvasi', download: 'Lataa video', permission: 'Jatkamalla vahvistat, että sinulla on oikeus animoida kaikki kuvassa olevat henkilöt.' },
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
  const [language, setLanguage] = useState<Language>(() => detectBrowserLanguage());
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [animationVideo, setAnimationVideo] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [selectedStyle, setSelectedStyle] = useState<PhotoStyle | null>(null);
  const [correctionRequest, setCorrectionRequest] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const [hasGallery, setHasGallery] = useState(false);
  const [showEmailModalForGenerate, setShowEmailModalForGenerate] = useState(false);
  const [freeGenerationsUsed, setFreeGenerationsUsed] = useState(getStoredFreeGenerationsUsed);

  const [credits, setCredits] = useState<number>(0);
  const [isOwner, setIsOwner] = useState(false);
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
  const [animationAvailable, setAnimationAvailable] = useState(false);
  const [generationError, setGenerationError] = useState<'restricted' | 'unavailable' | null>(null);
  const [isUploadDragging, setIsUploadDragging] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadCtaRef = useRef<HTMLButtonElement>(null);
  const ctaImpressionTrackedRef = useRef(false);
  const scrollDepthsTrackedRef = useRef<Set<number>>(new Set());
  const freeCreditsLeft = Math.max(0, FREE_TRIAL_LIMIT - freeGenerationsUsed);
  const premiumFeaturesEnabled = Boolean(userEmail && hasGallery);

  useEffect(() => {
    trackFunnel('page_view', { language, screen: AppStep.UPLOAD });
  }, []);

  useEffect(() => {
    GeminiService.getFeatures()
      .then(features => setAnimationAvailable(features.animationEnabled))
      .catch(() => setAnimationAvailable(false));
  }, []);

  useEffect(() => {
    const t = TRANSLATIONS[language];
    document.documentElement.lang = language;
    document.title = `ShotMe.ee - ${t.restoreLandingTitle}`;
  }, [language]);

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
          setIsOwner(false);
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
        setIsOwner(Boolean(userData.isOwner));

        if (params.get('payment') === 'success') {
          setPaymentStatus('success');
          window.history.replaceState({}, '', window.location.pathname);
          window.setTimeout(async () => {
            try {
              const refreshed = await GeminiService.checkUser(getStoredFreeGenerationsUsed());
              if (!cancelled) {
                setCredits(refreshed.credits);
                setHasGallery(refreshed.hasPaid || false);
                setIsOwner(Boolean(refreshed.isOwner));
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

  const handleGenerate = async (style: PhotoStyle, sourceImage = originalImage, generationAspect = aspectRatio) => {
    if (!sourceImage) return;

    const generationEntryScreen = AppStep.UPLOAD;
    const activeEmail = userEmail;
    const isAnonymousFreeGeneration = !activeEmail;
    let currentCredits = Number(credits);
    let accountIsOwner = isOwner;

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
        accountIsOwner = Boolean(userData.isOwner);
        setIsOwner(accountIsOwner);
      } catch (e: any) {
        alert('Network error syncing user: ' + e.message);
        return;
      }

      if (currentCredits <= 0 && !accountIsOwner) {
        trackFunnel('payment_opened', { language, screen: generationEntryScreen });
        setShowPaymentModal(true);
        return;
      }
    }

    const t = TRANSLATIONS[language];
    trackFunnel('generation_started', { language, screen: generationEntryScreen, style });
    setProcessing({ isProcessing: true, status: t.processingRestore || 'Restoring and colorizing the old photo...' });

    try {
      const base64Data = sourceImage.split(',')[1];
      const mimeType = sourceImage.split(';')[0].split(':')[1];
      const res = await GeminiService.generateStudioPhoto(base64Data, mimeType, style, generationAspect, '');
      setResultImage(res);
      trackFunnel('generation_succeeded', { language, screen: AppStep.RESULT, style });
      setStep(AppStep.RESULT);

      if (activeEmail && !accountIsOwner) {
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
      setAnimationVideo(null);
      setShowOriginal(false);

      const probe = new Image();
      probe.onload = () => {
        const detectedAspect: AspectRatio = probe.naturalWidth >= probe.naturalHeight ? '16:9' : '9:16';
        setAspectRatio(detectedAspect);
        setSelectedStyle(PhotoStyle.RESTORE_OLD_PHOTO);
        trackFunnel('style_selected', { language, screen: AppStep.UPLOAD, style: PhotoStyle.RESTORE_OLD_PHOTO });
        void handleGenerate(PhotoStyle.RESTORE_OLD_PHOTO, imageData, detectedAspect);
      };
      probe.onerror = () => {
        setSelectedStyle(PhotoStyle.RESTORE_OLD_PHOTO);
        void handleGenerate(PhotoStyle.RESTORE_OLD_PHOTO, imageData, aspectRatio);
      };
      probe.src = imageData;
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
      setAnimationVideo(null);
      setCorrectionRequest('');
      if (!isOwner) setCredits(prev => Math.max(0, prev - 1));
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
    downloadDataUrl(resultImage, 'shotme-restored-photo.jpg');
  };

  const handleAnimatePhotoClick = async () => {
    trackFunnel('animate_photo_clicked', {
      language,
      screen: AppStep.RESULT,
      style: selectedStyle || undefined,
    });
    if (!resultImage) return;
    if (!userEmail) {
      setShowEmailModalForGenerate(true);
      return;
    }
    if (credits < ANIMATION_CREDIT_COST && !isOwner) {
      setShowPaymentModal(true);
      return;
    }

    const animationCopy = ANIMATION_COPY[language];
    setProcessing({ isProcessing: true, status: animationCopy.processing });
    try {
      const base64Data = resultImage.split(',')[1];
      const mimeType = resultImage.split(';')[0].split(':')[1];
      const response = await GeminiService.animatePhoto(base64Data, mimeType, aspectRatio);
      setAnimationVideo(response.videoUrl);
      setCredits(response.credits);
    } catch (error: any) {
      if (error.message === `ANIMATION_REQUIRES_${ANIMATION_CREDIT_COST}_CREDITS`) {
        setShowPaymentModal(true);
      } else {
        alert(language === Language.RU ? 'Не удалось оживить фото. Обработки не списаны.' : 'The photo could not be animated. No credits were deducted.');
      }
    } finally {
      setProcessing({ isProcessing: false, status: '' });
    }
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
                if (!isOwner) setCredits(prev => Math.max(0, prev - 1));
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
    const landing = LANDING_CONTENT[language];
    const mobileCopy = MOBILE_UPLOAD_COPY[language];
    const openUpload = () => {
      trackFunnel('upload_cta_clicked', { language, screen: AppStep.UPLOAD, style: PhotoStyle.RESTORE_OLD_PHOTO });
      fileInputRef.current?.click();
    };
    const openCamera = () => {
      trackFunnel('upload_cta_clicked', { language, screen: AppStep.UPLOAD, style: PhotoStyle.RESTORE_OLD_PHOTO });
      cameraInputRef.current?.click();
    };

    switch (step) {
      case AppStep.UPLOAD:
        return (
          <div className="w-full overflow-hidden bg-[#faf7f0] animate-in fade-in duration-500">
            <section className="px-4 pb-8 pt-6 sm:px-6 sm:pb-14 sm:pt-12">
              <div className="mx-auto grid max-w-[1100px] items-center gap-8 lg:grid-cols-[0.94fr_1.06fr] lg:gap-16">
                <div className="mx-auto w-full max-w-xl text-center lg:mx-0 lg:text-left">
                  <p className="inline-flex items-center gap-2 rounded-full bg-[#e4efe9] px-3 py-2 text-xs font-bold text-lab-teal sm:text-sm">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>
                    {mobileCopy.privacy}
                  </p>
                  <h1 className="mt-5 text-balance text-[34px] font-extrabold leading-[1.02] tracking-[-0.035em] text-lab-ink min-[390px]:text-[42px] sm:mt-6 sm:text-6xl lg:text-[64px]">
                    {t.restoreLandingTitle}
                  </h1>
                  <p className="mx-auto mt-5 max-w-[35rem] text-[16px] leading-7 text-lab-ink/70 sm:text-lg lg:mx-0">
                    {t.restoreLandingDesc}
                  </p>
                  <p className="mx-auto mt-3 max-w-[35rem] text-sm font-semibold leading-6 text-lab-teal lg:mx-0">
                    {RESTORE_FOLLOW_UP[language]}
                  </p>

                  <div className="mx-auto mt-7 grid max-w-md gap-3 lg:mx-0">
                    <button
                      ref={uploadCtaRef}
                      type="button"
                      onClick={openCamera}
                      className="flex min-h-[68px] w-full items-center justify-center gap-3 rounded-2xl border border-[#e85d47] bg-lab-coral px-5 py-4 text-base font-extrabold text-lab-ink shadow-[0_17px_32px_rgba(241,105,79,0.28),inset_0_1px_0_rgba(255,255,255,0.62)] transition-all hover:-translate-y-0.5 hover:bg-[#f47e65] hover:shadow-[0_21px_38px_rgba(241,105,79,0.34),inset_0_1px_0_rgba(255,255,255,0.62)] active:translate-y-px sm:text-lg"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]"><ICONS.Camera /></span> {mobileCopy.camera}
                    </button>
                    <button
                      type="button"
                      onClick={openUpload}
                      onDragEnter={(event) => { event.preventDefault(); setIsUploadDragging(true); }}
                      onDragOver={(event) => event.preventDefault()}
                      onDragLeave={() => setIsUploadDragging(false)}
                      onDrop={handleImageDrop}
                      className={`flex min-h-[60px] w-full items-center justify-center gap-3 rounded-2xl border-2 px-5 py-3 text-base font-extrabold shadow-[0_10px_24px_rgba(21,48,43,0.08),inset_0_1px_0_rgba(255,255,255,0.92)] transition-all hover:-translate-y-0.5 active:translate-y-px ${isUploadDragging ? 'border-lab-teal bg-[#e4efe9] text-lab-teal' : 'border-lab-ink bg-white text-lab-ink hover:bg-lab-mist'}`}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lab-mist shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></span>
                      {mobileCopy.gallery}
                    </button>
                  </div>
                  <p className="mt-4 text-sm font-semibold text-lab-ink/65">
                    {userEmail
                      ? (isOwner ? OWNER_ACCESS_LABEL[language] : `${t.creditsLeft}: ${credits}`)
                      : freeGenerationsUsed > 0
                        ? `${t.freeCredits}: ${freeCreditsLeft}`
                        : t.restoreLandingFree}
                  </p>
                </div>

                <figure className="relative mx-auto w-full max-w-[540px] overflow-hidden rounded-2xl bg-lab-ink shadow-[0_22px_55px_rgba(21,48,43,0.18)]">
                  <div className="grid aspect-[1.06] grid-cols-2">
                    <div className="relative overflow-hidden border-r-2 border-white/85">
                      <img src="/examples/restore-family-1940-before.png" alt={t.demoBefore} className="h-full w-full object-cover object-center grayscale" />
                      <span className="absolute left-3 top-3 rounded-full bg-lab-ink/75 px-3 py-1.5 text-xs font-extrabold text-white">{t.demoBefore}</span>
                    </div>
                    <div className="relative overflow-hidden">
                      <img src="/examples/restore-family-1940-after.png" alt={t.demoAfter} className="h-full w-full object-cover object-center" />
                      <span className="absolute right-3 top-3 rounded-full bg-lab-teal px-3 py-1.5 text-xs font-extrabold text-white">{t.demoAfter}</span>
                    </div>
                  </div>
                  <div className="pointer-events-none absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-lab-line bg-white text-xl font-bold text-lab-ink shadow-lg" aria-hidden="true">‹›</div>
                </figure>
              </div>
            </section>

            <section className="border-y border-lab-line bg-white px-4 sm:px-6">
              <div className="mx-auto grid max-w-[1100px] divide-y divide-lab-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {[t.restoreTrustFace, t.restoreTrustOriginal, t.restoreTrustPreview].map((promise) => (
                  <div key={promise} className="flex min-h-16 items-center gap-3 py-4 text-sm font-semibold leading-5 text-lab-ink sm:px-6">
                    <svg className="shrink-0 text-lab-teal" width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                      <circle cx="11" cy="11" r="10" fill="currentColor" />
                      <path d="m6.8 11.2 2.7 2.6 5.7-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>{promise}</span>
                  </div>
                ))}
              </div>
            </section>

            <LandingSections
              language={language}
              animationAvailable={animationAvailable}
              onUpload={openUpload}
              onShowPricing={() => {
                trackFunnel('payment_opened', { language, screen: AppStep.UPLOAD });
                setShowPaymentModal(true);
              }}
            />
          </div>
        );

      case AppStep.RESULT:
        return (
          <div className="mx-auto mb-16 flex max-w-[1120px] flex-col items-center gap-6 py-3 font-lab animate-in fade-in zoom-in-95 duration-500 sm:gap-8 sm:py-8 lg:gap-10">
            <div className="text-center">
              <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-lab-ink sm:text-5xl">{t.restoredPhotoTitle || 'Restored Photo'}</h1>
              <p className="mt-3 hidden text-sm font-semibold text-lab-teal sm:block">{t.restoredPhotoBadge || 'AI Photo Restoration'}</p>
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
                  {showOriginal ? t.originalPhoto : t.demoAfter}
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
                onPointerCancel={() => setShowOriginal(false)}
                onPointerLeave={() => setShowOriginal(false)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') setShowOriginal(true);
                }}
                onKeyUp={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') setShowOriginal(false);
                }}
                onBlur={() => setShowOriginal(false)}
                aria-pressed={showOriginal}
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
                  className="flex min-h-16 flex-[2] items-center justify-center gap-3 rounded-md bg-lab-coral px-8 py-4 text-lg font-extrabold text-lab-ink shadow-[0_14px_32px_rgba(241,105,79,0.22)] transition-colors hover:bg-lab-ink hover:text-white"
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

              {selectedStyle === PhotoStyle.RESTORE_OLD_PHOTO && animationAvailable && (
                <div className="border-y border-lab-line py-5">
                  <button
                    type="button"
                    onClick={handleAnimatePhotoClick}
                    disabled={processing.isProcessing}
                    className="flex min-h-14 w-full items-center justify-between gap-4 rounded-md border border-lab-line bg-white px-5 py-4 text-left text-lab-teal transition-colors hover:border-lab-teal hover:bg-lab-mist disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="flex items-center gap-3 font-extrabold"><ICONS.Play /> {t.animatePhoto}</span>
                    <span className="text-right text-sm font-extrabold text-lab-ink">{isOwner ? OWNER_ACCESS_LABEL[language] : ANIMATION_COPY[language].cost}<small className="mt-0.5 block text-xs font-semibold text-lab-ink/55">{ANIMATION_COPY[language].detail}</small></span>
                  </button>
                  <p className="mt-3 text-xs leading-5 text-lab-ink/60">{ANIMATION_COPY[language].permission}</p>
                </div>
              )}

              {animationVideo && (
                <section className="space-y-4 rounded-lg border border-lab-line bg-white p-5 shadow-[0_12px_34px_rgba(21,48,43,0.08)] sm:p-6">
                  <h2 className="text-xl font-extrabold text-lab-ink">{ANIMATION_COPY[language].result}</h2>
                  <video className="w-full rounded-md bg-lab-ink" controls playsInline preload="metadata" src={animationVideo} />
                  <button
                    type="button"
                    onClick={() => downloadDataUrl(animationVideo, 'shotme-animated-photo.mp4')}
                    className="flex min-h-12 w-full items-center justify-center gap-3 rounded-md bg-lab-teal px-5 py-3 font-extrabold text-white transition-colors hover:bg-lab-ink"
                  >
                    <ICONS.Download /> {ANIMATION_COPY[language].download}
                  </button>
                </section>
              )}
            </div>

            <button type="button" onClick={() => setStep(AppStep.UPLOAD)} className="rounded-md px-4 py-3 text-sm font-bold text-lab-teal transition-colors hover:bg-lab-mist">{t.backToUpload}</button>
          </div>
        );

      case AppStep.HISTORY:
        return (
          <div className="mx-auto mb-16 flex max-w-5xl flex-col items-center gap-8 py-6 font-lab animate-in fade-in zoom-in-95 duration-500">
            <div className="text-center">
              <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-lab-ink sm:text-5xl">{t.historyTitle || 'My Restored Photos'}</h1>
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
                <p className="mb-8 text-lg text-lab-ink/70">{t.historyEmpty || "You don't have any restored photos yet."}</p>
                <button
                  type="button"
                  onClick={() => setStep(AppStep.UPLOAD)}
                  className="inline-flex min-h-14 items-center gap-3 rounded-md bg-lab-coral px-8 py-4 font-extrabold text-lab-ink transition-colors hover:bg-lab-ink hover:text-white"
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
                          a.download = `restored-photo-${item.id}.jpg`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-md bg-lab-coral px-3 py-2.5 text-xs font-extrabold text-lab-ink transition-colors hover:bg-white"
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
        credits={userEmail ? credits : freeCreditsLeft}
        isOwner={isOwner}
        showCredits={Boolean(userEmail || freeGenerationsUsed > 0)}
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
            setIsOwner(false);
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
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        ref={cameraInputRef}
        onChange={handleImageUpload}
      />
      <main className={`relative z-10 w-full flex-grow ${step === AppStep.UPLOAD ? '' : 'px-4 py-4 sm:px-6 sm:py-6'}`}>
        {renderContent()}
      </main>

      <footer className="mt-auto bg-lab-ink px-4 py-10 text-white sm:px-6">
        <div className="mx-auto grid max-w-[1200px] gap-8 md:grid-cols-[1.2fr_0.8fr_1fr]">
          <div>
            <a href="/" className="text-xl font-extrabold">ShotMe<span className="text-lab-coral">.ee</span></a>
            <p className="mt-3 text-sm font-semibold text-[#d8ece6]">LihtneAI OÜ</p>
            <p className="mt-2 max-w-sm text-xs leading-5 text-[#d8ece6]/70">{TRANSLATIONS[language]?.deleteDataMsg || 'To delete your images and data, write to oleg@lihtneai.ee'}</p>
          </div>
          <nav className="flex flex-col items-start gap-3 text-sm font-semibold text-[#d8ece6]" aria-label="Footer">
            <a href="/" className="hover:text-white">{TRANSLATIONS[language].restoreOldPhoto}</a>
            <a href="/#pricing" className="hover:text-white">{LANDING_CONTENT[language].pricingTitle}</a>
            <a href="/#faq" className="hover:text-white">FAQ</a>
          </nav>
          <div className="flex flex-col items-start gap-3 text-sm">
            <a href="mailto:oleg@lihtneai.ee" className="font-semibold text-white hover:text-lab-coral">oleg@lihtneai.ee</a>
            <a href="/terms.html" target="_blank" className="text-[#d8ece6] underline decoration-white/25 underline-offset-4 hover:text-white">Terms of Use</a>
            <a href="/privacy-policy.html" target="_blank" className="text-[#d8ece6] underline decoration-white/25 underline-offset-4 hover:text-white">{TRANSLATIONS[language]?.privacyPolicyLink || 'Privacy Policy'}</a>
          </div>
        </div>
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
          animationAvailable={animationAvailable}
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
              setIsOwner(Boolean(userData.isOwner));
              setShowEmailModalForGenerate(false);
              if (userData.credits <= 0 && !userData.isOwner) setShowPaymentModal(true);
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
              className="min-h-12 w-full rounded-md bg-lab-coral px-5 py-3 font-extrabold text-lab-ink transition-colors hover:bg-lab-ink hover:text-white"
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

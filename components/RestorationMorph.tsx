import React, { useEffect, useRef, useState } from 'react';

interface RestorationMorphProps {
  beforeLabel: string;
  afterLabel: string;
  ariaLabel: string;
  className?: string;
}

const RestorationMorph: React.FC<RestorationMorphProps> = ({
  beforeLabel,
  afterLabel,
  ariaLabel,
  className = '',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [reduceMotion, setReduceMotion] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => {
      setReduceMotion(preference.matches);
      if (preference.matches) {
        videoRef.current?.pause();
      } else {
        void videoRef.current?.play().catch(() => undefined);
      }
    };

    syncPreference();
    preference.addEventListener('change', syncPreference);
    return () => preference.removeEventListener('change', syncPreference);
  }, []);

  return (
    <figure className={`relative overflow-hidden bg-[#0c201d] ${className}`}>
      <video
        ref={videoRef}
        className="h-full w-full object-cover object-[center_35%]"
        autoPlay={!reduceMotion}
        muted
        loop
        playsInline
        controls
        preload="metadata"
        poster="/examples/restore-morph-poster.webp"
        aria-label={ariaLabel}
      >
        <source src="/examples/restore-morph.mp4" type="video/mp4" />
        <source src="/examples/restore-morph.webm" type="video/webm" />
      </video>
      <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-lab-ink/90 px-2.5 py-1.5 text-xs font-extrabold text-white">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-md bg-lab-teal px-2.5 py-1.5 text-xs font-extrabold text-white">
        {afterLabel}
      </span>
    </figure>
  );
};

export default RestorationMorph;

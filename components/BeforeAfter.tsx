import React, { useState } from 'react';

interface BeforeAfterProps {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
  ariaLabel: string;
  className?: string;
  objectPosition?: string;
  loading?: 'eager' | 'lazy';
}

const BeforeAfter: React.FC<BeforeAfterProps> = ({
  before,
  after,
  beforeLabel,
  afterLabel,
  ariaLabel,
  className = '',
  objectPosition = 'center',
  loading = 'lazy',
}) => {
  const [position, setPosition] = useState(50);

  return (
    <div className={`relative isolate overflow-hidden bg-lab-ink focus-within:ring-4 focus-within:ring-lab-coral focus-within:ring-offset-2 ${className}`}>
      <img
        src={after}
        alt={`${afterLabel}: ${ariaLabel}`}
        className="absolute inset-0 h-full w-full select-none object-cover"
        style={{ objectPosition }}
        loading={loading}
        draggable={false}
      />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img
          src={before}
          alt={`${beforeLabel}: ${ariaLabel}`}
          className="absolute inset-0 h-full w-full max-w-none select-none object-cover"
          style={{ objectPosition }}
          loading={loading}
          draggable={false}
        />
      </div>

      <span className="absolute left-3 top-3 z-10 rounded-md bg-lab-ink/90 px-2.5 py-1.5 text-xs font-extrabold text-white">
        {beforeLabel}
      </span>
      <span className="absolute right-3 top-3 z-10 rounded-md bg-lab-teal px-2.5 py-1.5 text-xs font-extrabold text-white">
        {afterLabel}
      </span>

      <div
        className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-white shadow-[0_0_0_1px_rgba(21,48,43,0.35)]"
        style={{ left: `${position}%` }}
      >
        <span className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-lab-ink shadow-[0_6px_18px_rgba(0,0,0,0.25)]">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M7.5 5.5 3 10l4.5 4.5M12.5 5.5 17 10l-4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>

      <input
        type="range"
        min="0"
        max="100"
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        aria-label={ariaLabel}
        className="absolute inset-0 z-20 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
};

export default BeforeAfter;

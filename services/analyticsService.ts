import { AppStep, Language, PhotoStyle } from '../types';

export type FunnelEvent =
  | 'page_view'
  | 'screen_view'
  | 'cta_impression'
  | 'scroll_depth'
  | 'upload_cta_clicked'
  | 'photo_selected'
  | 'style_selected'
  | 'generation_started'
  | 'generation_succeeded'
  | 'generation_failed'
  | 'result_downloaded'
  | 'animate_photo_clicked'
  | 'email_gate_opened'
  | 'payment_opened'
  | 'checkout_started'
  | 'checkout_success'
  | 'checkout_cancel';

type FunnelProperties = {
  language?: Language;
  screen?: AppStep;
  style?: PhotoStyle;
  reason?: 'credits' | 'rate_limit' | 'invalid_image' | 'network' | 'provider' | 'unknown';
  plan?: string;
  depth?: 25 | 50 | 75 | 100;
};

const STEP_NAMES: Partial<Record<AppStep, string>> = {
  [AppStep.UPLOAD]: 'upload',
  [AppStep.RESULT]: 'result',
  [AppStep.HISTORY]: 'history',
};

let inMemoryAnalyticsVisitorId: string | undefined;

function getDevice() {
  const width = window.innerWidth;
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

function getAnalyticsVisitorId() {
  if (inMemoryAnalyticsVisitorId) return inMemoryAnalyticsVisitorId;
  const key = 'shotme_analytics_visitor';
  try {
    const existing = localStorage.getItem(key);
    if (existing) inMemoryAnalyticsVisitorId = existing;
  } catch {}

  if (!inMemoryAnalyticsVisitorId) {
    inMemoryAnalyticsVisitorId = typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    try {
      localStorage.setItem(key, inMemoryAnalyticsVisitorId);
    } catch {}
  }
  return inMemoryAnalyticsVisitorId;
}

function getAttribution() {
  const key = 'shotme_attribution';
  try {
    const params = new URLSearchParams(window.location.search);
    const existing = JSON.parse(sessionStorage.getItem(key) || '{}');
    const current = Object.fromEntries(Object.entries({
      source: params.get('utm_source') || undefined,
      medium: params.get('utm_medium') || undefined,
      campaign: params.get('utm_campaign') || undefined,
      content: params.get('utm_content') || undefined,
    }).filter(([, value]) => Boolean(value)));
    const attribution = { ...existing, ...current };
    sessionStorage.setItem(key, JSON.stringify(attribution));
    return attribution;
  } catch {
    return {};
  }
}

export function classifyFunnelError(error: unknown): FunnelProperties['reason'] {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('credit') || message.includes('trial')) return 'credits';
  if (message.includes('429') || message.includes('limit') || message.includes('another generation')) return 'rate_limit';
  if (message.includes('image') || message.includes('unsupported')) return 'invalid_image';
  if (message.includes('network') || message.includes('fetch')) return 'network';
  if (message.includes('internal') || message.includes('gemini') || message.includes('provider')) return 'provider';
  return 'unknown';
}

export function trackFunnel(event: FunnelEvent, properties: FunnelProperties = {}) {
  if (typeof window === 'undefined') return;
  const payload = JSON.stringify({
    event,
    visitorId: getAnalyticsVisitorId(),
    language: properties.language,
    screen: properties.screen ? STEP_NAMES[properties.screen] : undefined,
    style: properties.style,
    reason: properties.reason,
    plan: properties.plan,
    depth: properties.depth,
    device: getDevice(),
    surface: 'restore',
    ...getAttribution(),
  });

  void fetch('/api/analytics/event', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

import { AppStep, Language, PhotoStyle } from '../types';

export type FunnelEvent =
  | 'page_view'
  | 'screen_view'
  | 'upload_cta_clicked'
  | 'photo_selected'
  | 'style_selected'
  | 'generation_started'
  | 'generation_succeeded'
  | 'generation_failed'
  | 'result_downloaded'
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
};

const STEP_NAMES: Partial<Record<AppStep, string>> = {
  [AppStep.UPLOAD]: 'upload',
  [AppStep.CHOOSE_STYLE]: 'choose_style',
  [AppStep.RESULT]: 'result',
  [AppStep.HISTORY]: 'history',
};

function getDevice() {
  const width = window.innerWidth;
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

function getAttribution() {
  const key = 'shotme_attribution';
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return JSON.parse(existing);
    const params = new URLSearchParams(window.location.search);
    const attribution = {
      source: params.get('utm_source') || undefined,
      medium: params.get('utm_medium') || undefined,
      campaign: params.get('utm_campaign') || undefined,
    };
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
    language: properties.language,
    screen: properties.screen ? STEP_NAMES[properties.screen] : undefined,
    style: properties.style,
    reason: properties.reason,
    plan: properties.plan,
    device: getDevice(),
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

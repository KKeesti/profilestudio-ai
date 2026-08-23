const ALLOWED_EVENTS = new Set([
  'page_view',
  'screen_view',
  'cta_impression',
  'scroll_depth',
  'upload_cta_clicked',
  'photo_selected',
  'style_selected',
  'generation_started',
  'generation_succeeded',
  'generation_failed',
  'result_downloaded',
  'animate_photo_clicked',
  'email_gate_opened',
  'payment_opened',
  'checkout_started',
  'checkout_success',
  'checkout_cancel',
]);

const ALLOWED_LANGUAGES = new Set(['en', 'et', 'ru', 'lv', 'lt', 'fi']);
const ALLOWED_DEVICES = new Set(['mobile', 'tablet', 'desktop']);
const ALLOWED_SCREENS = new Set(['upload', 'result', 'history']);
const ALLOWED_STYLES = new Set(['RESTORE_OLD_PHOTO']);
const ALLOWED_FAILURE_REASONS = new Set(['credits', 'rate_limit', 'invalid_image', 'network', 'provider', 'unknown']);
const ALLOWED_PLANS = new Set(['plan_small', 'plan_large']);
const ALLOWED_SURFACES = new Set(['restore']);
const ALLOWED_SCROLL_DEPTHS = new Set([25, 50, 75, 100]);

const FUNNEL_STEPS = [
  'page_view',
  'cta_impression',
  'upload_cta_clicked',
  'photo_selected',
  'style_selected',
  'generation_started',
  'generation_succeeded',
  'result_downloaded',
  'payment_opened',
  'checkout_started',
  'checkout_success',
];

function safeLabel(value, maxLength = 64) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function allowValue(value, allowed) {
  return typeof value === 'string' && allowed.has(value) ? value : undefined;
}

function normalizeAnalyticsEvent(body, context) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const name = allowValue(body.event, ALLOWED_EVENTS);
  if (!name || !context?.visitorHash) return null;

  const event = {
    name,
    visitorHash: context.visitorHash,
    authenticated: Boolean(context.authenticated),
  };
  const language = allowValue(body.language, ALLOWED_LANGUAGES);
  const device = allowValue(body.device, ALLOWED_DEVICES);
  const screen = allowValue(body.screen, ALLOWED_SCREENS);
  const style = allowValue(body.style, ALLOWED_STYLES);
  const reason = allowValue(body.reason, ALLOWED_FAILURE_REASONS);
  const plan = allowValue(body.plan, ALLOWED_PLANS);
  const surface = allowValue(body.surface, ALLOWED_SURFACES);
  const depth = ALLOWED_SCROLL_DEPTHS.has(body.depth) ? body.depth : undefined;
  const source = safeLabel(body.source);
  const medium = safeLabel(body.medium);
  const campaign = safeLabel(body.campaign);
  const content = safeLabel(body.content);

  if (language) event.language = language;
  if (device) event.device = device;
  if (screen) event.screen = screen;
  if (style) event.style = style;
  if (reason) event.reason = reason;
  if (plan) event.plan = plan;
  if (surface) event.surface = surface;
  if (depth) event.depth = depth;
  if (source) event.source = source;
  if (medium) event.medium = medium;
  if (campaign) event.campaign = campaign;
  if (content) event.content = content;
  return event;
}

function roundedPercent(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function countBy(events, field, fallback = 'unknown') {
  return events.reduce((counts, event) => {
    const key = event[field] || fallback;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function dateLabel(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function buildFunnelReport(allEvents, options = {}) {
  const timeZone = options.timeZone || 'Europe/Tallinn';
  const events = allEvents.filter(event => event.type === 'funnel_event' && ALLOWED_EVENTS.has(event.name));
  const uniqueVisitors = new Set(events.map(event => event.visitorHash).filter(Boolean));
  const visitorsByStep = Object.fromEntries(FUNNEL_STEPS.map(name => [name, new Set()]));
  const eventCounts = Object.fromEntries(FUNNEL_STEPS.map(name => [name, 0]));

  for (const event of events) {
    if (visitorsByStep[event.name] && event.visitorHash) visitorsByStep[event.name].add(event.visitorHash);
    if (Object.hasOwn(eventCounts, event.name)) eventCounts[event.name] += 1;
  }

  let previousVisitors = null;
  const funnel = FUNNEL_STEPS.map(name => {
    const visitors = visitorsByStep[name].size;
    const result = {
      step: name,
      visitors,
      events: eventCounts[name],
      conversionFromLandingPct: roundedPercent(visitors, visitorsByStep.page_view.size),
      conversionFromPreviousPct: roundedPercent(visitors, previousVisitors),
    };
    previousVisitors = visitors;
    return result;
  });

  const days = {};
  for (const event of events) {
    const day = dateLabel(event.ts, timeZone);
    days[day] ||= { date: day, visitors: new Set(), events: {} };
    if (event.visitorHash) days[day].visitors.add(event.visitorHash);
    days[day].events[event.name] = (days[day].events[event.name] || 0) + 1;
  }

  return {
    uniqueVisitors: uniqueVisitors.size,
    totalEvents: events.length,
    funnel,
    featureInterest: {
      animatePhotoClicks: events.filter(event => event.name === 'animate_photo_clicked').length,
      uniqueVisitors: new Set(
        events.filter(event => event.name === 'animate_photo_clicked').map(event => event.visitorHash).filter(Boolean),
      ).size,
    },
    failures: countBy(events.filter(event => event.name === 'generation_failed'), 'reason'),
    languages: countBy(events.filter(event => event.name === 'page_view'), 'language'),
    devices: countBy(events.filter(event => event.name === 'page_view'), 'device'),
    surfaces: countBy(events.filter(event => event.name === 'page_view'), 'surface'),
    sources: countBy(events.filter(event => event.name === 'page_view'), 'source', 'direct'),
    campaigns: countBy(events.filter(event => event.name === 'page_view'), 'campaign', 'none'),
    content: countBy(events.filter(event => event.name === 'page_view'), 'content', 'none'),
    scrollDepth: countBy(events.filter(event => event.name === 'scroll_depth'), 'depth'),
    byDay: Object.values(days)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(day => ({ date: day.date, visitors: day.visitors.size, events: day.events })),
  };
}

module.exports = {
  ALLOWED_EVENTS,
  FUNNEL_STEPS,
  buildFunnelReport,
  normalizeAnalyticsEvent,
};

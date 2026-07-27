const assert = require('node:assert/strict');
const test = require('node:test');

const { buildFunnelReport, normalizeAnalyticsEvent } = require('./analytics');

test('analytics accepts only allowlisted fields and strips unsafe attribution', () => {
  const event = normalizeAnalyticsEvent({
    event: 'generation_started',
    language: 'ru',
    device: 'mobile',
    screen: 'choose_style',
    style: 'RESTORE_OLD_PHOTO',
    source: 'instagram / summer',
    email: 'must-not-be-recorded@example.com',
  }, { visitorHash: 'visitor-1', authenticated: false });

  assert.deepEqual(event, {
    name: 'generation_started',
    visitorHash: 'visitor-1',
    authenticated: false,
    language: 'ru',
    device: 'mobile',
    screen: 'choose_style',
    style: 'RESTORE_OLD_PHOTO',
    source: 'instagram___summer',
  });
  assert.equal(normalizeAnalyticsEvent({ event: 'made_up_event' }, { visitorHash: 'visitor-1' }), null);
});

test('funnel report counts unique visitors and conversions', () => {
  const events = [
    { ts: '2026-07-14T08:00:00.000Z', type: 'funnel_event', name: 'page_view', visitorHash: 'a', language: 'ru', device: 'mobile' },
    { ts: '2026-07-14T08:01:00.000Z', type: 'funnel_event', name: 'page_view', visitorHash: 'b', language: 'en', device: 'desktop' },
    { ts: '2026-07-14T08:02:00.000Z', type: 'funnel_event', name: 'upload_cta_clicked', visitorHash: 'a' },
    { ts: '2026-07-14T08:03:00.000Z', type: 'funnel_event', name: 'generation_succeeded', visitorHash: 'a' },
    { ts: '2026-07-14T08:04:00.000Z', type: 'funnel_event', name: 'generation_failed', visitorHash: 'b', reason: 'provider' },
    { ts: '2026-07-14T08:05:00.000Z', type: 'funnel_event', name: 'animate_photo_clicked', visitorHash: 'a' },
  ];
  const report = buildFunnelReport(events, { timeZone: 'Europe/Tallinn' });

  assert.equal(report.uniqueVisitors, 2);
  assert.equal(report.funnel[0].visitors, 2);
  assert.equal(report.funnel[1].visitors, 1);
  assert.equal(report.funnel[1].conversionFromLandingPct, 50);
  assert.deepEqual(report.failures, { provider: 1 });
  assert.deepEqual(report.featureInterest, { animatePhotoClicks: 1, uniqueVisitors: 1 });
  assert.equal(report.byDay[0].visitors, 2);
});

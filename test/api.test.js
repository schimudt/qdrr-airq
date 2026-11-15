import test from 'node:test';
import assert from 'node:assert/strict';
import { request, retryDelay, latest, history, hourRecords, FEEDS } from '../src/api.js';
import { HOUR } from '../src/quality.js';

const response = (data, headers = {}) => new Response(JSON.stringify(data), { headers });
const start = Date.parse('2026-11-15T02:00:00Z');
const window = { start, end: start + HOUR };
const page = Array.from({ length: 1000 }, (_, i) => ({ created_at: new Date(window.end - (i + 1) * 1000).toISOString(), value: '12' }));

test('Retry-After accepts seconds, HTTP dates and invalid headers', () => {
  assert.equal(retryDelay('90'), 90_000);
  assert.equal(retryDelay('Sun, 15 Nov 2026 03:02:00 GMT', Date.parse('2026-11-15T03:00:00Z')), 120_000);
  assert.equal(retryDelay('bad'), 0);
});

test('HTTP 429 has a minimum cooldown and honours a longer Retry-After', async () => {
  for (const [header, expected] of [['1', 60_000], ['120', 120_000]]) {
    await assert.rejects(request('https://example.test', async () => new Response('Retry later', { status: 429, headers: { 'Retry-After': header } })),
      error => error.status === 429 && error.retryAfter === expected);
  }
});

test('public reads omit credentials and latest readings and chart history use correct endpoints', async () => {
  await latest(FEEDS.pm, async (url, options) => {
    assert.equal(new URL(url).searchParams.get('limit'), '1');
    assert.equal(options.credentials, 'omit');
    return response([{ value: '12' }]);
  });
  const records = await history(FEEDS.temperature, async url => {
    assert.ok(url.includes('/qdrr-temperature/data/chart?hours=24'));
    return response({ data: [['2026-11-15T02:00:00Z', '31']] });
  });
  assert.deepEqual(records, [{ created_at: '2026-11-15T02:00:00Z', value: '31' }]);
});

test('hour records include preceding sample window and follow cursor pagination', async () => {
  const urls = [];
  const records = await hourRecords(FEEDS.pm, window, async url => {
    urls.push(new URL(url));
    return urls.length === 1 ? response(page, { Link: '<https://io.adafruit.com/page>;rel="next", <https://io.adafruit.com/page?before=cursor123>' }) : response([{ value: '5', created_at: '2026-11-15T01:55:00Z' }]);
  });
  assert.equal(records.length, 1001);
  assert.equal(urls[0].searchParams.get('start_time'), '2026-11-15T01:50:00.000Z');
  assert.equal(urls[1].searchParams.get('before'), 'cursor123');
  assert.equal(urls[1].origin, 'https://io.adafruit.com');
});

test('pagination falls back to timestamp when CORS hides Link', async () => {
  const urls = [];
  await hourRecords(FEEDS.pm, window, async url => {
    urls.push(new URL(url));
    return response(urls.length === 1 ? page : []);
  });
  assert.equal(urls[1].searchParams.get('end_time'), page.at(-1).created_at);
});

test('a later pagination failure rejects the whole assessment', async () => {
  let calls = 0;
  await assert.rejects(hourRecords(FEEDS.pm, window, async () => {
    if (++calls === 1) return response(page);
    return new Response('failure', { status: 503 });
  }), error => error.status === 503);
});

test('malformed payloads and repeated pagination cursors fail closed', async () => {
  await assert.rejects(latest(FEEDS.pm, async () => response({})), /Invalid/);
  await assert.rejects(history(FEEDS.pm, async () => response({})), /Invalid/);
  await assert.rejects(hourRecords(FEEDS.pm, window, async () => response(page, { Link: '<https://io.adafruit.com/page?before=same>' })), /did not advance/);
});

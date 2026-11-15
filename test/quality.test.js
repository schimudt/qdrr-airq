import test from 'node:test';
import assert from 'node:assert/strict';
import { category, parseReading, normaliseRecords, rollingHour, hourlyEstimate, MINUTE, HOUR } from '../src/quality.js';

const start = Date.parse('2026-11-15T02:00:00Z');
const window = { start, end: start + HOUR };
const record = (minute, value) => ({ created_at: new Date(start + minute * MINUTE).toISOString(), value });

test('European bands include the exact boundary in the lower category', () => {
  for (const [value, expected] of [[0, 'Good'], [5, 'Good'], [5.001, 'Fair'], [15, 'Fair'], [15.1, 'Moderate'], [50, 'Moderate'], [50.01, 'Poor'], [90, 'Poor'], [90.1, 'Very poor'], [140, 'Very poor'], [140.1, 'Extremely poor']]) {
    assert.equal(category(value)?.english, expected);
  }
  for (const value of [-1, NaN, Infinity, null, '5']) assert.equal(category(value), null);
});

test('parse rejects malformed readings but accepts zero and negative temperatures', () => {
  for (const value of ['', '  ', null, undefined, 'NaN', 'Infinity', true, {}, []]) {
    assert.equal(parseReading(record(0, value)), null);
  }
  assert.equal(parseReading(record(0, -2), { pm: true }), null);
  assert.equal(parseReading(record(0, -2)).value, -2);
  assert.equal(parseReading(record(0, '0'), { pm: true }).value, 0);
  assert.equal(parseReading({ value: 12, created_at: 'invalid' }), null);
});

test('normalisation sorts, filters invalid values and deduplicates timestamps', () => {
  assert.deepEqual(normaliseRecords([record(2, 2), record(1, 1), record(2, 3), record(3, -1)], { pm: true }), [
    { time: start + MINUTE, value: 1 }, { time: start + 2 * MINUTE, value: 3 },
  ]);
});

test('rolling hour ends at the last reading, including minutes, seconds and midnight', () => {
  assert.deepEqual(rollingHour(Date.parse('2026-11-15T00:35:42+07:00')), {
    start: Date.parse('2026-11-14T23:35:42+07:00'), end: Date.parse('2026-11-15T00:35:42+07:00'),
  });
  assert.deepEqual(rollingHour(window.end), window);
  assert.throws(() => rollingHour(undefined), /timestamp/);
});

test('rolling estimate uses the sensor timestamp rather than a complete clock hour', () => {
  const latestTime = start + 65 * MINUTE;
  const records = [0, 10, 20, 30, 40, 50, 60, 65].map(minute => record(minute, minute < 30 ? 10 : 30));
  const result = hourlyEstimate(records, rollingHour(latestTime));
  assert.equal(result.start, start + 5 * MINUTE);
  assert.equal(result.end, latestTime);
  assert.equal(result.coverage, 1);
  assert.equal(result.value, (25 * 10 + 35 * 30) / 60);
});

test('hourly mean uses elapsed time rather than sample count', () => {
  const records = [record(0, 10), record(10, 10), record(20, 10), record(30, 30), record(35, 30), record(40, 30), record(50, 30)];
  const result = hourlyEstimate(records, window);
  assert.equal(result.coverage, 1);
  assert.equal(result.value, 20);
  assert.equal(result.band.english, 'Moderate');
});

test('preceding samples contribute only the remaining ten-minute hold', () => {
  const result = hourlyEstimate([record(-5, 12), record(5, 24)], window);
  assert.equal(result.coverage, 15 / 60);
  assert.equal(result.value, 20);
  assert.equal(result.band, null);
  assert.equal(hourlyEstimate([record(-11, 12)], window).coverage, 0);
});

test('75% coverage is sufficient; smaller coverage cannot produce a category', () => {
  const records = [0, 10, 20, 30, 40].map(minute => record(minute, 15));
  const sufficient = hourlyEstimate([...records, record(45, 'bad')], window);
  assert.equal(sufficient.coverage, 0.75);
  assert.equal(sufficient.band.english, 'Fair');
  assert.equal(hourlyEstimate([...records, record(44, 'bad')], window).band, null);
});

test('duplicates, end-boundary samples and empty data do not inflate coverage', () => {
  const result = hourlyEstimate([record(0, 10), record(0, 10), record(60, 999)], window);
  assert.equal(result.coverage, 1 / 6);
  assert.equal(result.value, 10);
  assert.deepEqual(hourlyEstimate([], window), { ...window, coverage: 0, value: null, band: null });
});

test('known invalid samples terminate a hold', () => {
  assert.equal(hourlyEstimate([record(0, 10), record(2, -1)], window).coverage, 2 / 60);
});

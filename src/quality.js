export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const MAX_HOLD = 10 * MINUTE;
export const MIN_COVERAGE = 0.75;
export const BANDS = [
  { max: 5, thai: 'ดี', english: 'Good', color: '#50f0e6', range: '0–5' },
  { max: 15, thai: 'พอใช้', english: 'Fair', color: '#50ccaa', range: '>5–15' },
  { max: 50, thai: 'ปานกลาง', english: 'Moderate', color: '#f0e641', range: '>15–50' },
  { max: 90, thai: 'ไม่ดี', english: 'Poor', color: '#ff5050', range: '>50–90' },
  { max: 140, thai: 'ไม่ดีมาก', english: 'Very poor', color: '#960032', range: '>90–140' },
  { max: Infinity, thai: 'ไม่ดีอย่างยิ่ง', english: 'Extremely poor', color: '#7d2181', range: '>140' },
];

export function category(value) {
  return Number.isFinite(value) && value >= 0 ? BANDS.find(band => value <= band.max) : null;
}

export function contrastText(hex) {
  const channels = hex.replace('#', '').match(/.{2}/g).map(channel => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? '#20252b' : '#ffffff';
}

export function parseReading(record, { pm = false } = {}) {
  const raw = record?.value;
  if ((typeof raw !== 'string' && typeof raw !== 'number') || String(raw).trim() === '') return null;
  const value = Number(raw);
  const time = typeof record?.created_at === 'string' ? Date.parse(record.created_at) : NaN;
  if (!Number.isFinite(value) || !Number.isFinite(time) || (pm && value < 0)) return null;
  return { value, time };
}

export function normaliseRecords(records, options) {
  const unique = new Map();
  for (const record of records) {
    const point = parseReading(record, options);
    if (point) unique.set(point.time, point);
  }
  return [...unique.values()].sort((a, b) => a.time - b.time);
}

export function rollingHour(end) {
  if (!Number.isFinite(end)) throw new Error('Expected the latest PM2.5 timestamp');
  return { start: end - HOUR, end };
}

export function hourlyEstimate(records, { start, end }) {
  if (!Number.isFinite(start) || end - start !== HOUR) throw new Error('Expected a one-hour window');
  // Invalid records still terminate the preceding value: never hold across a known bad sample.
  const events = new Map();
  for (const record of records) {
    const time = typeof record?.created_at === 'string' ? Date.parse(record.created_at) : NaN;
    if (Number.isFinite(time)) events.set(time, { time, point: parseReading(record, { pm: true }) });
  }
  const sorted = [...events.values()].sort((a, b) => a.time - b.time);
  let covered = 0;
  let weighted = 0;
  sorted.forEach((event, index) => {
    if (!event.point) return;
    const from = Math.max(start, event.time);
    const to = Math.min(end, event.time + MAX_HOLD, sorted[index + 1]?.time ?? end);
    if (to > from) {
      covered += to - from;
      weighted += event.point.value * (to - from);
    }
  });
  const coverage = covered / HOUR;
  const value = covered ? weighted / covered : null;
  return { start, end, coverage, value, band: coverage >= MIN_COVERAGE ? category(value) : null };
}

import { MAX_HOLD } from './quality.js';

export const API_ROOT = 'https://io.adafruit.com/api/v2/srakrn/feeds/';
export const FEEDS = { pm: 'qdrr-particle-sensor', temperature: 'qdrr-temperature' };

export class ApiError extends Error {
  constructor(message, status = 0, retryAfter = 0) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function retryDelay(header, now = Date.now()) {
  if (!header) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

export async function request(url, fetcher = fetch) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(20_000), credentials: 'omit' });
  if (!response.ok) {
    throw new ApiError(`Adafruit IO: HTTP ${response.status}`, response.status,
      Math.max(response.status === 429 ? 60_000 : 0, retryDelay(response.headers.get('Retry-After'))));
  }
  return { data: await response.json(), headers: response.headers };
}

export function endpoint(feed, path, params = {}) {
  const url = new URL(`${API_ROOT}${feed}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.href;
}

export async function latest(feed, fetcher) {
  const { data } = await request(endpoint(feed, 'data', { limit: 1 }), fetcher);
  if (!Array.isArray(data)) throw new ApiError('Invalid readings response');
  return data;
}

export async function history(feed, fetcher) {
  const { data } = await request(endpoint(feed, 'data/chart', { hours: 24 }), fetcher);
  if (!Array.isArray(data?.data)) throw new ApiError('Invalid chart response');
  return data.data.map(row => ({ created_at: row?.[0], value: row?.[1] }));
}

export async function hourRecords(feed, { start, end }, fetcher) {
  // Include the full carry-forward window, which includes every useful preceding sample.
  const params = {
    start_time: new Date(start - MAX_HOLD).toISOString(),
    end_time: new Date(end).toISOString(),
    limit: 1000,
  };
  let url = endpoint(feed, 'data', params);
  const visited = new Set();
  const records = [];
  for (let page = 0; page < 100; page++) {
    if (visited.has(url)) throw new ApiError('Pagination did not advance');
    visited.add(url);
    const { data, headers } = await request(url, fetcher);
    if (!Array.isArray(data)) throw new ApiError('Invalid hourly response');
    records.push(...data);
    if (data.length < 1000) return records;
    // Some responses have two Link entries, with the cursor on the second entry.
    const links = [...(headers.get('Link') ?? '').matchAll(/<([^>]+)>/g)].map(match => new URL(match[1], url));
    const cursor = links.find(link => link.searchParams.has('before'))?.searchParams.get('before');
    if (cursor) {
      url = endpoint(feed, 'data', { ...params, before: cursor });
    } else {
      // Link is not always exposed by CORS. Re-fetch with an exclusive timestamp boundary.
      const times = data.map(record => Date.parse(record.created_at)).filter(Number.isFinite);
      if (!times.length) throw new ApiError('Invalid pagination timestamps');
      const oldest = Math.min(...times);
      if (oldest <= start - MAX_HOLD) return records;
      const previousEnd = Date.parse(new URL(url).searchParams.get('end_time'));
      if (oldest >= previousEnd) throw new ApiError('Pagination did not advance');
      params.end_time = new Date(oldest).toISOString();
      url = endpoint(feed, 'data', params);
    }
  }
  throw new ApiError('Hourly pagination limit exceeded');
}

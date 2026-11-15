import test from 'node:test';
import assert from 'node:assert/strict';
import { Poller } from '../src/polling.js';

test('polling pauses while hidden and runs due jobs on return', async () => {
  let visible = false, now = 0, calls = 0;
  const poller = new Poller({ now: () => now, visible: () => visible });
  poller.add(async () => calls++, 60_000, () => {});
  await poller.tick();
  assert.equal(calls, 0);
  visible = true;
  await poller.tick();
  await poller.tick();
  assert.equal(calls, 1);
  now = 60_000;
  await poller.tick();
  assert.equal(calls, 2);
});

test('in-flight jobs cannot overlap', async () => {
  let release, calls = 0;
  const poller = new Poller({ now: () => 0, visible: () => true });
  poller.add(() => { calls++; return new Promise(resolve => { release = resolve; }); }, 1000, () => {});
  const running = poller.tick();
  await poller.tick();
  assert.equal(calls, 1);
  release();
  await running;
});

test('failed feed backs off while an independent feed continues, then recovers', async () => {
  let now = 0, calls = 0, independent = 0, errors = 0;
  const poller = new Poller({ now: () => now, visible: () => true });
  const job = poller.add(async () => { if (++calls < 3) throw new Error('offline'); }, 60_000, () => errors++);
  poller.add(async () => independent++, 60_000, () => {});
  await poller.tick();
  assert.equal(job.due, 60_000);
  now = 60_000;
  await poller.tick();
  assert.equal(job.due, 180_000);
  now = 120_000;
  await poller.tick();
  assert.equal(calls, 2);
  assert.equal(independent, 3);
  now = 180_000;
  await poller.tick();
  assert.equal(job.failures, 0);
  assert.equal(errors, 2);
});

test('429 cooldown applies to all jobs, including after tab visibility changes', async () => {
  let now = 0, calls = 0;
  const poller = new Poller({ now: () => now, visible: () => true });
  poller.add(async () => { calls++; throw Object.assign(new Error('throttled'), { status: 429, retryAfter: 120_000 }); }, 60_000, () => {});
  await poller.tick();
  assert.equal(poller.blockedUntil, 120_000);
  poller.add(async () => calls++, 60_000, () => {});
  now = 60_000;
  await poller.tick();
  assert.equal(calls, 1);
});

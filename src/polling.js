export class Poller {
  constructor({ now = Date.now, visible = () => !document.hidden } = {}) {
    this.now = now;
    this.visible = visible;
    this.jobs = [];
    this.blockedUntil = 0;
  }

  add(run, interval, onError) {
    const job = { run, interval, onError, due: 0, failures: 0, busy: false };
    this.jobs.push(job);
    return job;
  }

  async tick() {
    if (!this.visible() || this.now() < this.blockedUntil) return;
    await Promise.all(this.jobs.map(async job => {
      if (job.busy || job.due > this.now() || this.now() < this.blockedUntil) return;
      job.busy = true;
      try {
        await job.run();
        job.failures = 0;
        job.due = this.now() + job.interval;
      } catch (error) {
        job.failures++;
        const delay = Math.max(60_000 * 2 ** Math.min(job.failures - 1, 4), error.retryAfter || 0);
        job.due = this.now() + delay;
        if (error.status === 429) this.blockedUntil = Math.max(this.blockedUntil, job.due);
        job.onError(error);
      } finally {
        job.busy = false;
      }
    }));
  }
}

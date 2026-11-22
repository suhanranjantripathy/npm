/**
 * Parses interval string into milliseconds
 * Examples: "5m" -> 300,000; "10m" -> 600,000; "1h" -> 3,600,000; "30s" -> 30,000
 * @param {string|number} interval 
 * @returns {number} Milliseconds
 */
export function parseInterval(interval) {
  if (typeof interval === 'number') {
    return interval > 0 ? interval : 15 * 60 * 1000;
  }

  if (typeof interval !== 'string') {
    return 15 * 60 * 1000;
  }

  const trimmed = interval.trim().toLowerCase();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d)?$/);

  if (!match) {
    throw new Error(`Invalid interval format: "${interval}". Expected formats: 5m, 10m, 15m, 30m, 1h, 30s`);
  }

  const value = parseFloat(match[1]);
  const unit = match[2] || 'm';

  switch (unit) {
    case 's': return Math.round(value * 1000);
    case 'm': return Math.round(value * 60 * 1000);
    case 'h': return Math.round(value * 60 * 60 * 1000);
    case 'd': return Math.round(value * 24 * 60 * 60 * 1000);
    default: return Math.round(value * 60 * 1000);
  }
}

/**
 * Robust interval scheduler with pause, resume, and reset capabilities
 */
export class Scheduler {
  /**
   * @param {object} params
   * @param {string|number} params.interval
   * @param {() => Promise<void>|void} params.onTrigger
   */
  constructor({ interval = '15m', onTrigger } = {}) {
    this.intervalMs = parseInterval(interval);
    this.onTrigger = onTrigger;
    this.timer = null;
    this.isPaused = false;
    this.isRunning = false;
    this.lastTriggerTime = Date.now();
    this.nextTriggerTime = Date.now() + this.intervalMs;
  }

  /**
   * Starts the scheduler
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;
    this.scheduleNext();
  }

  /**
   * Schedule the next execution
   */
  scheduleNext() {
    if (!this.isRunning || this.isPaused) return;

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.nextTriggerTime = Date.now() + this.intervalMs;
    this.timer = setTimeout(async () => {
      if (!this.isRunning || this.isPaused) return;
      try {
        if (this.onTrigger) {
          await this.onTrigger();
        }
      } catch (err) {
        console.error('Error during scheduled checkpoint:', err);
      } finally {
        this.lastTriggerTime = Date.now();
        this.scheduleNext();
      }
    }, this.intervalMs);
  }

  /**
   * Pauses the timer
   */
  pause() {
    this.isPaused = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Resumes the timer
   */
  resume() {
    if (!this.isRunning || !this.isPaused) return;
    this.isPaused = false;
    this.scheduleNext();
  }

  /**
   * Resets the timer countdown (e.g. after a manual or successful checkpoint)
   */
  reset() {
    if (this.isRunning && !this.isPaused) {
      this.scheduleNext();
    }
  }

  /**
   * Stops the scheduler
   */
  stop() {
    this.isRunning = false;
    this.isPaused = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

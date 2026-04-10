export class WatchTracker {
  private watchedSeconds: Set<number> = new Set();
  private clipDuration: number;
  private lastTime: number = -1;
  private readonly THRESHOLD = 0.8;
  private readonly MAX_JUMP = 3;

  constructor(clipDuration: number) {
    this.clipDuration = clipDuration;
  }

  update(currentTimeInClip: number): void {
    const second = Math.floor(currentTimeInClip);

    if (this.lastTime >= 0) {
      const delta = currentTimeInClip - this.lastTime;
      if (delta > 0 && delta < this.MAX_JUMP) {
        // Fill in any skipped seconds from normal playback
        const from = Math.floor(this.lastTime);
        const to = second;
        for (let s = from; s <= to && s < Math.ceil(this.clipDuration); s++) {
          this.watchedSeconds.add(s);
        }
      }
      // Large jump (seek) or backward jump — just reanchor without counting
    }

    this.lastTime = currentTimeInClip;
    // Always count the current second so the very first frame after a seek is tracked
    if (second >= 0 && second < Math.ceil(this.clipDuration)) {
      this.watchedSeconds.add(second);
    }
  }

  getProgress(): number {
    const totalSeconds = Math.ceil(this.clipDuration);
    if (totalSeconds <= 0) return 0;
    return Math.min(this.watchedSeconds.size / totalSeconds, 1);
  }

  isComplete(): boolean {
    return this.getProgress() >= this.THRESHOLD;
  }

  reset(): void {
    this.watchedSeconds.clear();
    this.lastTime = -1;
  }
}

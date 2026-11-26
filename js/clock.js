/* ==========================================================================
   MODULE 1: js/clock.js
   Time-signature-aware, drift-corrected 1-bar-ahead measure clock.
   Supports simple (4/4, 3/4, 2/4, 2/2), compound (6/8, 9/8, 12/8), pickups,
   and per-measure meter changes.
   ========================================================================== */

export function parseTimeSignature(beats = 4, beatType = 4, compoundSubdivide = false) {
  const isCompound = beatType === 8 && beats > 3 && beats % 3 === 0;
  if (isCompound && !compoundSubdivide) {
    // Feel 6/8 as 2 dotted-quarter beats, 9/8 as 3, 12/8 as 4
    return {
      beats,
      beatType,
      feltBeats: beats / 3,
      quarterNotesPerFeltBeat: 1.5
    };
  }
  // Simple meters (4/4, 3/4, 2/4, 2/2) or subdivided 6/8
  return {
    beats,
    beatType,
    feltBeats: beats,
    quarterNotesPerFeltBeat: 4 / beatType
  };
}

export class SightReadClock {
  /**
   * @param {Object} callbacks
   * @param {function(number, number, Object): void} callbacks.onMeasureStart - (playIndex, readIndex, meterInfo)
   * @param {function(number, number, number, Object): void} callbacks.onBeat - (beatInBar, playIndex, readIndex, meterInfo)
   * @param {function(): void} callbacks.onFinish
   */
  constructor({ onMeasureStart, onBeat, onFinish }) {
    this.onMeasureStart = onMeasureStart || (() => {});
    this.onBeat = onBeat || (() => {});
    this.onFinish = onFinish || (() => {});

    this.bpm = 72; // BPM always refers to the felt beat (quarter in 4/4, dotted-quarter in 6/8, half in 2/2)
    this.measureMeters = [];
    this.isRunning = false;

    this._timerId = null;
    this._measureStep = 0; // 0 = count-in bar; 1 = Measure 1, etc.
    this._beatInBar = 0;
    this._nextBeatTimeMs = 0;
  }

  /**
   * @param {Object} options
   * @param {number} options.bpm
   * @param {Array<{beats: number, beatType: number, compoundSubdivide?: boolean}>} options.measureMeters
   */
  start({ bpm = 72, measureMeters = [] } = {}) {
    if (this.isRunning || measureMeters.length === 0) return;

    this.bpm = bpm;
    this.measureMeters = measureMeters.map(m =>
      parseTimeSignature(m.beats, m.beatType, m.compoundSubdivide)
    );
    this.isRunning = true;

    this._measureStep = 0;
    this._beatInBar = 0;
    this._nextBeatTimeMs = performance.now();
    this._tick();
  }

  stop() {
    this.isRunning = false;
    if (this._timerId !== null) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
  }

  _tick() {
    if (!this.isRunning) return;

    const playIndex = this._measureStep - 1;
    const readIndex = this._measureStep;

    if (playIndex >= this.measureMeters.length) {
      this.stop();
      this.onFinish();
      return;
    }

    // During count-in (playIndex === -1), use Bar 1's meter so the count-in matches the opening time signature
    const activeMeter = playIndex === -1
      ? this.measureMeters[0]
      : this.measureMeters[playIndex];

    if (this._beatInBar === 0) {
      this.onMeasureStart(playIndex, readIndex, activeMeter);
    }

    this.onBeat(this._beatInBar, playIndex, readIndex, activeMeter);

    // Advance beat/measure counters
    const beatDurationMs = (60 / this.bpm) * 1000;
    this._beatInBar++;
    if (this._beatInBar >= activeMeter.feltBeats) {
      this._beatInBar = 0;
      this._measureStep++;
    }

    this._nextBeatTimeMs += beatDurationMs;
    const delay = Math.max(0, this._nextBeatTimeMs - performance.now());
    this._timerId = setTimeout(() => this._tick(), delay);
  }
}

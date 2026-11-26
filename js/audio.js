/* ==========================================================================
   MODULE 2: js/audio.js
   Zero-dependency Web Audio API metronome & polyphonic note player.
   ========================================================================== */

export class SightReadAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
  }

  /**
   * Must be called synchronously inside the Start button click handler
   * so Chrome/Edge/Safari unlock the AudioContext immediately.
   */
  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.6;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  /**
   * Plays a clean percussive click on each beat.
   * @param {boolean} isDownbeat - True for Beat 1 (higher pitch/accent)
   */
  playClick(isDownbeat = false) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(isDownbeat ? 1000 : 720, now);
    osc.frequency.exponentialRampToValueAtTime(isDownbeat ? 500 : 360, now + 0.04);

    gain.gain.setValueAtTime(isDownbeat ? 0.45 : 0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.055);
  }

  /**
   * Converts a pitch string like "C4", "F#3", "Bb2" to frequency in Hz.
   */
  _pitchToFreq(pitch) {
    const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(pitch.trim());
    if (!match) return 440;

    const noteMap = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let semitone = noteMap[match[1].toUpperCase()];
    if (match[2] === "#") semitone += 1;
    if (match[2] === "b") semitone -= 1;

    const octave = parseInt(match[3], 10);
    const midi = (octave + 1) * 12 + semitone;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /**
   * Schedules a single musical note using Web Audio hardware timing.
   * @param {string} pitch - e.g. "G3", "Bb4"
   * @param {number} delaySec - Seconds from now to start the note
   * @param {number} durationSec - Length of the note in seconds
   * @param {number} volume - 0.0 to 1.0
   */
  playNote(pitch, delaySec = 0, durationSec = 0.5, volume = 0.25) {
    if (!this.ctx) return;
    const startTime = this.ctx.currentTime + Math.max(0, delaySec);
    const stopTime = startTime + Math.max(0.08, durationSec);
    const freq = this._pitchToFreq(pitch);

    // Warm triangle + soft sine overtone for a mellow keyboard/string timbre
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(startTime);
    osc.stop(stopTime + 0.02);
  }

  /**
   * Schedules all notes in a measure relative to Beat 1.
   * @param {Array<{pitch: string, beatOffset: number, durationBeats: number, isCello?: boolean}>} notes
   * @param {number} beatDurationSec - Duration of 1 felt beat in seconds
   * @param {boolean} muteCello - If true, skips notes tagged isCello
   */
  scheduleBar(notes, beatDurationSec, muteCello = true) {
    if (!this.ctx || !Array.isArray(notes)) return;
    notes.forEach(n => {
      if (muteCello && n.isCello) return;
      const delaySec = (n.beatOffset || 0) * beatDurationSec;
      const durSec = (n.durationBeats || 1) * beatDurationSec * 0.92;
      this.playNote(n.pitch, delaySec, durSec, 0.22);
    });
  }

  /**
   * Immediately silences all scheduled audio when Stop is clicked.
   */
  stopAll() {
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
    }
  }
}

/* ==========================================================================
   MODULE 2: js/audio.js
   Zero-dependency Web Audio acoustic-style piano synthesizer & woodblock
   metronome. Uses multi-harmonic string modeling, hammer low-pass filter
   envelopes, and a master dynamics compressor to prevent chord clipping.
   ========================================================================== */

export class SightReadAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
  }

  /**
   * Unlocks the browser AudioContext synchronously inside a user click event
   * and builds a master compressor + gain stage so multi-voice chords never clip.
   */
  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-16, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(18, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.005, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.18, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.75;

      this.compressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  /**
   * Plays a warm, crisp woodblock-style metronome click.
   * @param {boolean} isDownbeat - True for Beat 1 (slightly brighter/accented)
   */
  playClick(isDownbeat = false) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(isDownbeat ? 880 : 620, now);
    osc.frequency.exponentialRampToValueAtTime(isDownbeat ? 420 : 310, now + 0.035);

    filter.type = "bandpass";
    filter.frequency.setValueAtTime(isDownbeat ? 1100 : 800, now);
    filter.Q.value = 2.5;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(isDownbeat ? 0.35 : 0.2, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.compressor);

    osc.start(now);
    osc.stop(now + 0.05);
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
   * Synthesizes a single acoustic-piano-style note with harmonic partials,
   * a felt-hammer low-pass filter sweep, and natural string decay.
   *
   * @param {string} pitch - e.g. "G3", "Bb4"
   * @param {number} delaySec - Seconds from now to start the note
   * @param {number} durationSec - Length of the note in seconds
   * @param {number} volume - Base velocity/volume (0.0 to 1.0)
   */
  playNote(pitch, delaySec = 0, durationSec = 0.5, volume = 0.22) {
    if (!this.ctx) return;

    const startTime = this.ctx.currentTime + Math.max(0, delaySec);
    const noteLen = Math.max(0.12, durationSec);
    const releaseTail = 0.28; // Subtle damper pedal / soundboard release tail
    const stopTime = startTime + noteLen + releaseTail;
    const freq = this._pitchToFreq(pitch);

    // 1. Felt-hammer brightness envelope via low-pass filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.8;
    // Bright attack on hammer strike, then mellows smoothly as string rings
    const peakCutoff = Math.min(4800, freq * 6.5);
    const sustainCutoff = Math.min(1800, freq * 2.4);
    filter.frequency.setValueAtTime(peakCutoff, startTime);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(240, sustainCutoff),
      startTime + Math.min(0.35, noteLen * 0.7)
    );

    // 2. Amplitude envelope (fast hammer attack, gradual acoustic string decay, clean damper release)
    const envGain = this.ctx.createGain();
    envGain.gain.setValueAtTime(0.0001, startTime);
    envGain.gain.linearRampToValueAtTime(volume, startTime + 0.012);
    // Natural piano decay while key is held
    envGain.gain.exponentialRampToValueAtTime(
      Math.max(0.001, volume * 0.42),
      startTime + noteLen
    );
    // Damper release when key lifts
    envGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    filter.connect(envGain);
    envGain.connect(this.compressor);

    // 3. Multi-harmonic partials (fundamental + 2nd + subtle 3rd harmonic)
    const partials = [
      { ratio: 1, type: "triangle", weight: 0.72, detune: -1.5 },
      { ratio: 1, type: "sine",     weight: 0.45, detune:  1.5 }, // Slight chorus warmth like dual piano strings
      { ratio: 2, type: "sine",     weight: 0.22, detune:  0.0 },
      { ratio: 3, type: "sine",     weight: 0.07, detune:  0.0 }
    ];

    partials.forEach(p => {
      // Skip upper harmonics on very high notes so soprano stays sweet
      if (freq * p.ratio > 4200) return;

      const osc = this.ctx.createOscillator();
      const partialGain = this.ctx.createGain();

      osc.type = p.type;
      osc.frequency.setValueAtTime(freq * p.ratio, startTime);
      osc.detune.setValueAtTime(p.detune, startTime);

      partialGain.gain.value = p.weight;

      osc.connect(partialGain);
      partialGain.connect(filter);

      osc.start(startTime);
      osc.stop(stopTime + 0.02);
    });
  }

  /**
   * Schedules all notes in a measure relative to Beat 1.
   */
  scheduleBar(notes, beatDurationSec, muteCello = true) {
    if (!this.ctx || !Array.isArray(notes)) return;
    notes.forEach(n => {
      if (muteCello && n.isCello) return;
      const delaySec = (n.beatOffset || 0) * beatDurationSec;
      const durSec = (n.durationBeats || 1) * beatDurationSec * 0.94;
      // Slightly soften inner voices so the top soprano melody sings clearly
      const voiceVel = n.isCello ? 0.24 : 0.19;
      this.playNote(n.pitch, delaySec, durSec, voiceVel);
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
      this.compressor = null;
    }
  }
}

/* ==========================================================================
   MODULE 5: js/main.js
   Connects clock.js, audio.js, repo-loader.js, and notation.js into the
   1-bar-ahead Cello Sight-Reading Trainer.
   - Ensures opening pickup bars get a full-measure count-in and full-bar
     reading window (aligning pickup notes to the end of the bar).
   ========================================================================== */

import { SightReadClock } from "./clock.js";
import { SightReadAudio } from "./audio.js";
import { fetchBachChoraleList, fetchAndInspectScore } from "./repo-loader.js";
import { parseMusicXMLScore, renderMeasureToContainer } from "./notation.js";

const choraleSelect = document.getElementById("chorale-select");
const randomBtn = document.getElementById("random-btn");
const bpmInput = document.getElementById("bpm");
const clickCheckbox = document.getElementById("click-track");
const muteCelloCheckbox = document.getElementById("mute-cello");
const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const statusText = document.getElementById("status-text");
const pieceTitleEl = document.getElementById("piece-title");
const pieceMetaEl = document.getElementById("piece-meta");
const beatBar = document.getElementById("beat-bar");
const notationContainer = document.getElementById("notation-output");

const audio = new SightReadAudio();

let catalogItems = [];
let loadedMeasures = [];
let loadedSummary = null;

function renderBeatDots(count, activeBeat = -1) {
  beatBar.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const dot = document.createElement("div");
    dot.className = "beat-dot" + (i === activeBeat ? " active" : "");
    beatBar.appendChild(dot);
  }
}

/**
 * Builds per-measure meter objects for SightReadClock.
 * If the opening bar (index 0) is a short pickup bar, expands it to a full
 * measure (e.g., 4 beats in 4/4) so both the count-in and pickup bar give
 * you a full measure to read ahead.
 */
function buildClockMeters(measures) {
  return measures.map((m, idx) => {
    const quarterUnit = 4 / m.meter.beatType;
    const actualBeats = Math.max(
      1,
      Math.round(m.actualQuarterBeats / quarterUnit)
    );

    if (idx === 0 && actualBeats < m.meter.beats) {
      return {
        beats: m.meter.beats,
        beatType: m.meter.beatType
      };
    }

    return {
      beats: actualBeats,
      beatType: m.meter.beatType
    };
  });
}

/**
 * If Bar 0 is a pickup bar (e.g., 1 beat in a 4/4 bar), shifts its notes to
 * the end of the full bar (beatOffset + 3) so clicks 1-2-3 lead cleanly into
 * the pickup note on beat 4 and Bar 2 lands right on Beat 1.
 */
function getAdjustedAudioNotes(measure, barIndex) {
  if (barIndex !== 0) return measure.audioNotes;

  const quarterUnit = 4 / measure.meter.beatType;
  const actualBeats = Math.max(1, Math.round(measure.actualQuarterBeats / quarterUnit));
  const missingLeadingBeats = Math.max(0, measure.meter.beats - actualBeats);

  if (missingLeadingBeats === 0) return measure.audioNotes;

  return measure.audioNotes.map(n => ({
    ...n,
    beatOffset: n.beatOffset + missingLeadingBeats
  }));
}

async function displayBar(barIndex) {
  if (barIndex < 0 || barIndex >= loadedMeasures.length) {
    notationContainer.innerHTML = `<div class="placeholder-bar">End of Piece</div><div class="placeholder-sub">Press Start to practice again or select another chorale.</div>`;
    return;
  }

  const m = loadedMeasures[barIndex];
  const prevMeter = barIndex > 0 ? loadedMeasures[barIndex - 1].meter : null;
  const meterChanged =
    barIndex === 0 ||
    prevMeter.beats !== m.meter.beats ||
    prevMeter.beatType !== m.meter.beatType;

  await renderMeasureToContainer(m, notationContainer, {
    showTimeSignature: meterChanged,
    width: 640,
    height: 185
  });
}

const clock = new SightReadClock({
  onMeasureStart(playIndex, readIndex, meterInfo) {
    const totalBars = loadedMeasures.length;
    const bpm = parseInt(bpmInput.value, 10) || 72;
    const beatDurationSec = 60 / bpm;

    // 1. Display Bar N+1 (readIndex) on screen for look-ahead reading
    displayBar(readIndex);

    // 2. Schedule audio for Bar N (playIndex)
    if (playIndex === -1) {
      const m1 = loadedMeasures[0];
      statusText.textContent = `COUNT-IN (${meterInfo.feltBeats} beats) — Read Bar ${m1.numberLabel} now!`;
    } else if (playIndex < totalBars) {
      const playingMeasure = loadedMeasures[playIndex];
      const notesToPlay = getAdjustedAudioNotes(playingMeasure, playIndex);

      audio.scheduleBar(
        notesToPlay,
        beatDurationSec,
        muteCelloCheckbox.checked
      );

      if (readIndex < totalBars) {
        const readingMeasure = loadedMeasures[readIndex];
        statusText.textContent = `Playing Bar ${playingMeasure.numberLabel} | Reading Bar ${readingMeasure.numberLabel}`;
      } else {
        statusText.textContent = `Playing Final Bar (${playingMeasure.numberLabel}) | End of Piece`;
      }
    }
  },

  onBeat(beatInBar, playIndex, readIndex, meterInfo) {
    renderBeatDots(meterInfo.feltBeats, beatInBar);
    if (playIndex === -1 || clickCheckbox.checked) {
      audio.playClick(beatInBar === 0);
    }
  },

  onFinish() {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    choraleSelect.disabled = false;
    randomBtn.disabled = false;
    renderBeatDots(loadedMeasures[0]?.meter.beats || 4, -1);
    statusText.textContent = `Finished "${loadedSummary?.workTitle || "Chorale"}"! Press Start to repeat.`;
    displayBar(0);
  }
});

async function loadSelectedChorale() {
  const idx = parseInt(choraleSelect.value, 10) || 0;
  const item = catalogItems[idx];
  if (!item) return;

  stopPractice();
  startBtn.disabled = true;
  choraleSelect.disabled = true;
  randomBtn.disabled = true;
  statusText.textContent = `Loading ${item.title}...`;

  try {
    const { xmlString, summary } = await fetchAndInspectScore(item.url);
    loadedMeasures = parseMusicXMLScore(xmlString);
    loadedSummary = summary;

    pieceTitleEl.textContent = summary.workTitle;
    pieceMetaEl.textContent = `Key: ${loadedMeasures[0]?.keySignature || "C"} • ${loadedMeasures.length} bars • ${summary.meters.join(", ")}`;
    choraleSelect.options[idx].textContent = summary.workTitle;

    renderBeatDots(loadedMeasures[0]?.meter.beats || 4, -1);
    await displayBar(0);

    statusText.textContent = `Ready — Press Start for full ${loadedMeasures[0]?.meter.beats || 4}-beat count-in.`;
    startBtn.disabled = false;
  } catch (err) {
    statusText.textContent = `Error loading chorale: ${err.message}`;
    console.error(err);
  } finally {
    choraleSelect.disabled = false;
    randomBtn.disabled = false;
  }
}

function startPractice() {
  if (!loadedMeasures.length) return;
  audio.unlock();

  const bpm = parseInt(bpmInput.value, 10) || 72;
  const measureMeters = buildClockMeters(loadedMeasures);

  startBtn.disabled = true;
  stopBtn.disabled = false;
  choraleSelect.disabled = true;
  randomBtn.disabled = true;

  clock.start({ bpm, measureMeters });
}

function stopPractice() {
  clock.stop();
  audio.stopAll();
  startBtn.disabled = loadedMeasures.length === 0;
  stopBtn.disabled = true;
  choraleSelect.disabled = false;
  randomBtn.disabled = false;
  renderBeatDots(loadedMeasures[0]?.meter.beats || 4, -1);
  if (loadedMeasures.length > 0) {
    statusText.textContent = "Stopped. Ready to restart.";
    displayBar(0);
  }
}

choraleSelect.addEventListener("change", loadSelectedChorale);
randomBtn.addEventListener("click", () => {
  if (!catalogItems.length) return;
  choraleSelect.selectedIndex = Math.floor(Math.random() * catalogItems.length);
  loadSelectedChorale();
});
startBtn.addEventListener("click", startPractice);
stopBtn.addEventListener("click", stopPractice);

(async function init() {
  renderBeatDots(4);
  const { items } = await fetchBachChoraleList();
  catalogItems = items;

  choraleSelect.innerHTML = "";
  items.forEach((item, idx) => {
    const opt = document.createElement("option");
    opt.value = idx;
    opt.textContent = item.title;
    choraleSelect.appendChild(opt);
  });

  await loadSelectedChorale();
})();

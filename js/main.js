/* ==========================================================================
   MODULE 5: js/main.js
   Connects clock.js, audio.js, repo-loader.js, and notation.js into the
   1-Bar / 2-Bar Look-Ahead Cello Sight-Reading Trainer.
   ========================================================================== */

import { SightReadClock } from "./clock.js";
import { SightReadAudio } from "./audio.js";
import { fetchBachChoraleList, fetchAndInspectScore } from "./repo-loader.js";
import { parseMusicXMLScore, renderMeasureToContainer } from "./notation.js";

const choraleSelect = document.getElementById("chorale-select");
const randomBtn = document.getElementById("random-btn");
const barModeSelect = document.getElementById("bar-mode");
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

function getBarMode() {
  return parseInt(barModeSelect.value, 10) || 2;
}

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
 * Expands an opening pickup bar to a full measure so both count-in and
 * pickup bar give a full, predictable reading window.
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
 * Shifts opening pickup notes to the end of the full bar so clicks 1..N-1
 * lead cleanly into the pickup and Bar 2 lands right on Beat 1.
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

/**
 * Renders either 1 bar (Bar N+1) or 2 bars (Bar N + Bar N+1) depending on mode.
 * @param {number} playIndex - Index of measure currently playing (-1 during count-in)
 */
async function renderViewport(playIndex) {
  if (!loadedMeasures.length) return;

  const mode = getBarMode();
  notationContainer.innerHTML = "";

  // Determine which bar indices to show
  const slots = [];
  if (mode === 1) {
    const readIdx = playIndex + 1;
    if (readIdx < loadedMeasures.length) {
      slots.push({
        barIndex: readIdx,
        role: "look-ahead",
        badge: `Read Ahead • Bar ${loadedMeasures[readIdx].numberLabel}`
      });
    }
  } else {
    // 2-Bar Mode:
    // During count-in (playIndex === -1), show Bar 1 & Bar 2 as Look-Ahead.
    // During playIndex >= 0, show Bar N (Playing Now) + Bar N+1 (Look Ahead).
    const firstIdx = playIndex === -1 ? 0 : playIndex;
    const secondIdx = firstIdx + 1;

    if (firstIdx < loadedMeasures.length) {
      slots.push({
        barIndex: firstIdx,
        role: playIndex === -1 ? "look-ahead" : "playing-now",
        badge: playIndex === -1
          ? `Up Next • Bar ${loadedMeasures[firstIdx].numberLabel}`
          : `Playing Now • Bar ${loadedMeasures[firstIdx].numberLabel}`
      });
    }
    if (secondIdx < loadedMeasures.length) {
      slots.push({
        barIndex: secondIdx,
        role: "look-ahead",
        badge: `Read Ahead • Bar ${loadedMeasures[secondIdx].numberLabel}`
      });
    }
  }

  if (slots.length === 0) {
    notationContainer.innerHTML = `
      <div style="text-align:center; padding: 1.5rem;">
        <div class="placeholder-bar">End of Piece</div>
        <div class="placeholder-sub">Press Start to practice again or select another chorale.</div>
      </div>`;
    return;
  }

  const svgWidth = slots.length === 2 ? 430 : 620;

  for (const slot of slots) {
    const m = loadedMeasures[slot.barIndex];
    const prevMeter = slot.barIndex > 0 ? loadedMeasures[slot.barIndex - 1].meter : null;
    const meterChanged =
      slot.barIndex === 0 ||
      prevMeter.beats !== m.meter.beats ||
      prevMeter.beatType !== m.meter.beatType;

    const card = document.createElement("div");
    card.className = `bar-slot ${slot.role}`;

    const badge = document.createElement("div");
    badge.className = "slot-badge";
    badge.textContent = slot.badge;
    card.appendChild(badge);

    const svgHost = document.createElement("div");
    card.appendChild(svgHost);
    notationContainer.appendChild(card);

    await renderMeasureToContainer(m, svgHost, {
      showTimeSignature: meterChanged,
      width: svgWidth,
      height: 175
    });
  }
}

const clock = new SightReadClock({
  onMeasureStart(playIndex, readIndex, meterInfo) {
    const totalBars = loadedMeasures.length;
    const bpm = parseInt(bpmInput.value, 10) || 72;
    const beatDurationSec = 60 / bpm;
    const mode = getBarMode();

    // 1. Update sheet music viewport
    renderViewport(playIndex);

    // 2. Schedule audio for Bar N (playIndex)
    if (playIndex === -1) {
      const m1 = loadedMeasures[0];
      const m2 = loadedMeasures[1];
      statusText.textContent = mode === 2 && m2
        ? `COUNT-IN (${meterInfo.feltBeats} beats) — Previewing Bars ${m1.numberLabel} & ${m2.numberLabel}`
        : `COUNT-IN (${meterInfo.feltBeats} beats) — Read Bar ${m1.numberLabel} now!`;
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
        statusText.textContent = `Playing Bar ${playingMeasure.numberLabel} | Ahead: Bar ${readingMeasure.numberLabel}`;
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
    renderViewport(-1);
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
    await renderViewport(-1);

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
    renderViewport(-1);
  }
}

choraleSelect.addEventListener("change", loadSelectedChorale);
barModeSelect.addEventListener("change", () => {
  if (!clock.isRunning && loadedMeasures.length > 0) {
    renderViewport(-1);
  }
});
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

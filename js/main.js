/* ==========================================================================
   MODULE 5: js/main.js
   Connects clock.js, audio.js, repo-loader.js, and notation.js into the
   Cello Sight-Reading Trainer with 3 reading modes:
   - "continuous": 2 measures on one continuous staff (normal sheet music feel)
   - "split": 2 separate cards side-by-side (trains eye jump)
   - "single": 1 bar ahead only (strict memory buffer)
   ========================================================================== */

import { SightReadClock } from "./clock.js";
import { SightReadAudio } from "./audio.js";
import { fetchBachChoraleList, fetchAndInspectScore } from "./repo-loader.js";
import {
  parseMusicXMLScore,
  renderMeasureToContainer,
  renderContinuousMeasures
} from "./notation.js";

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

function getViewMode() {
  return barModeSelect.value || "continuous";
}

function renderBeatDots(count, activeBeat = -1) {
  beatBar.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const dot = document.createElement("div");
    dot.className = "beat-dot" + (i === activeBeat ? " active" : "");
    beatBar.appendChild(dot);
  }
}

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

async function renderViewport(playIndex) {
  if (!loadedMeasures.length) return;

  const mode = getViewMode();
  notationContainer.innerHTML = "";

  const startBarIdx = mode === "single" ? playIndex + 1 : (playIndex === -1 ? 0 : playIndex);
  if (startBarIdx >= loadedMeasures.length) {
    notationContainer.innerHTML = `
      <div style="text-align:center; padding: 1.5rem;">
        <div class="placeholder-bar">End of Piece</div>
        <div class="placeholder-sub">Press Start to practice again or select another chorale.</div>
      </div>`;
    return;
  }

  // --- MODE A: Continuous Staff (2 bars connected by a normal barline) ---
  if (mode === "continuous") {
    const slice = loadedMeasures.slice(startBarIdx, startBarIdx + 2);
    const prevMeter = startBarIdx > 0 ? loadedMeasures[startBarIdx - 1].meter : null;
    const showFirstTS =
      startBarIdx === 0 ||
      prevMeter.beats !== slice[0].meter.beats ||
      prevMeter.beatType !== slice[0].meter.beatType;

    const box = document.createElement("div");
    box.className = "continuous-box";

    const header = document.createElement("div");
    header.className = "continuous-header";

    const leftBadge = document.createElement("span");
    leftBadge.className = `slot-badge ${playIndex === -1 ? "badge-next" : "badge-active"}`;
    leftBadge.textContent = playIndex === -1
      ? `Up Next • Bar ${slice[0].numberLabel}`
      : `Playing Now • Bar ${slice[0].numberLabel}`;
    header.appendChild(leftBadge);

    if (slice[1]) {
      const rightBadge = document.createElement("span");
      rightBadge.className = "slot-badge badge-next";
      rightBadge.textContent = `Read Ahead • Bar ${slice[1].numberLabel}`;
      header.appendChild(rightBadge);
    }

    box.appendChild(header);

    const svgHost = document.createElement("div");
    box.appendChild(svgHost);
    notationContainer.appendChild(box);

    await renderContinuousMeasures(slice, svgHost, {
      showFirstTimeSignature: showFirstTS,
      highlightFirstBar: playIndex >= 0,
      width: 850,
      height: 185
    });
    return;
  }

  // --- MODE B & C: Split Cards (2 cards) or Single Card (1 bar hard) ---
  const slots = [];
  if (mode === "single") {
    slots.push({
      barIndex: startBarIdx,
      role: "look-ahead",
      badge: `Read Ahead • Bar ${loadedMeasures[startBarIdx].numberLabel}`
    });
  } else {
    slots.push({
      barIndex: startBarIdx,
      role: playIndex === -1 ? "look-ahead" : "playing-now",
      badge: playIndex === -1
        ? `Up Next • Bar ${loadedMeasures[startBarIdx].numberLabel}`
        : `Playing Now • Bar ${loadedMeasures[startBarIdx].numberLabel}`
    });
    if (startBarIdx + 1 < loadedMeasures.length) {
      slots.push({
        barIndex: startBarIdx + 1,
        role: "look-ahead",
        badge: `Read Ahead • Bar ${loadedMeasures[startBarIdx + 1].numberLabel}`
      });
    }
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
    const mode = getViewMode();

    renderViewport(playIndex);

    if (playIndex === -1) {
      const m1 = loadedMeasures[0];
      const m2 = loadedMeasures[1];
      statusText.textContent = mode !== "single" && m2
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

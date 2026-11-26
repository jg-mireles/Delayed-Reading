/* ==========================================================================
   MODULE 4: js/notation.js
   Parses MusicXML into structured per-measure data (meters, ensemble audio
   notes, and cello visual notes) and renders crisp single-bar SVGs via VexFlow.
   ========================================================================== */

const VEXFLOW_CDN = "https://cdn.jsdelivr.net/npm/vexflow@4.2.3/build/cjs/vexflow.js";

const FIFTHS_TO_MAJOR_KEY = {
  "-7": "Cb", "-6": "Gb", "-5": "Db", "-4": "Ab", "-3": "Eb", "-2": "Bb", "-1": "F",
  "0": "C",
  "1": "G", "2": "D", "3": "A", "4": "E", "5": "B", "6": "F#", "7": "C#"
};

function loadVexFlow() {
  if (window.Vex && window.Vex.Flow) return Promise.resolve(window.Vex.Flow);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = VEXFLOW_CDN;
    script.onload = () => {
      if (window.Vex && window.Vex.Flow) resolve(window.Vex.Flow);
      else reject(new Error("VexFlow loaded, but window.Vex.Flow was not found."));
    };
    script.onerror = () => reject(new Error("Failed to load VexFlow from CDN."));
    document.head.appendChild(script);
  });
}

function xmlTypeToVexDuration(typeText, dots = 0, isRest = false) {
  const map = {
    whole: "w",
    half: "h",
    quarter: "q",
    eighth: "8",
    "16th": "16",
    "32nd": "32"
  };
  let dur = map[typeText] || "q";
  if (dots > 0) dur += "d".repeat(dots);
  if (isRest) dur += "r";
  return dur;
}

function xmlClefToVexClef(sign, line) {
  if (sign === "F") return "bass";
  if (sign === "C" && line === "4") return "tenor";
  if (sign === "C" && line === "3") return "alto";
  if (sign === "G") return "treble";
  return "bass";
}

/**
 * Parses a MusicXML string into an array of measure objects ready for
 * clock.js, audio.js, and renderBarToElement().
 *
 * @param {string} xmlString
 * @param {number|null} targetPartIndex - 0-based part index to display (defaults to bottom part = Cello/Bass)
 */
export function parseMusicXMLScore(xmlString, targetPartIndex = null) {
  const doc = new DOMParser().parseFromString(xmlString, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Invalid MusicXML: " + parseError.textContent.slice(0, 100));
  }

  const parts = Array.from(doc.querySelectorAll("score-partwise > part"));
  if (parts.length === 0) {
    throw new Error("No <part> elements found in MusicXML.");
  }

  // Default to the bottom voice (Bass in SATB chorales, Violoncello in string quartets)
  const celloIdx = targetPartIndex !== null ? targetPartIndex : parts.length - 1;
  const totalMeasures = parts[celloIdx].querySelectorAll("measure").length;

  const measures = Array.from({ length: totalMeasures }, (_, i) => ({
    index: i,
    meter: { beats: 4, beatType: 4 },
    keySignature: "C",
    clef: "bass",
    audioNotes: [],  // All voices (for audio.js)
    visualNotes: []  // Cello voice only (for VexFlow rendering)
  }));

  // Track persistent state across measures per part
  parts.forEach((partEl, pIdx) => {
    const isCello = pIdx === celloIdx;
    let divisions = 1;
    let currentBeats = 4;
    let currentBeatType = 4;
    let currentKey = "C";
    let currentClef = isCello ? "bass" : "treble";

    const partMeasures = Array.from(partEl.querySelectorAll("measure"));

    partMeasures.forEach((mEl, mIdx) => {
      if (mIdx >= totalMeasures) return;

      // 1. Check for attribute updates (divisions, key, time, clef)
      const attrEl = mEl.querySelector("attributes");
      if (attrEl) {
        const divText = attrEl.querySelector("divisions")?.textContent;
        if (divText) divisions = parseInt(divText, 10) || divisions;

        const fifthsText = attrEl.querySelector("key > fifths")?.textContent;
        if (fifthsText !== undefined) {
          currentKey = FIFTHS_TO_MAJOR_KEY[fifthsText.trim()] || "C";
        }

        const beatsText = attrEl.querySelector("time > beats")?.textContent;
        const beatTypeText = attrEl.querySelector("time > beat-type")?.textContent;
        if (beatsText && beatTypeText) {
          currentBeats = parseInt(beatsText, 10);
          currentBeatType = parseInt(beatTypeText, 10);
        }

        const clefSign = attrEl.querySelector("clef > sign")?.textContent;
        const clefLine = attrEl.querySelector("clef > line")?.textContent;
        if (clefSign) {
          currentClef = xmlClefToVexClef(clefSign.trim(), clefLine?.trim());
        }
      }

      if (isCello) {
        measures[mIdx].meter = { beats: currentBeats, beatType: currentBeatType };
        measures[mIdx].keySignature = currentKey;
        measures[mIdx].clef = currentClef;
      }

      // 2. Walk through notes/backups/forwards in chronological order
      let cursorDivisions = 0;
      const quarterUnit = 4 / currentBeatType; // converts quarter-note offsets to felt-beat offsets

      Array.from(mEl.children).forEach(child => {
        if (child.tagName === "backup") {
          const dur = parseInt(child.querySelector("duration")?.textContent || "0", 10);
          cursorDivisions = Math.max(0, cursorDivisions - dur);
          return;
        }
        if (child.tagName === "forward") {
          const dur = parseInt(child.querySelector("duration")?.textContent || "0", 10);
          cursorDivisions += dur;
          return;
        }
        if (child.tagName !== "note") return;

        // Handle mid-bar clef changes if present before a note
        const isChord = child.querySelector("chord") !== null;
        const isRest = child.querySelector("rest") !== null;
        const durDivs = parseInt(child.querySelector("duration")?.textContent || String(divisions), 10);
        const typeText = child.querySelector("type")?.textContent?.trim() || "quarter";
        const dots = child.querySelectorAll("dot").length;

        const beatOffset = (cursorDivisions / divisions) / quarterUnit;
        const durationBeats = (durDivs / divisions) / quarterUnit;

        if (!isRest) {
          const step = child.querySelector("pitch > step")?.textContent?.trim() || "C";
          const alter = parseInt(child.querySelector("pitch > alter")?.textContent || "0", 10);
          const octave = child.querySelector("pitch > octave")?.textContent?.trim() || "3";
          const acc = alter === 1 ? "#" : alter === -1 ? "b" : "";
          const pitchStr = `${step}${acc}${octave}`;

          // Check if tied to previous note (skip re-attacking tied continuations in audio)
          const ties = Array.from(child.querySelectorAll("tie")).map(t => t.getAttribute("type"));
          const isTiedStop = ties.includes("stop") && !ties.includes("start");

          if (!isTiedStop) {
            measures[mIdx].audioNotes.push({
              pitch: pitchStr,
              beatOffset,
              durationBeats,
              isCello
            });
          }

          if (isCello) {
            measures[mIdx].visualNotes.push({
              vexKey: `${step.toLowerCase()}${acc}/${octave}`,
              vexDuration: xmlTypeToVexDuration(typeText, dots, false),
              accidental: acc || null,
              isChord,
              isRest: false
            });
          }
        } else if (isCello) {
          // Position rest comfortably on middle line of active clef
          const restKey = currentClef === "bass" ? "d/3" : currentClef === "tenor" ? "a/3" : "b/4";
          measures[mIdx].visualNotes.push({
            vexKey: restKey,
            vexDuration: xmlTypeToVexDuration(typeText, dots, true),
            accidental: null,
            isChord: false,
            isRest: true
          });
        }

        if (!isChord) {
          cursorDivisions += durDivs;
        }
      });
    });
  });

  return measures;
}

/**
 * Renders a single measure object cleanly into a DOM container using VexFlow.
 * Automatically draws the active clef, key signature, and time signature (on Bar 1 or meter changes).
 */
export async function renderMeasureToContainer(measure, containerEl, options = {}) {
  const VF = await loadVexFlow();
  const { showTimeSignature = false, width = 560, height = 170 } = options;

  containerEl.innerHTML = "";

  const renderer = new VF.Renderer(containerEl, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const context = renderer.getContext();

  const stave = new VF.Stave(15, 25, width - 30);
  stave.addClef(measure.clef);
  if (measure.keySignature && measure.keySignature !== "C") {
    stave.addKeySignature(measure.keySignature);
  }
  if (showTimeSignature) {
    stave.addTimeSignature(`${measure.meter.beats}/${measure.meter.beatType}`);
  }
  stave.setContext(context).draw();

  if (!measure.visualNotes || measure.visualNotes.length === 0) {
    return;
  }

  // Build VexFlow StaveNotes (grouping chord tones if any)
  const staveNotes = [];
  measure.visualNotes.forEach(n => {
    if (n.isChord && staveNotes.length > 0) {
      const prev = staveNotes[staveNotes.length - 1];
      prev.keys.push(n.vexKey);
      if (n.accidental) {
        prev.addModifier(new VF.Accidental(n.accidental), prev.keys.length - 1);
      }
    } else {
      const sn = new VF.StaveNote({
        clef: measure.clef,
        keys: [n.vexKey],
        duration: n.vexDuration
      });
      if (n.accidental && !n.isRest) {
        sn.addModifier(new VF.Accidental(n.accidental), 0);
      }
      staveNotes.push(sn);
    }
  });

  // Auto-generate beams for eighth/sixteenth notes and render softly (non-strict voice for pickup bars)
  const beams = VF.Beam.generateBeams(staveNotes);
  const voice = new VF.Voice({
    num_beats: measure.meter.beats,
    beat_value: measure.meter.beatType
  }).setStrict(false);

  voice.addTickables(staveNotes);

  new VF.Formatter()
    .joinVoices([voice])
    .format([voice], width - 140);

  voice.draw(context, stave);
  beams.forEach(b => b.setContext(context).draw());
}

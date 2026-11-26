/* ==========================================================================
   MODULE 4: js/notation.js
   Parses MusicXML into structured per-measure data (actual beat lengths,
   meters, ensemble audio notes, and cello visual notes) and renders crisp
   single-bar SVGs via VexFlow.
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

function quarterDurationToVex(quarterBeats, typeText, dots = 0, isRest = false) {
  const candidates = [
    { q: 6.0, code: "wd" },
    { q: 4.0, code: "w" },
    { q: 3.0, code: "hd" },
    { q: 2.0, code: "h" },
    { q: 1.5, code: "qd" },
    { q: 1.0, code: "q" },
    { q: 0.75, code: "8d" },
    { q: 0.5, code: "8" },
    { q: 0.375, code: "16d" },
    { q: 0.25, code: "16" },
    { q: 0.125, code: "32" }
  ];

  let code = null;
  for (const c of candidates) {
    if (Math.abs(quarterBeats - c.q) < 0.03) {
      code = c.code;
      break;
    }
  }

  if (!code) {
    const typeMap = {
      whole: "w",
      half: "h",
      quarter: "q",
      eighth: "8",
      "16th": "16",
      "32nd": "32"
    };
    code = typeMap[typeText] || "q";
    if (dots > 0) code += "d".repeat(dots);
  }

  return isRest ? `${code}r` : code;
}

function xmlClefToVexClef(sign, line) {
  if (sign === "F") return "bass";
  if (sign === "C" && line === "4") return "tenor";
  if (sign === "C" && line === "3") return "alto";
  if (sign === "G") return "treble";
  return "bass";
}

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

  const celloIdx = targetPartIndex !== null ? targetPartIndex : parts.length - 1;
  const totalMeasures = parts[celloIdx].querySelectorAll("measure").length;

  const measures = Array.from({ length: totalMeasures }, (_, i) => ({
    index: i,
    numberLabel: String(i + 1),
    isImplicit: false,
    meter: { beats: 4, beatType: 4 },
    actualQuarterBeats: 4,
    keySignature: "C",
    clef: "bass",
    audioNotes: [],
    visualNotes: []
  }));

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

      const nominalQuarterBeats = currentBeats * (4 / currentBeatType);

      if (isCello) {
        measures[mIdx].numberLabel = mEl.getAttribute("number") || String(mIdx + 1);
        measures[mIdx].isImplicit = mEl.getAttribute("implicit") === "yes";
        measures[mIdx].meter = { beats: currentBeats, beatType: currentBeatType };
        measures[mIdx].keySignature = currentKey;
        measures[mIdx].clef = currentClef;
      }

      const firstVoice = mEl.querySelector("note > voice")?.textContent?.trim() || "1";

      let cursorDivisions = 0;
      let maxDivisionsReached = 0;
      const quarterUnit = 4 / currentBeatType;

      Array.from(mEl.children).forEach(child => {
        if (child.tagName === "backup") {
          const dur = parseInt(child.querySelector("duration")?.textContent || "0", 10);
          cursorDivisions = Math.max(0, cursorDivisions - dur);
          return;
        }
        if (child.tagName === "forward") {
          const dur = parseInt(child.querySelector("duration")?.textContent || "0", 10);
          cursorDivisions += dur;
          if (cursorDivisions > maxDivisionsReached) maxDivisionsReached = cursorDivisions;
          return;
        }
        if (child.tagName !== "note") return;

        const noteVoice = child.querySelector("voice")?.textContent?.trim() || firstVoice;
        const isPrimaryVoice = noteVoice === firstVoice;

        const isChord = child.querySelector("chord") !== null;
        const restEl = child.querySelector("rest");
        const isRest = restEl !== null;
        const isFullMeasureRest = restEl?.getAttribute("measure") === "yes";

        const rawDur = child.querySelector("duration")?.textContent;
        const durDivs = rawDur !== undefined
          ? parseInt(rawDur, 10)
          : (isFullMeasureRest ? Math.round(nominalQuarterBeats * divisions) : divisions);

        const quarterBeats = isFullMeasureRest
          ? nominalQuarterBeats
          : (durDivs / divisions);

        const typeText = child.querySelector("type")?.textContent?.trim() || "";
        const dots = child.querySelectorAll("dot").length;

        const beatOffset = (cursorDivisions / divisions) / quarterUnit;
        const durationBeats = quarterBeats / quarterUnit;

        if (!isRest) {
          const step = child.querySelector("pitch > step")?.textContent?.trim() || "C";
          const alter = parseInt(child.querySelector("pitch > alter")?.textContent || "0", 10);
          const octave = child.querySelector("pitch > octave")?.textContent?.trim() || "3";
          const acc = alter === 1 ? "#" : alter === -1 ? "b" : "";
          const pitchStr = `${step}${acc}${octave}`;

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

          if (isCello && isPrimaryVoice) {
            measures[mIdx].visualNotes.push({
              vexKey: `${step.toLowerCase()}${acc}/${octave}`,
              vexDuration: quarterDurationToVex(quarterBeats, typeText, dots, false),
              accidental: acc || null,
              isChord,
              isRest: false
            });
          }
        } else if (isCello && isPrimaryVoice) {
          const restKey = currentClef === "bass" ? "d/3" : currentClef === "tenor" ? "a/3" : "b/4";
          measures[mIdx].visualNotes.push({
            vexKey: restKey,
            vexDuration: quarterDurationToVex(quarterBeats, typeText, dots, true),
            accidental: null,
            isChord: false,
            isRest: true
          });
        }

        if (!isChord) {
          cursorDivisions += durDivs;
          if (cursorDivisions > maxDivisionsReached) maxDivisionsReached = cursorDivisions;
        }
      });

      if (isCello) {
        const measuredQuarters = maxDivisionsReached / divisions;
        measures[mIdx].actualQuarterBeats = measuredQuarters > 0 ? measuredQuarters : nominalQuarterBeats;
      }
    });
  });

  return measures;
}

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

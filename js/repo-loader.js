/* ==========================================================================
   MODULE 3: js/repo-loader.js
   Fetches the Bach Chorales catalog from GitHub (music21 corpus), downloads
   selected .mxl / .xml scores, unzips .mxl archives in-browser, and validates
   the MusicXML structure.
   ========================================================================== */

const BACH_CORPUS_API =
  "https://api.github.com/repos/cuthbertLab/music21/contents/music21/corpus/bach";
const BACH_CORPUS_RAW_BASE =
  "https://raw.githubusercontent.com/cuthbertLab/music21/master/music21/corpus/bach/";

const JSZIP_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

/**
 * Fallback starter list in case GitHub's unauthenticated API rate-limit (60 req/hr)
 * is temporarily reached on a shared IP.
 */
const FALLBACK_CHORALES = [
  { name: "bwv1.6.mxl", title: "BWV 1.6 - Wie schön leuchtet der Morgenstern" },
  { name: "bwv2.6.mxl", title: "BWV 2.6 - Ach Gott, vom Himmel sieh darein" },
  { name: "bwv3.6.mxl", title: "BWV 3.6 - Ach Gott, wie manches Herzeleid" },
  { name: "bwv4.8.mxl", title: "BWV 4.8 - Christ lag in Todesbanden" },
  { name: "bwv5.7.mxl", title: "BWV 5.7 - Wo soll ich fliehen hin" },
  { name: "bwv6.6.mxl", title: "BWV 6.6 - Erhalt uns, Herr, bei deinem Wort" },
  { name: "bwv7.7.mxl", title: "BWV 7.7 - Christ unser Herr zum Jordan kam" },
  { name: "bwv9.7.mxl", title: "BWV 9.7 - Es ist das Heil uns kommen her" },
  { name: "bwv10.7.mxl", title: "BWV 10.7 - Meine Seel erhebt den Herren" },
  { name: "bwv11.6.mxl", title: "BWV 11.6 - Nun lob, mein Seel, den Herren" }
];

function loadJSZip() {
  if (window.JSZip) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = JSZIP_CDN;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load JSZip from CDN."));
    document.head.appendChild(script);
  });
}

/**
 * Fetches the list of available Bach chorale files (.mxl / .xml) from GitHub.
 * @returns {Promise<{source: string, items: Array<{name: string, title: string, url: string}>}>}
 */
export async function fetchBachChoraleList() {
  try {
    const res = await fetch(BACH_CORPUS_API);
    if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);

    const files = await res.json();
    const chorales = files
      .filter(f => f.type === "file" && /\.(mxl|xml)$/i.test(f.name) && f.name.startsWith("bwv"))
      .map(f => ({
        name: f.name,
        title: f.name.replace(/\.(mxl|xml)$/i, "").toUpperCase(),
        url: f.download_url || `${BACH_CORPUS_RAW_BASE}${f.name}`
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    if (chorales.length === 0) {
      throw new Error("No chorale files returned from API.");
    }

    return { source: "GitHub Live API (cuthbertLab/music21)", items: chorales };
  } catch (err) {
    console.warn("Using fallback chorale list:", err.message);
    return {
      source: `Fallback List (${err.message})`,
      items: FALLBACK_CHORALES.map(c => ({
        ...c,
        url: `${BACH_CORPUS_RAW_BASE}${c.name}`
      }))
    };
  }
}

/**
 * Unzips a binary .mxl ArrayBuffer and extracts the root MusicXML string.
 */
export async function extractXmlFromMxl(arrayBuffer) {
  await loadJSZip();
  const zip = await window.JSZip.loadAsync(arrayBuffer);

  let rootXmlPath = null;
  const containerFile = zip.file("META-INF/container.xml");
  if (containerFile) {
    const containerText = await containerFile.async("text");
    const match = containerText.match(/full-path="([^"]+)"/);
    if (match && match[1]) rootXmlPath = match[1];
  }

  if (!rootXmlPath || !zip.file(rootXmlPath)) {
    const candidates = Object.keys(zip.files).filter(
      name => name.toLowerCase().endsWith(".xml") && !name.startsWith("META-INF/")
    );
    if (candidates.length > 0) rootXmlPath = candidates[0];
  }

  if (!rootXmlPath || !zip.file(rootXmlPath)) {
    throw new Error("No internal .xml score file found inside the .mxl archive.");
  }

  return await zip.file(rootXmlPath).async("text");
}

/**
 * Downloads a score URL (.mxl or .xml), unzips if needed, and validates the XML.
 * @param {string} url
 * @returns {Promise<{xmlString: string, summary: Object}>}
 */
export async function fetchAndInspectScore(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }

  let xmlString = "";
  if (url.toLowerCase().endsWith(".mxl")) {
    const buffer = await res.arrayBuffer();
    xmlString = await extractXmlFromMxl(buffer);
  } else {
    xmlString = await res.text();
  }

  if (!xmlString.includes("<score-partwise") && !xmlString.includes("<score-timewise")) {
    throw new Error("Downloaded file is not valid MusicXML (<score-partwise> missing).");
  }

  // Parse XML using native browser DOMParser to inspect parts, measures, and bass notes
  const doc = new DOMParser().parseFromString(xmlString, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("XML syntax error: " + parseError.textContent.slice(0, 120));
  }

  const workTitle =
    doc.querySelector("work > work-title")?.textContent?.trim() ||
    doc.querySelector("movement-title")?.textContent?.trim() ||
    "Untitled Chorale";

  const partList = Array.from(doc.querySelectorAll("part-list > score-part")).map(sp => ({
    id: sp.getAttribute("id"),
    name: sp.querySelector("part-name")?.textContent?.trim() || sp.getAttribute("id")
  }));

  const parts = Array.from(doc.querySelectorAll("score-partwise > part"));
  const bassPart = parts[parts.length - 1]; // Bottom voice (Bass/Cello) is the last part
  const bassMeasures = bassPart ? Array.from(bassPart.querySelectorAll("measure")) : [];

  // Extract time signatures encountered in the bass part
  const meters = [];
  bassMeasures.forEach((m, idx) => {
    const beats = m.querySelector("attributes > time > beats")?.textContent;
    const beatType = m.querySelector("attributes > time > beat-type")?.textContent;
    if (beats && beatType) {
      meters.push(`Bar ${idx + 1}: ${beats}/${beatType}`);
    }
  });

  // Preview first 4 bars of Bass/Cello pitches
  const previewBars = bassMeasures.slice(0, 4).map((m, idx) => {
    const notes = Array.from(m.querySelectorAll("note")).map(n => {
      if (n.querySelector("rest")) return "Rest";
      const step = n.querySelector("pitch > step")?.textContent || "?";
      const alter = parseInt(n.querySelector("pitch > alter")?.textContent || "0", 10);
      const oct = n.querySelector("pitch > octave")?.textContent || "";
      const acc = alter === 1 ? "#" : alter === -1 ? "b" : "";
      return `${step}${acc}${oct}`;
    });
    return `Bar ${idx + 1}: [${notes.join(", ")}]`;
  });

  return {
    xmlString,
    summary: {
      workTitle,
      partCount: partList.length,
      partNames: partList.map(p => p.name),
      measureCount: bassMeasures.length,
      meters: meters.length ? meters : ["4/4 (default)"],
      previewBars
    }
  };
}

/* ==========================================================================
   MODULE 3: js/repo-loader.js
   Fetches the Bach Chorales catalog from GitHub (music21 corpus), downloads
   selected .mxl / .xml scores, unzips .mxl archives in-browser, and extracts
   the BWV catalog number + German chorale title (with MacRoman encoding fix).
   ========================================================================== */

const BACH_CORPUS_API =
  "https://api.github.com/repos/cuthbertLab/music21/contents/music21/corpus/bach";
const BACH_CORPUS_RAW_BASE =
  "https://raw.githubusercontent.com/cuthbertLab/music21/master/music21/corpus/bach/";

const JSZIP_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

const BWV_GERMAN_TITLES = {
  "bwv1.6": "Wie schön leuchtet der Morgenstern",
  "bwv2.6": "Ach Gott, vom Himmel sieh darein",
  "bwv3.6": "Ach Gott, wie manches Herzeleid",
  "bwv4.8": "Christ lag in Todesbanden",
  "bwv5.7": "Wo soll ich fliehen hin",
  "bwv6.6": "Erhalt uns, Herr, bei deinem Wort",
  "bwv7.7": "Christ unser Herr zum Jordan kam",
  "bwv8.6": "Liebster Gott, wenn werd ich sterben",
  "bwv9.7": "Es ist das Heil uns kommen her",
  "bwv10.7": "Meine Seel erhebt den Herren",
  "bwv11.6": "Nun lob, mein Seel, den Herren",
  "bwv12.7": "Was Gott tut, das ist wohlgetan",
  "bwv13.6": "O Welt, ich muss dich lassen",
  "bwv14.5": "Wär Gott nicht mit uns diese Zeit",
  "bwv16.6": "Helft mir Gotts Güte preisen",
  "bwv17.7": "Nun lob, mein Seel, den Herren",
  "bwv18.5": "Durch Adams Fall ist ganz verderbt",
  "bwv19.7": "Freu dich sehr, o meine Seele",
  "bwv20.7": "O Ewigkeit, du Donnerwort",
  "bwv20.11": "O Ewigkeit, du Donnerwort",
  "bwv24.6": "O Gott, du frommer Gott",
  "bwv25.6": "Treuer Gott, ich muss dir klagen",
  "bwv26.6": "Ach wie flüchtig, ach wie nichtig",
  "bwv27.6": "Welt, ade! ich bin dein müde",
  "bwv28.6": "Helft mir Gotts Güte preisen",
  "bwv29.8": "Nun lob, mein Seel, den Herren",
  "bwv30.6": "Freu dich sehr, o meine Seele",
  "bwv31.9": "Wenn mein Stündlein vorhanden ist",
  "bwv32.6": "Weg, mein Herz, mit den Gedanken",
  "bwv33.6": "Allein zu dir, Herr Jesu Christ",
  "bwv36.4-2": "Nun komm, der Heiden Heiland",
  "bwv36.8-2": "Wie schön leuchtet der Morgenstern",
  "bwv37.6": "Ich dank dir, lieber Herre",
  "bwv38.6": "Aus tiefer Not schrei ich zu dir",
  "bwv39.7": "Freu dich sehr, o meine Seele",
  "bwv40.3": "Wir Christenleut",
  "bwv40.6": "Schwing dich auf zu deinem Gott",
  "bwv40.8": "Freuet euch, ihr Christen alle",
  "bwv41.6": "Jesu, nun sei gepreiset",
  "bwv42.7": "Verleih uns Frieden gnädiglich",
  "bwv43.11": "Ermuntre dich, mein schwacher Geist",
  "bwv44.7": "O Welt, ich muss dich lassen",
  "bwv45.7": "O Gott, du frommer Gott",
  "bwv46.6": "O großer Gott von Macht",
  "bwv47.5": "Warum betrübst du dich, mein Herz",
  "bwv48.3": "Ach Gott und Herr",
  "bwv48.7": "Herr Jesu Christ, einiger Gotts Sohn",
  "bwv55.5": "Werde munter, mein Gemüte",
  "bwv56.5": "Du, o schönes Weltgebäude",
  "bwv57.8": "Hast du denn, Jesu, dein Angesicht gänzlich verborgen",
  "bwv59.3": "Komm, Heiliger Geist, Herre Gott",
  "bwv60.5": "Es ist genug",
  "bwv62.6": "Nun komm, der Heiden Heiland",
  "bwv64.2": "Gelobet seist du, Jesu Christ",
  "bwv64.4": "Was frag ich nach der Welt",
  "bwv64.8": "Jesu, meine Freude",
  "bwv65.2": "Puer natus in Bethlehem",
  "bwv65.7": "Was mein Gott will, das g'scheh allzeit",
  "bwv66.6": "Christ ist erstanden",
  "bwv67.4": "Erschienen ist der herrliche Tag",
  "bwv67.7": "Du Friedefürst, Herr Jesu Christ",
  "bwv68.2": "Also hat Gott die Welt geliebt",
  "bwv69.6": "Es woll uns Gott genädig sein",
  "bwv70.7": "Freu dich sehr, o meine Seele",
  "bwv70.11": "Meinen Jesum lass ich nicht",
  "bwv72.6": "Was mein Gott will, das g'scheh allzeit",
  "bwv73.5": "Von Gott will ich nicht lassen",
  "bwv74.8": "Gott Vater, sende deinen Geist",
  "bwv77.6": "Ach Gott, vom Himmel sieh darein",
  "bwv78.7": "Jesu, der du meine Seele",
  "bwv79.3": "Nun danket alle Gott",
  "bwv79.6": "Nun lasst uns Gott dem Herren",
  "bwv80.8": "Ein feste Burg ist unser Gott",
  "bwv81.7": "Jesu, meine Freude",
  "bwv83.5": "Mit Fried und Freud ich fahr dahin",
  "bwv84.5": "Wer nur den lieben Gott lässt walten",
  "bwv85.6": "Ist Gott mein Schild und Helfersmann",
  "bwv86.6": "Es ist das Heil uns kommen her",
  "bwv87.7": "Jesu, meine Freude",
  "bwv88.7": "Wer nur den lieben Gott lässt walten",
  "bwv89.6": "Wo soll ich fliehen hin",
  "bwv90.5": "Vater unser im Himmelreich",
  "bwv91.6": "Gelobet seist du, Jesu Christ",
  "bwv92.9": "Ich hab in Gottes Herz und Sinn",
  "bwv93.7": "Wer nur den lieben Gott lässt walten",
  "bwv94.8": "Was frag ich nach der Welt",
  "bwv95.7": "Wenn mein Stündlein vorhanden ist",
  "bwv96.6": "Herr Christ, der einge Gottessohn",
  "bwv97.9": "In allen meinen Taten",
  "bwv99.6": "Was Gott tut, das ist wohlgetan",
  "bwv100.6": "Was Gott tut, das ist wohlgetan",
  "bwv101.7": "Nimm von uns, Herr, du treuer Gott",
  "bwv102.7": "Vater unser im Himmelreich",
  "bwv103.6": "Barmherzger Vater, höchster Gott",
  "bwv104.6": "Der Herr ist mein getreuer Hirt",
  "bwv108.6": "Gott Vater, sende deinen Geist",
  "bwv110.7": "Wir Christenleut",
  "bwv111.6": "Was mein Gott will, das g'scheh allzeit",
  "bwv112.5": "Der Herr ist mein getreuer Hirt",
  "bwv113.8": "Herr Jesu Christ, du höchstes Gut",
  "bwv114.7": "Ach, lieben Christen, seid getrost",
  "bwv115.6": "Straf mich nicht in deinem Zorn",
  "bwv116.6": "Du Friedefürst, Herr Jesu Christ",
  "bwv117.4": "Sei Lob und Ehr dem höchsten Gut",
  "bwv119.9": "Herr Gott, dich loben wir",
  "bwv121.6": "Christum wir sollen loben schon",
  "bwv122.6": "Das neugeborne Kindelein",
  "bwv123.6": "Liebster Immanuel, Herzog der Frommen",
  "bwv124.6": "Meinen Jesum lass ich nicht",
  "bwv125.6": "Mit Fried und Freud ich fahr dahin",
  "bwv126.6": "Erhalt uns, Herr, bei deinem Wort",
  "bwv127.5": "Herr Jesu Christ, wahr' Mensch und Gott",
  "bwv128.5": "O Jesu, meine Lust",
  "bwv130.6": "Herr Gott, dich loben alle wir",
  "bwv133.6": "Ich freue mich in dir",
  "bwv135.6": "Ach Herr, mich armen Sünder",
  "bwv136.6": "Auf meinen lieben Gott",
  "bwv137.5": "Lobe den Herren, den mächtigen König der Ehren",
  "bwv140.7": "Wachet auf, ruft uns die Stimme",
  "bwv144.3": "Was Gott tut, das ist wohlgetan",
  "bwv144.6": "Was mein Gott will, das g'scheh allzeit",
  "bwv145.5": "Erschienen ist der herrliche Tag",
  "bwv146.8": "Werde munter, mein Gemüte",
  "bwv148.6": "Wo soll ich fliehen hin",
  "bwv149.7": "Herzlich lieb hab ich dich, o Herr",
  "bwv151.5": "Lobt Gott, ihr Christen, allzugleich",
  "bwv153.1": "Schau, lieber Gott, wie meine Feind",
  "bwv153.5": "Befiehl du deine Wege",
  "bwv153.9": "Herr Jesu Christ, meins Lebens Licht",
  "bwv154.3": "Jesu, meiner Seelen Wonne",
  "bwv154.8": "Meinen Jesum lass ich nicht",
  "bwv155.5": "Es ist das Heil uns kommen her",
  "bwv156.6": "Herr, wie du willt, so schicks mit mir",
  "bwv157.5": "Meinen Jesum lass ich nicht",
  "bwv158.4": "Christ lag in Todesbanden",
  "bwv159.5": "Jesu Leiden, Pein und Tod",
  "bwv161.6": "Herzlich tut mich verlangen",
  "bwv162.6": "Alle Menschen müssen sterben",
  "bwv164.6": "Herr Christ, der einge Gottessohn",
  "bwv165.6": "Nun lasst uns Gott dem Herren",
  "bwv166.6": "Wer weiß, wie nahe mir mein Ende",
  "bwv168.6": "Herr Jesu Christ, du höchstes Gut",
  "bwv169.7": "Nun bitten wir den Heiligen Geist",
  "bwv171.6": "Jesu, nun sei gepreiset",
  "bwv172.6": "Wie schön leuchtet der Morgenstern",
  "bwv174.5": "Herzlich lieb hab ich dich, o Herr",
  "bwv175.7": "Komm, Heiliger Geist, Herre Gott",
  "bwv176.6": "Christ unser Herr zum Jordan kam",
  "bwv177.5": "Ich ruf zu dir, Herr Jesu Christ",
  "bwv179.6": "Ich armer Mensch, ich Sündenknecht",
  "bwv180.7": "Schmücke dich, o liebe Seele",
  "bwv183.5": "Helft mir Gotts Güte preisen",
  "bwv184.5": "O Herre Gott, dein göttlich Wort",
  "bwv185.6": "Ich ruf zu dir, Herr Jesu Christ",
  "bwv187.7": "Singen wir aus Herzensgrund",
  "bwv190.7": "Herr Gott, dich loben wir",
  "bwv194.6": "Treuer Gott, ich muss dir klagen",
  "bwv194.12": "Nun lasst uns Gott dem Herren",
  "bwv197.5": "Nun bitten wir den Heiligen Geist",
  "bwv197.10": "Wer nur den lieben Gott lässt walten",
  "bwv226.2": "Komm, Heiliger Geist, Herre Gott",
  "bwv227.1": "Jesu, meine Freude",
  "bwv227.7": "Jesu, meine Freude",
  "bwv227.11": "Jesu, meine Freude",
  "bwv229.2": "Komm, Jesu, komm",
  "bwv244.3": "Herzliebster Jesu, was hast du verbrochen",
  "bwv244.10": "Ich bins, ich sollte büßen",
  "bwv244.15": "Erkenne mich, mein Hüter",
  "bwv244.17": "Ich will hier bei dir stehen",
  "bwv244.25": "Was mein Gott will, das g'scheh allzeit",
  "bwv244.32": "Mir hat die Welt trüglich gericht'",
  "bwv244.37": "Wer hat dich so geschlagen",
  "bwv244.40": "Bin ich gleich von dir gewichen",
  "bwv244.44": "Befiehl du deine Wege",
  "bwv244.46": "Wie wunderbarlich ist doch diese Strafe",
  "bwv244.54": "O Haupt voll Blut und Wunden",
  "bwv244.62": "Wenn ich einmal soll scheiden",
  "bwv245.3": "O große Lieb, o Lieb ohn alle Maße",
  "bwv245.5": "Vater unser im Himmelreich",
  "bwv245.11": "Wer hat dich so geschlagen",
  "bwv245.14": "Petrus, der nicht denkt zurück",
  "bwv245.15": "Christus, der uns selig macht",
  "bwv245.17": "Ach großer König, groß zu allen Zeiten",
  "bwv245.22": "Durch dein Gefängnis, Gottes Sohn",
  "bwv245.26": "In meines Herzens Grunde",
  "bwv245.28": "Er nahm alles wohl in acht",
  "bwv245.37": "Christus, der uns selig macht",
  "bwv245.40": "Herzlich lieb hab ich dich, o Herr",
  "bwv248.5": "Wie soll ich dich empfangen",
  "bwv248.9-2": "Ach mein herzliebes Jesulein",
  "bwv248.12-2": "Brich an, o schönes Morgenlicht",
  "bwv248.17": "Schaut hin, dort liegt im finstern Stall",
  "bwv248.23-2": "Wir singen dir in deinem Heer",
  "bwv248.28": "Dies hat er alles uns getan",
  "bwv248.33": "Ich will dich mit Fleiß bewahren",
  "bwv248.35": "Seid froh dieweil",
  "bwv248.42-4": "Hilf, Herr Jesu, lass gelingen",
  "bwv248.46-5": "Dein Glanz all Finsternis verzehrt",
  "bwv248.53-5": "Zwar ist solche Herzensstube",
  "bwv248.59-6": "Ich steh an deiner Krippen hier",
  "bwv248.64-6": "Nun seid ihr wohl gerochen"
};

/**
 * Repairs legacy MacRoman -> Windows-1252 mojibake found in older music21
 * MusicXML headers (e.g., byte 0x9A decoded as 'š' instead of 'ö', 0x8A as 'Š' instead of 'ä').
 */
function fixGermanMojibake(str) {
  return str
    .replace(/š/g, "ö")
    .replace(/Š/g, "ä")
    .replace(/Ÿ/g, "ü")
    .replace(/…/g, "Ö")
    .replace(/€/g, "Ä")
    .replace(/†/g, "Ü")
    .replace(/§/g, "ß")
    .replace(/Ž/g, "é");
}

function formatCatalogEntry(filename) {
  const stem = filename.replace(/\.(mxl|xml)$/i, "").toLowerCase();
  const bwvLabel = stem.replace(/^bwv/i, "BWV ");
  const germanTitle = BWV_GERMAN_TITLES[stem] || "";
  return {
    name: filename,
    bwvLabel,
    germanTitle,
    title: germanTitle ? `${bwvLabel} — ${germanTitle}` : bwvLabel
  };
}

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

export async function fetchBachChoraleList() {
  try {
    const res = await fetch(BACH_CORPUS_API);
    if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);

    const files = await res.json();
    const chorales = files
      .filter(f => f.type === "file" && /\.(mxl|xml)$/i.test(f.name) && f.name.startsWith("bwv"))
      .map(f => ({
        ...formatCatalogEntry(f.name),
        url: f.download_url || `${BACH_CORPUS_RAW_BASE}${f.name}`
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    if (chorales.length === 0) {
      throw new Error("No chorale files returned from API.");
    }

    return { source: "GitHub Live API (cuthbertLab/music21)", items: chorales };
  } catch (err) {
    console.warn("Using fallback chorale list:", err.message);
    const items = Object.keys(BWV_GERMAN_TITLES).map(stem => {
      const filename = `${stem}.mxl`;
      return {
        ...formatCatalogEntry(filename),
        url: `${BACH_CORPUS_RAW_BASE}${filename}`
      };
    });
    return {
      source: `Fallback List (${err.message})`,
      items
    };
  }
}

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

function extractGermanTitleFromXml(doc, fallbackTitle = "") {
  const isFilenameOnly = str => /^bwv[\d.\-]+(\.(mxl|xml))?$/i.test(str.trim());

  const candidates = [
    doc.querySelector("movement-title")?.textContent,
    doc.querySelector("work > work-title")?.textContent,
    ...Array.from(doc.querySelectorAll("credit > credit-words")).map(el => el.textContent)
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    // Repair legacy MacRoman encoding and strip any leading "BWV 1.6 " prefix
    let cleaned = fixGermanMojibake(raw.trim().replace(/\s+/g, " "));
    cleaned = cleaned.replace(/^bwv\s*[\d.\-]+\s*[:\-—]?\s*/i, "").trim();

    if (
      cleaned.length > 2 &&
      !isFilenameOnly(cleaned) &&
      !/^j\.?\s*s\.?\s*bach$/i.test(cleaned) &&
      !/^johann sebastian bach$/i.test(cleaned) &&
      !/^music21/i.test(cleaned)
    ) {
      return cleaned;
    }
  }

  return fallbackTitle;
}

export async function fetchAndInspectScore(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }

  const filename = url.split("/").pop() || "";
  const catalogMeta = formatCatalogEntry(filename);

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

  const doc = new DOMParser().parseFromString(xmlString, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("XML syntax error: " + parseError.textContent.slice(0, 120));
  }

  const germanTitle = extractGermanTitleFromXml(doc, catalogMeta.germanTitle);
  const fullDisplayTitle = germanTitle
    ? `${catalogMeta.bwvLabel} — ${germanTitle}`
    : catalogMeta.bwvLabel;

  const partList = Array.from(doc.querySelectorAll("part-list > score-part")).map(sp => ({
    id: sp.getAttribute("id"),
    name: sp.querySelector("part-name")?.textContent?.trim() || sp.getAttribute("id")
  }));

  const parts = Array.from(doc.querySelectorAll("score-partwise > part"));
  const bassPart = parts[parts.length - 1];
  const bassMeasures = bassPart ? Array.from(bassPart.querySelectorAll("measure")) : [];

  const meters = [];
  bassMeasures.forEach((m, idx) => {
    const beats = m.querySelector("attributes > time > beats")?.textContent;
    const beatType = m.querySelector("attributes > time > beat-type")?.textContent;
    if (beats && beatType) {
      meters.push(`Bar ${idx + 1}: ${beats}/${beatType}`);
    }
  });

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
      bwvLabel: catalogMeta.bwvLabel,
      germanTitle,
      workTitle: fullDisplayTitle,
      partCount: partList.length,
      partNames: partList.map(p => p.name),
      measureCount: bassMeasures.length,
      meters: meters.length ? meters : ["4/4 (default)"],
      previewBars
    }
  };
}

// Wortzeiten an den tatsächlichen Sprechverlauf anpassen.
//
// Whisper legt Wörter nach langen Pausen oft zu früh (Proteste_reel: „Talkshows“ 1,7 s zu früh, die
// folgenden Wörter des Satzes ebenfalls). Bewusst vorsichtig: angefasst werden nur Sätze, deren Wörter
// laut Lautstärke in einer echten Stille liegen. Diese Sätze werden auf die tatsächlichen Sprechabschnitte
// nach der Stille verteilt (Pausen im Ton = wahrscheinliche Wortgrenzen, sonst nach Silbenzahl).
import { spawnSync } from "node:child_process";

export const HOP = 0.02; // 20 ms je Analysefenster
const SR = 16000;

/** Lautstärkeverlauf (dB je 20 ms) aus einer Mediendatei. */
export function loudness(file) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", String(SR), "-f", "s16le", "-"], {
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`ffmpeg: ${String(r.stderr).slice(-300)}`);
  const pcm = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 2));
  const size = Math.round(SR * HOP);
  const n = Math.floor(pcm.length / size);
  const db = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = i * size; k < (i + 1) * size; k++) sum += pcm[k] * pcm[k];
    db[i] = 20 * Math.log10(Math.sqrt(sum / size) / 32768 + 1e-9);
  }
  return db;
}

function percentile(arr, p) {
  const s = Float32Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.floor((p / 100) * s.length)))];
}

/** Stille-Abschnitte [start, end] in Sekunden (mindestens minLen lang). */
export function silences(db, { minLen = 0.06 } = {}) {
  const thr = Math.max(percentile(db, 10) + 12, percentile(db, 50) - 30);
  const out = [];
  let s = -1;
  for (let i = 0; i <= db.length; i++) {
    const quiet = i < db.length && db[i] < thr;
    if (quiet && s < 0) s = i;
    if (!quiet && s >= 0) {
      if ((i - s) * HOP >= minLen) out.push([s * HOP, i * HOP]);
      s = -1;
    }
  }
  return out;
}

export function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-zäöüß0-9]/g, "");
  if (/^\d+$/.test(w)) return Math.max(2, Math.round(w.length * 1.5));
  return Math.max(1, (w.match(/[aeiouyäöü]+/g) ?? []).length);
}

const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
const SENTENCE_END = /[.!?…]["»”]?$/;

/**
 * @param {Array<{text:string,start:number,end:number}>} words
 * @param {Float32Array} db Lautstärke je 20 ms
 * @returns {{ words: Array<{text:string,start:number,end:number}>, changed: Array<{text:string, from:number, to:number}> }}
 */
export function fixWordTimes(words, db) {
  const out = words.map((w) => ({ ...w }));
  const changed = [];
  // Ohne klaren Abstand zwischen Sprache und Pause (Musik, Straßenlärm) lieber nichts anfassen.
  const range = percentile(db, 90) - percentile(db, 10);
  if (range < 30) return { words: out, changed, skipped: `Ton zu wenig Dynamik (${range.toFixed(0)} dB) – Wortzeiten unverändert` };
  const sil = silences(db);
  const longSil = sil.filter(([a, b]) => b - a >= 0.3);
  const silenceIn = (a, b) => sil.reduce((acc, [s, e]) => acc + overlap(a, b, s, e), 0);
  const nextSilenceStart = (t) => sil.find(([s, e]) => e > t + 1e-6)?.[0] ?? db.length * HOP;

  let i = 0;
  while (i < out.length) {
    const w = out[i];
    const dur = Math.max(0.02, w.end - w.start);
    // Wortanfang liegt mitten in einer langen Stille, die nach dem Anfang noch ≥ 0,2 s weitergeht.
    const big = longSil.find(([s, e]) => w.start >= s - 0.02 && e - w.start >= 0.2);
    if (!big || silenceIn(w.start, w.end) / dur < 0.6) {
      i++;
      continue;
    }
    if (big[1] - w.start < 0.8) {
      // Kleine Verschiebung: nur dieses Wort an den Sprechbeginn, Nachfolger nur bei Überlappung nachziehen.
      changed.push({ text: w.text, from: w.start, to: Number(big[1].toFixed(3)) });
      w.start = Number(big[1].toFixed(3));
      w.end = Math.max(w.end, Number((w.start + 0.08).toFixed(3)));
      for (let q = i + 1; q < out.length && out[q].start < out[q - 1].end; q++) {
        out[q].start = out[q - 1].end;
        out[q].end = Math.max(out[q].end, Number((out[q].start + 0.05).toFixed(3)));
      }
      i++;
      continue;
    }
    // Satz ab diesem Wort: bis Satzende, große Lücke im Transkript oder 16 Wörter.
    let k = i;
    while (k < out.length - 1 && k - i < 15 && !SENTENCE_END.test(out[k].text) && out[k + 1].start - out[k].end < 0.6) k++;
    const onset = big[1];
    let end = Math.max(out[k].end, onset + 0.15 * (k - i + 1));
    // Satzende im Ton: bis zur nächsten Pause (falls das Transkript-Ende mitten in Sprache liegt).
    if (silenceIn(end - 0.02, end) < 0.02) end = nextSilenceStart(end);
    else end = sil.filter(([s]) => s < end && s > onset).reduce((acc, [s]) => s, end);
    if (end - onset < 0.1 * (k - i + 1)) {
      i = k + 1;
      continue;
    }
    // Sprechabschnitte zwischen onset und end.
    const segs = [];
    let cur = onset;
    for (const [s, e] of sil) {
      if (e <= onset || s >= end) continue;
      if (s > cur) segs.push([cur, s]);
      cur = Math.max(cur, e);
    }
    if (cur < end) segs.push([cur, end]);
    const phrase = out.slice(i, k + 1);
    const syl = phrase.map((p) => syllables(p.text) + 0.3);
    const total = segs.reduce((a, [s, e]) => a + (e - s), 0);
    const rate = total / syl.reduce((a, b) => a + b, 0);
    // Wörter monoton auf Abschnitte verteilen (DP), Kosten = log-Abweichung Abschnittsdauer ↔ Silbenmenge.
    const n = phrase.length;
    const m = segs.length;
    const INF = 1e9;
    const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(INF));
    const prev = Array.from({ length: n + 1 }, () => new Int32Array(m + 1).fill(-1));
    cost[0][0] = 0;
    const sylSum = (a, b) => syl.slice(a, b).reduce((x, y) => x + y, 0);
    for (let sj = 1; sj <= m; sj++) {
      const segDur = segs[sj - 1][1] - segs[sj - 1][0];
      for (let wi = 0; wi <= n; wi++) {
        // Abschnitt ohne Wort (Atmer, Geräusch): nur für kurze Abschnitte günstig.
        if (cost[wi][sj - 1] < INF) {
          const c = cost[wi][sj - 1] + (segDur < 0.15 ? 0.3 : 3);
          if (c < cost[wi][sj]) {
            cost[wi][sj] = c;
            prev[wi][sj] = wi;
          }
        }
        for (let a = 0; a < wi; a++) {
          if (cost[a][sj - 1] >= INF) continue;
          const expect = sylSum(a, wi) * rate;
          const c = cost[a][sj - 1] + Math.log(segDur / expect) ** 2 - (a > 0 && /[,;:]$/.test(phrase[a - 1].text) ? 0.1 : 0);
          if (c < cost[wi][sj]) {
            cost[wi][sj] = c;
            prev[wi][sj] = a;
          }
        }
      }
    }
    if (cost[n][m] >= INF) {
      i = k + 1;
      continue;
    }
    const assign = [];
    for (let wi = n, sj = m; sj > 0; sj--) {
      const a = prev[wi][sj];
      if (a < wi) assign.unshift([a, wi, segs[sj - 1]]);
      wi = a;
    }
    for (const [a, b, [s, e]] of assign) {
      const weights = syl.slice(a, b);
      const sum = weights.reduce((x, y) => x + y, 0);
      let t = s;
      for (let q = a; q < b; q++) {
        const len = ((e - s) * weights[q - a]) / sum;
        const wq = phrase[q];
        const start = Number(t.toFixed(3));
        const stop = Number((t + len).toFixed(3));
        if (Math.abs(start - wq.start) >= 0.05) changed.push({ text: wq.text, from: wq.start, to: start });
        wq.start = start;
        wq.end = stop;
        t += len;
      }
    }
    i = k + 1;
  }
  return { words: out, changed };
}

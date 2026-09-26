/**
 * Fulltextové vyhledávání (BM25) nad dokumenty – bez externí služby.
 * Běží na serveru (nástroj Vyhledávání) i v prohlížeči (Copilot nad
 * lokální knihovnou). Čeština: bez diakritiky + ořez na kmen (prefix),
 * což pokryje většinu skloňování („mostu“, „mostní“ → „most“).
 */

export interface Passage {
  doc: string;
  /** Pořadí pasáže v dokumentu. */
  index: number;
  text: string;
}

export interface Hit extends Passage {
  score: number;
  /** Zvýrazněné shody – indexy termů dotazu, které pasáž obsahuje. */
  matched: string[];
}

const STOP = new Set(
  "a aby aj ale ani ano asi az bez bude budou by byl byla byli bylo byt co ci da do ho i ja je jeho jej jeji jejich jen jeste ji jak jako k kam kde kdo kdy ke ktera ktere kteri ktery ma mate mi mit mne mu my na nad nam nas ne nebo neni nez nic nove ny o od on ona oni ono pak po pod podle pokud pro proc pred pri s se si sve svych ta tak take tam te tedy ten tento teto tim to tohoto toto tu ty u uz v ve vsak z za ze zda".split(
    " ",
  ),
);

export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Kmen: prvních 5 znaků u delších slov, čísla a kódy celé. */
export function stem(token: string): string {
  if (/\d/.test(token)) return token;
  return token.length > 6 ? token.slice(0, 5) : token.length > 4 ? token.slice(0, 4) : token;
}

export function tokenize(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9/]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}

/** Rozdělí dokument na pasáže ~ `size` znaků po odstavcích, s přesahem jedné věty. */
export function chunk(doc: string, text: string, size = 700): Passage[] {
  const paras = text.split(/\n\s*\n|\n(?=\s*(?:[A-Z]\.\d|\d+(?:\.\d+)*\s|[•\-–]\s))/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const out: Passage[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length > size) {
      out.push({ doc, index: out.length, text: cur });
      const lastSentence = cur.split(/(?<=[.!?])\s+/).pop() ?? "";
      cur = lastSentence.length < 200 ? `${lastSentence} ${p}` : p;
    } else cur = cur ? `${cur} ${p}` : p;
    while (cur.length > size * 2) {
      out.push({ doc, index: out.length, text: cur.slice(0, size) });
      cur = cur.slice(size - 100);
    }
  }
  if (cur) out.push({ doc, index: out.length, text: cur });
  return out;
}

export class Bm25Index {
  private passages: Passage[] = [];
  private tf: Map<string, number>[] = [];
  private lengths: number[] = [];
  private df = new Map<string, number>();
  private avgLen = 0;

  constructor(docs: { name: string; text: string }[], private k1 = 1.4, private b = 0.75) {
    for (const d of docs) this.passages.push(...chunk(d.name, d.text));
    for (const p of this.passages) {
      const toks = tokenize(p.text);
      const tf = new Map<string, number>();
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      this.tf.push(tf);
      this.lengths.push(toks.length);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
    this.avgLen = this.lengths.reduce((a, b) => a + b, 0) / Math.max(1, this.lengths.length);
  }

  get size() {
    return this.passages.length;
  }

  search(query: string, limit = 8): Hit[] {
    const terms = [...new Set(tokenize(query))];
    if (!terms.length) return [];
    const N = this.passages.length;
    const hits: Hit[] = [];
    this.passages.forEach((p, i) => {
      let score = 0;
      const matched: string[] = [];
      for (const t of terms) {
        const f = this.tf[i].get(t);
        if (!f) continue;
        matched.push(t);
        const df = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        score += idf * ((f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * this.lengths[i]) / this.avgLen)));
      }
      // bonus za pokrytí více termů dotazu
      if (score > 0) hits.push({ ...p, score: score * (1 + matched.length / terms.length), matched });
    });
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

/** Úryvek kolem první shody – pro zobrazení výsledku. */
export function highlightSnippet(text: string, matched: string[], len = 280): string {
  const f = fold(text);
  let pos = -1;
  for (const m of matched) {
    const i = f.search(new RegExp(`(^|[^a-z0-9])${m.replace(/[/]/g, "\\/")}`));
    if (i >= 0 && (pos < 0 || i < pos)) pos = i;
  }
  if (pos < 0 || text.length <= len) return text.slice(0, len);
  const start = Math.max(0, pos - 80);
  return (start > 0 ? "…" : "") + text.slice(start, start + len) + (start + len < text.length ? "…" : "");
}

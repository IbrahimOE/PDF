// Volltextsuche über alle Seiten. Groß-/Kleinschreibung und Akzente werden ignoriert
// („ecole“ findet „École“, „strasse“ findet „Straße“).

const SPECIAL = { ß: 'ss', œ: 'oe', Œ: 'oe', æ: 'ae', Æ: 'ae', '’': "'", '‘': "'" };

function normChar(ch) {
  if (SPECIAL[ch]) return SPECIAL[ch];
  return ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Normalisiert einen Text und merkt sich, welches Originalzeichen zu welcher Position gehört. */
export function normalizeWithMap(str) {
  let norm = '';
  const map = [];
  let lastSpace = false;
  for (let i = 0; i < str.length; i++) {
    let n = normChar(str[i]);
    if (/\s/.test(n)) {
      if (lastSpace) continue;
      n = ' ';
      lastSpace = true;
    } else {
      lastSpace = false;
    }
    for (const c of n) {
      norm += c;
      map.push(i);
    }
  }
  return { norm, map };
}

export const normalize = (str) => normalizeWithMap(str).norm.trim();

const cache = new Map();
function prepared(page) {
  const k = page.key;
  let entry = cache.get(k);
  if (!entry || entry.text !== page.text || entry.headingRaw !== page.heading) {
    entry = {
      text: page.text,
      headingRaw: page.heading,
      body: normalizeWithMap(page.text || ''),
      heading: normalize(page.heading || ''),
    };
    cache.set(k, entry);
  }
  return entry;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function countOccurrences(haystack, needle) {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1 && n < 50) {
    n++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

/**
 * Durchsucht die Seiten. Treffer in Überschriften zählen am meisten.
 * @returns {Array<{page, score, headingMatch, snippet: {text, ranges}}>}
 */
export function searchPages(pages, query) {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(' ').filter(Boolean);
  const results = [];

  for (const page of pages) {
    const p = prepared(page);
    const all = `${p.heading} ${p.body.norm}`;
    if (!tokens.every((tok) => all.includes(tok))) continue;

    let score = 0;
    let headingMatch = false;
    if (p.heading) {
      if (p.heading === q) score += 120;
      else if (new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(q)}($|[^\\p{L}\\p{N}])`, 'u').test(p.heading)) score += 90;
      else if (p.heading.includes(q)) score += 60;
      else if (tokens.every((tok) => p.heading.includes(tok))) score += 40;
      headingMatch = score > 0;
    }
    score += Math.min(countOccurrences(p.body.norm, q), 10) * 3;
    score += tokens.reduce((s, tok) => s + Math.min(countOccurrences(p.body.norm, tok), 5), 0);

    results.push({ page, score, headingMatch, snippet: makeSnippet(page.text || '', p.body, tokens) });
  }

  return results.sort(
    (a, b) => b.score - a.score || a.page.fileOrder - b.page.fileOrder || a.page.index - b.page.index
  );
}

function makeSnippet(original, body, tokens) {
  const { norm, map } = body;
  const first = tokens.map((t) => norm.indexOf(t)).filter((i) => i !== -1);
  if (!original || !first.length) return { text: '', ranges: [] };
  const pos = map[Math.min(...first)];
  let start = Math.max(0, pos - 60);
  let end = Math.min(original.length, pos + 120);
  if (start > 0) {
    const ws = original.slice(start, pos).search(/\s/);
    if (ws !== -1) start += ws + 1;
  }
  if (end < original.length) {
    const ws = original.slice(pos, end).search(/\s\S*$/);
    if (ws > 0) end = pos + ws;
  }
  let text = original.slice(start, end).replace(/\s+/g, ' ');
  const prefix = start > 0 ? '… ' : '';
  const suffix = end < original.length ? ' …' : '';
  text = prefix + text.trim() + suffix;
  return { text, ranges: highlightRanges(text, tokens) };
}

/** Bereiche (Start/Ende im Originaltext), die zu den Suchbegriffen passen. */
export function highlightRanges(text, tokens) {
  const { norm, map } = normalizeWithMap(text);
  const ranges = [];
  for (const tok of tokens) {
    let i = norm.indexOf(tok);
    while (i !== -1) {
      const start = map[i];
      const end = map[i + tok.length - 1] + 1;
      ranges.push([start, end]);
      i = norm.indexOf(tok, i + tok.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

export function makeMatcher(query) {
  const tokens = normalize(query).split(' ').filter(Boolean);
  return (str) => {
    const n = normalize(str);
    return tokens.some((t) => n.includes(t));
  };
}

export function queryTokens(query) {
  return normalize(query).split(' ').filter(Boolean);
}

import { Movie, SearchFilters } from '../src/types.js';
import { MOOD_MAP } from './tmdb.js';

// Relevance pre-ranking. Discovery returns ~60-100 candidates but the LLM ranker only sees the top
// 40, so the cut has to be by relevance, not by the order results happened to arrive in.
//
// Two signals:
//  - lexical: overlap between the request (words, themes, moods and their expansions) and each
//    title's TMDB keywords, genres and synopsis. Always available.
//  - semantic: cosine similarity between embeddings of the request and each title's description.
//    Catches mood matches that share no words ("quietly devastating" ~ a grief drama). Used when an
//    embedding function is supplied (Gemini key present).

// cacheKey identifies the embedding model: vectors from different models aren't comparable.
export type EmbedFn = ((texts: string[], kind: 'query' | 'document') => Promise<number[][]>) & { cacheKey?: string };

const STOP = new Set([
  'the', 'and', 'for', 'with', 'something', 'anything', 'want', 'watch', 'like', 'movie', 'movies', 'show', 'shows',
  'series', 'film', 'films', 'that', 'this', 'about', 'some', 'feel', 'feeling', 'mood', 'from', 'but', 'not',
  'into', 'have', 'really', 'very', 'please', 'recommend', 'tonight', 'good', 'great', 'best', 'more', 'less',
]);

function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
}

export interface QueryProfile {
  text: string;
  terms: Map<string, number>; // term -> weight
}

export function buildQueryProfile(userMessage: string, filters: Partial<SearchFilters>): QueryProfile {
  const terms = new Map<string, number>();
  const add = (t: string, w: number) => {
    const k = t.toLowerCase().trim();
    if (k.length > 2 && !STOP.has(k)) terms.set(k, Math.max(terms.get(k) || 0, w));
  };

  for (const t of tokens(userMessage)) add(t, 1);
  for (const t of filters.themes || []) add(t, 2);
  for (const t of filters.subgenres || []) add(t, 1.5);
  for (const g of filters.genres || []) add(g, 1.5);
  for (const m of filters.moods || []) {
    add(m, 1.5);
    const mapped = MOOD_MAP[m.toLowerCase()];
    mapped?.keywords?.forEach(k => add(k, 1.5));
    mapped?.genres?.forEach(g => add(g, 1));
  }

  const text = [
    userMessage,
    filters.moods?.length ? `Mood: ${filters.moods.join(', ')}` : '',
    filters.themes?.length ? `Themes: ${filters.themes.join(', ')}` : '',
    filters.genres?.length ? `Genres: ${filters.genres.join(', ')}` : '',
    filters.similar_to_titles?.length ? `Similar to: ${filters.similar_to_titles.join(', ')}` : '',
  ].filter(Boolean).join('. ');

  return { text, terms };
}

export function describeForEmbedding(m: Movie): string {
  return [
    `${m.title} (${m.year || ''})`,
    m.genres.length ? `Genres: ${m.genres.join(', ')}` : '',
    m.themes?.length ? `Keywords: ${m.themes.slice(0, 12).join(', ')}` : '',
    m.synopsis,
  ].filter(Boolean).join('. ');
}

function lexicalScore(m: Movie, q: QueryProfile): number {
  const keywords = (m.themes || []).map(t => t.toLowerCase());
  const genres = m.genres.map(g => g.toLowerCase());
  const synopsis = m.synopsis.toLowerCase();
  let score = 0;
  let max = 0;
  for (const [term, w] of q.terms) {
    max += w * 3;
    if (keywords.some(k => k === term || k.includes(term))) score += w * 3;
    else if (genres.some(g => g.includes(term))) score += w * 2;
    else if (synopsis.includes(term)) score += w;
  }
  return max ? score / max : 0;
}

// A small prior so obscure, barely-rated titles don't win on a lucky word match.
function qualityPrior(m: Movie): number {
  const votes = Math.log10(Math.max(1, m.voteCount || 1)); // 0..~6
  const rating = (m.rating || 0) / 10;
  return Math.min(1, (votes / 5) * 0.5 + rating * 0.5);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

const docEmbeddingCache = new Map<string, number[]>();

async function semanticScores(movies: Movie[], q: QueryProfile, embed: EmbedFn): Promise<number[] | null> {
  try {
    const ns = embed.cacheKey || 'default';
    const key = (m: Movie) => `${ns}|${m.id}`;
    const missing = movies.filter(m => !docEmbeddingCache.has(key(m)));
    for (let i = 0; i < missing.length; i += 40) {
      const batch = missing.slice(i, i + 40);
      const vectors = await embed(batch.map(describeForEmbedding), 'document');
      batch.forEach((m, j) => vectors[j] && docEmbeddingCache.set(key(m), vectors[j]));
    }
    const [queryVec] = await embed([q.text], 'query');
    if (!queryVec) return null;
    const raw = movies.map(m => {
      const v = docEmbeddingCache.get(key(m));
      return v ? cosine(queryVec, v) : 0;
    });
    // Normalise to 0..1 within this candidate set; absolute cosine values cluster tightly.
    const lo = Math.min(...raw), hi = Math.max(...raw);
    return raw.map(r => (hi > lo ? (r - lo) / (hi - lo) : 0.5));
  } catch (err: any) {
    console.log('[Relevance] embeddings unavailable, lexical only:', err?.message || err);
    return null;
  }
}

export interface RankedCandidate {
  movie: Movie;
  relevance: number;
}

export async function rankByRelevance(
  movies: Movie[],
  userMessage: string,
  filters: Partial<SearchFilters>,
  embed?: EmbedFn,
  likedGenres: string[][] = [],
): Promise<RankedCandidate[]> {
  if (!movies.length) return [];
  const q = buildQueryProfile(userMessage, filters);
  const semantic = embed ? await semanticScores(movies, q, embed) : null;

  // Taste signal: genre overlap with titles the user liked.
  const likedGenreCounts = new Map<string, number>();
  for (const list of likedGenres) for (const g of list) likedGenreCounts.set(g.toLowerCase(), (likedGenreCounts.get(g.toLowerCase()) || 0) + 1);
  const likedTotal = [...likedGenreCounts.values()].reduce((a, b) => a + b, 0);

  const scored = movies.map((m, i) => {
    const lexical = lexicalScore(m, q);
    const prior = qualityPrior(m);
    // Discovery order carries TMDB's own relevance (seeds and keyword queries come first).
    const position = 1 - Math.min(1, i / Math.max(20, movies.length));
    const taste = likedTotal ? m.genres.reduce((s, g) => s + (likedGenreCounts.get(g.toLowerCase()) || 0), 0) / likedTotal : 0;

    const relevance = semantic
      ? semantic[i] * 0.45 + lexical * 0.25 + prior * 0.12 + position * 0.1 + Math.min(1, taste) * 0.08
      : lexical * 0.45 + prior * 0.2 + position * 0.25 + Math.min(1, taste) * 0.1;
    return { movie: m, relevance };
  });

  return scored.sort((a, b) => b.relevance - a.relevance);
}

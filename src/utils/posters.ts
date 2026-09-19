import { useEffect, useState } from 'react';
import { ContentType, Movie } from '../types';

// Official TMDB artwork looked up by title (+ year). Cached in memory and in localStorage for a
// week so repeat visits render real posters immediately.

export interface PosterQuery { title: string; year?: number; contentType?: ContentType }
export interface Art { posterUrl: string; backdropUrl: string }

const STORAGE_KEY = 'watchmatch_poster_cache_v2';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const keyOf = (q: PosterQuery) => `${q.title.trim()}|${q.year || ''}`;

let cache: Record<string, Art & { at: number }> = {};
try {
  cache = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
} catch {
  cache = {};
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full or unavailable: memory cache still works */
  }
}

const inflight = new Map<string, Promise<void>>();

export async function fetchPosters(queries: PosterQuery[]): Promise<Record<string, Art>> {
  const now = Date.now();
  const missing = queries.filter(q => q.title && !(cache[keyOf(q)] && now - cache[keyOf(q)].at < TTL_MS) && !inflight.has(keyOf(q)));
  for (let i = 0; i < missing.length; i += 40) {
    const batch = missing.slice(i, i + 40);
    const request = fetch('/api/posters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: batch }),
    })
      .then(r => (r.ok ? r.json() : { art: {} }))
      .then(({ art }) => {
        for (const [k, v] of Object.entries(art || {})) cache[k] = { ...(v as Art), at: Date.now() };
        persist();
      })
      .catch(() => {})
      .finally(() => batch.forEach(q => inflight.delete(keyOf(q))));
    batch.forEach(q => inflight.set(keyOf(q), request));
  }
  await Promise.all(queries.map(q => inflight.get(keyOf(q))).filter(Boolean));
  const out: Record<string, Art> = {};
  for (const q of queries) if (cache[keyOf(q)]) out[keyOf(q)] = cache[keyOf(q)];
  return out;
}

// React hook: returns a lookup that gives the real poster for a title once loaded ('' until then).
export function usePosters(queries: PosterQuery[]) {
  const signature = queries.map(keyOf).join('\n');
  const [, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchPosters(queries).then(() => alive && setVersion(v => v + 1));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return (q: PosterQuery): Art | undefined => cache[keyOf(q)];
}

// Movies saved before posters came from TMDB still carry stock photos; fetch their real art.
export function needsRealArt(m: Movie): boolean {
  return !m.posterUrl?.includes('image.tmdb.org') || /\/photo-/.test(m.posterUrl);
}

export async function refreshArt(movies: Movie[]): Promise<Movie[]> {
  const stale = movies.filter(needsRealArt);
  if (!stale.length) return [];
  const art = await fetchPosters(stale.map(m => ({ title: m.title, year: m.year, contentType: m.contentType })));
  const updated: Movie[] = [];
  for (const m of stale) {
    const a = art[keyOf({ title: m.title, year: m.year })];
    if (a) updated.push({ ...m, posterUrl: a.posterUrl, backdropUrl: a.backdropUrl });
  }
  return updated;
}

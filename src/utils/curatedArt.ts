import { curatedMovies } from '../data/curatedMovies';

/**
 * The bundled curated titles ship with placeholder artwork. Once the server can reach TMDB,
 * swap in the real posters/backdrops in place so every view that reads curatedMovies picks them up.
 * Returns true if anything changed (so the caller can trigger a re-render).
 */
export async function hydrateCuratedArt(): Promise<boolean> {
  try {
    const res = await fetch('/api/curated-art');
    if (!res.ok) return false;
    const { art } = await res.json();
    let changed = false;
    for (const m of curatedMovies) {
      const a = art?.[m.id];
      if (a?.posterUrl) {
        m.posterUrl = a.posterUrl;
        m.backdropUrl = a.backdropUrl || a.posterUrl;
        changed = true;
      }
    }
    return changed;
  } catch {
    return false;
  }
}

import { Movie, SearchFilters, ContentType } from '../src/types.js';

// TMDB client: attribute-based discovery, real posters, and real streaming providers.
//
// api.themoviedb.org is DNS-blocked on some Indian ISPs (Jio), so we default to the
// official alternate host api.tmdb.org. Images come from image.tmdb.org which is not blocked.

// Read lazily: server.ts runs dotenv.config() after its imports are evaluated.
const tmdbBase = () => (process.env.TMDB_API_HOST || 'https://api.tmdb.org/3').replace(/\/$/, '');
const IMG_BASE = 'https://image.tmdb.org/t/p';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

type MediaType = 'movie' | 'tv';

// ---------------------------------------------------------------------------
// Low-level fetch with auth, cache and visible errors
// ---------------------------------------------------------------------------

function credential(): string {
  return (process.env.TMDB_API_KEY || process.env.TMDB_READ_TOKEN || '').trim();
}

export function isTmdbConfigured(): boolean {
  const c = credential();
  return c.length > 0 && c !== 'MY_TMDB_API_KEY';
}

const responseCache = new Map<string, { at: number; data: any }>();
let lastErrorLogged = '';

async function tmdb<T = any>(path: string, params: Record<string, string | number | boolean | undefined | null> = {}): Promise<T | null> {
  if (!isTmdbConfigured()) return null;

  const cred = credential();
  // v4 "Read Access Token" is a long JWT; v3 "API Key" is a 32-char hex string. Accept either.
  const isBearer = cred.length > 40;

  const url = new URL(`${tmdbBase()}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  if (!isBearer) url.searchParams.set('api_key', cred);

  const cacheKey = url.toString();
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data as T;

  try {
    const res = await fetch(url, {
      headers: isBearer ? { Authorization: `Bearer ${cred}`, accept: 'application/json' } : { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const msg = `[TMDB] ${res.status} on ${path}${res.status === 401 ? ' — TMDB_API_KEY is invalid' : ''}`;
      if (msg !== lastErrorLogged) {
        console.warn(msg);
        lastErrorLogged = msg;
      }
      return null;
    }
    const data = await res.json();
    responseCache.set(cacheKey, { at: Date.now(), data });
    return data as T;
  } catch (err: any) {
    const msg = `[TMDB] request failed on ${path}: ${err?.name === 'TimeoutError' ? 'timeout (is the host reachable?)' : err?.message || err}`;
    if (msg !== lastErrorLogged) {
      console.warn(msg);
      lastErrorLogged = msg;
    }
    return null;
  }
}

// Run async work with bounded concurrency so we stay well under TMDB's rate limit.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------------------------------------------------------------------------
// Reference data: genres, languages, countries, providers
// ---------------------------------------------------------------------------

const MOVIE_GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary',
  18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};

const TV_GENRES: Record<number, string> = {
  10759: 'Action & Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama',
  10751: 'Family', 10762: 'Kids', 9648: 'Mystery', 10763: 'News', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy',
  10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics', 37: 'Western',
};

// User-facing genre word -> TMDB genre ids per media type. TV has no Thriller/Horror/Romance
// genres, so those fall back to keywords (see GENRE_KEYWORD_FALLBACK) or the closest TV genre.
export const GENRE_ALIASES: Record<string, { movie: number[]; tv: number[] }> = {
  action: { movie: [28], tv: [10759] },
  adventure: { movie: [12], tv: [10759] },
  animation: { movie: [16], tv: [16] },
  animated: { movie: [16], tv: [16] },
  anime: { movie: [16], tv: [16] },
  comedy: { movie: [35], tv: [35] },
  crime: { movie: [80], tv: [80] },
  documentary: { movie: [99], tv: [99] },
  drama: { movie: [18], tv: [18] },
  family: { movie: [10751], tv: [10751] },
  fantasy: { movie: [14], tv: [10765] },
  history: { movie: [36], tv: [] },
  historical: { movie: [36], tv: [] },
  horror: { movie: [27], tv: [] },
  music: { movie: [10402], tv: [] },
  musical: { movie: [10402], tv: [] },
  mystery: { movie: [9648], tv: [9648] },
  romance: { movie: [10749], tv: [] },
  'sci-fi': { movie: [878], tv: [10765] },
  'science fiction': { movie: [878], tv: [10765] },
  thriller: { movie: [53], tv: [] },
  war: { movie: [10752], tv: [10768] },
  western: { movie: [37], tv: [37] },
  kids: { movie: [10751], tv: [10762] },
  reality: { movie: [], tv: [10764] },
};

// Where a genre has no TV equivalent, use a TMDB keyword instead.
const GENRE_KEYWORD_FALLBACK: Record<string, string> = {
  horror: 'horror',
  romance: 'romance',
  thriller: 'thriller',
  history: 'history',
  historical: 'period drama',
  music: 'music',
};

// Mood words -> genres and keywords. This is what turns "something dark and mind-bending" into real filters.
export const MOOD_MAP: Record<string, { genres?: string[]; keywords?: string[]; sort?: 'rating' }> = {
  dark: { keywords: ['neo-noir', 'psychological thriller', 'dark comedy', 'nihilism'] },
  gritty: { keywords: ['gritty', 'neo-noir'] },
  funny: { genres: ['comedy'] },
  'light-hearted': { genres: ['comedy'], keywords: ['feel-good'] },
  lighthearted: { genres: ['comedy'], keywords: ['feel-good'] },
  comforting: { keywords: ['feel-good', 'heartwarming'] },
  cozy: { keywords: ['feel-good', 'heartwarming'] },
  wholesome: { keywords: ['feel-good', 'heartwarming'] },
  'feel-good': { keywords: ['feel-good'] },
  heartwarming: { keywords: ['heartwarming'] },
  relaxing: { keywords: ['feel-good', 'slice of life'] },
  scary: { genres: ['horror'] },
  creepy: { genres: ['horror'], keywords: ['supernatural'] },
  intense: { genres: ['thriller'] },
  suspenseful: { genres: ['thriller'], keywords: ['suspense'] },
  'mind-bending': { keywords: ['mind-bending', 'plot twist', 'nonlinear timeline', 'time loop'], sort: 'rating' },
  twisty: { keywords: ['plot twist', 'twist ending'] },
  emotional: { genres: ['drama'], keywords: ['tearjerker', 'grief'] },
  sad: { genres: ['drama'], keywords: ['tearjerker', 'tragedy'] },
  painful: { genres: ['drama'], keywords: ['tragedy', 'heartbreak'] },
  tragic: { genres: ['drama'], keywords: ['tragedy', 'tragic love'] },
  heartbreaking: { genres: ['drama'], keywords: ['heartbreak', 'tearjerker'] },
  romantic: { genres: ['romance'] },
  inspiring: { keywords: ['inspirational', 'based on true story', 'underdog'] },
  inspirational: { keywords: ['inspirational', 'underdog'] },
  disturbing: { keywords: ['psychological thriller', 'disturbing'] },
  epic: { genres: ['adventure'], keywords: ['epic'] },
  nostalgic: { keywords: ['coming of age', 'nostalgia'] },
  thoughtful: { genres: ['drama'], keywords: ['philosophy'], sort: 'rating' },
  smart: { keywords: ['intelligent'], sort: 'rating' },
};

const LANGUAGE_ALIASES: Record<string, string> = {
  bollywood: 'hi', hindi: 'hi', tollywood: 'te', kollywood: 'ta', mollywood: 'ml',
  mandarin: 'zh', chinese: 'zh', cantonese: 'cn', 'k-drama': 'ko', kdrama: 'ko', 'j-drama': 'ja',
};

const COUNTRY_CODES: Record<string, string> = {
  india: 'IN', 'south korea': 'KR', korea: 'KR', japan: 'JP', 'united states': 'US', usa: 'US', america: 'US',
  'united kingdom': 'GB', uk: 'GB', britain: 'GB', spain: 'ES', france: 'FR', germany: 'DE', italy: 'IT',
  china: 'CN', 'hong kong': 'HK', taiwan: 'TW', thailand: 'TH', turkey: 'TR', mexico: 'MX', brazil: 'BR',
  argentina: 'AR', denmark: 'DK', sweden: 'SE', norway: 'NO', canada: 'CA', australia: 'AU', ireland: 'IE',
  'new zealand': 'NZ', russia: 'RU', iran: 'IR', nigeria: 'NG', pakistan: 'PK', indonesia: 'ID', philippines: 'PH',
};

const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

function languageName(code?: string): string {
  if (!code) return 'Unknown';
  if (code === 'cn') return 'Cantonese';
  try {
    return languageNames.of(code) || code;
  } catch {
    return code;
  }
}

function countryName(code?: string): string {
  if (!code) return '';
  try {
    return regionNames.of(code) || code;
  } catch {
    return code;
  }
}

let languageIndex: Map<string, string> | null = null;

async function getLanguageIndex(): Promise<Map<string, string>> {
  if (languageIndex) return languageIndex;
  const index = new Map<string, string>();
  const list = await tmdb<{ iso_639_1: string; english_name: string }[]>('/configuration/languages');
  for (const l of list || []) {
    if (l.english_name && l.english_name !== 'No Language') index.set(l.english_name.toLowerCase(), l.iso_639_1);
  }
  for (const [alias, code] of Object.entries(LANGUAGE_ALIASES)) index.set(alias, code);
  if (list) languageIndex = index;
  return index;
}

export async function languageCodeFor(name: string): Promise<string | null> {
  const n = name.toLowerCase().trim();
  if (/^[a-z]{2}$/.test(n)) return n;
  const index = await getLanguageIndex();
  return index.get(n) || null;
}

// Languages that users are likely to type in free text; used by the local (non-LLM) extractor.
export async function detectLanguagesInText(text: string): Promise<string[]> {
  const index = await getLanguageIndex();
  const found: string[] = [];
  const lower = ` ${text.toLowerCase()} `;
  for (const [name, code] of index) {
    if (name.length < 4) continue;
    if (new RegExp(`[^a-z]${name.replace(/[-]/g, '\\-')}[^a-z]`).test(lower)) {
      const display = languageName(code);
      if (!found.includes(display)) found.push(display);
    }
  }
  return found;
}

const providerIndex = new Map<string, Map<string, { id: number; name: string }>>();

async function getProviders(region: string): Promise<Map<string, { id: number; name: string }>> {
  if (providerIndex.has(region)) return providerIndex.get(region)!;
  const index = new Map<string, { id: number; name: string }>();
  const [movie, tv] = await Promise.all([
    tmdb<{ results: { provider_id: number; provider_name: string }[] }>('/watch/providers/movie', { watch_region: region }),
    tmdb<{ results: { provider_id: number; provider_name: string }[] }>('/watch/providers/tv', { watch_region: region }),
  ]);
  for (const p of [...(movie?.results || []), ...(tv?.results || [])]) {
    index.set(p.provider_name.toLowerCase(), { id: p.provider_id, name: p.provider_name });
  }
  if (movie || tv) providerIndex.set(region, index);
  return index;
}

const PROVIDER_ALIASES: Record<string, string[]> = {
  'prime video': ['amazon prime video'],
  prime: ['amazon prime video'],
  amazon: ['amazon prime video'],
  jiohotstar: ['jiohotstar', 'hotstar', 'disney plus hotstar'],
  hotstar: ['jiohotstar', 'hotstar', 'disney plus hotstar'],
  'disney+': ['jiohotstar', 'hotstar', 'disney plus hotstar', 'disney plus'],
  'apple tv': ['apple tv plus', 'apple tv+'],
  'apple tv+': ['apple tv plus', 'apple tv+'],
  zee5: ['zee5'],
  sonyliv: ['sony liv', 'sonyliv'],
  jiocinema: ['jiocinema', 'jiohotstar'],
};

async function providerIdsFor(names: string[], region: string): Promise<number[]> {
  if (!names.length) return [];
  const index = await getProviders(region);
  const ids = new Set<number>();
  for (const raw of names) {
    const n = raw.toLowerCase().trim();
    const candidates = PROVIDER_ALIASES[n] || [n];
    for (const [pname, p] of index) {
      if (candidates.some(c => pname === c || pname.startsWith(c))) ids.add(p.id);
    }
  }
  return [...ids];
}

const keywordCache = new Map<string, number | null>();

// Resolve a free-text theme ("time travel", "heist") to a TMDB keyword id. Only accept close
// name matches so we don't pollute discovery with unrelated keywords.
async function keywordIdFor(term: string): Promise<number | null> {
  const t = term.toLowerCase().trim();
  if (!t || t.length < 3) return null;
  if (keywordCache.has(t)) return keywordCache.get(t)!;
  const data = await tmdb<{ results: { id: number; name: string }[] }>('/search/keyword', { query: t });
  const results = data?.results || [];
  const norm = (x: string) => x.toLowerCase().replace(/[-_]/g, ' ').replace(/s$/, '').trim();
  const near = results.find(r => r.name.toLowerCase() === t) || results.find(r => norm(r.name) === norm(t));
  const id = near?.id ?? null;
  if (data) keywordCache.set(t, id);
  return id;
}

// ---------------------------------------------------------------------------
// Mapping TMDB objects to our Movie type
// ---------------------------------------------------------------------------

export function posterUrl(path?: string | null, size = 'w500'): string {
  return path ? `${IMG_BASE}/${size}${path}` : '';
}

function deriveMoods(genres: string[]): string[] {
  const moods = new Set<string>();
  for (const g of genres) {
    const l = g.toLowerCase();
    if (l.includes('horror')) moods.add('scary');
    if (l.includes('comedy')) moods.add('funny');
    if (l.includes('thriller') || l.includes('action')) moods.add('intense');
    if (l.includes('drama')) moods.add('emotional');
    if (l.includes('romance')) moods.add('romantic');
    if (l.includes('mystery') || l.includes('sci-fi')) moods.add('mind-bending');
    if (l.includes('family') || l.includes('animation')) moods.add('comforting');
  }
  return moods.size ? [...moods] : ['engaging'];
}

function contentTypeFor(media: MediaType, genreIds: number[], originalLanguage?: string, tvType?: string): ContentType {
  if (genreIds.includes(16) && originalLanguage === 'ja') return 'anime';
  if (genreIds.includes(99)) return 'documentary';
  if (media === 'movie') return 'movie';
  if (tvType === 'Miniseries') return 'limited_series';
  return 'series';
}

export function tmdbId(media: MediaType, id: number): string {
  return `tmdb_${media}_${id}`;
}

export function parseTmdbId(id: string): { media: MediaType; id: number } | null {
  const m = /^tmdb_(movie|tv)_(\d+)$/.exec(id);
  return m ? { media: m[1] as MediaType, id: Number(m[2]) } : null;
}

function mapListItem(item: any, mediaHint?: MediaType): Movie | null {
  const media: MediaType | undefined = item.media_type === 'movie' || item.media_type === 'tv' ? item.media_type : mediaHint;
  if (!media) return null;
  const title = media === 'movie' ? item.title : item.name;
  if (!title) return null;
  const date = media === 'movie' ? item.release_date : item.first_air_date;
  const year = date ? Number(String(date).slice(0, 4)) : 0;
  const genreIds: number[] = item.genre_ids || [];
  const map = media === 'movie' ? MOVIE_GENRES : TV_GENRES;
  const genres = genreIds.map(g => map[g]).filter(Boolean);
  const countries = (item.origin_country || []).map(countryName).filter(Boolean);

  return {
    id: tmdbId(media, item.id),
    title,
    year,
    contentType: contentTypeFor(media, genreIds, item.original_language),
    rating: Math.round((item.vote_average || 0) * 10) / 10,
    voteCount: item.vote_count || 0,
    runtime: 0,
    genres,
    moods: deriveMoods(genres),
    pace: 'medium',
    languages: [languageName(item.original_language)],
    countries,
    synopsis: item.overview || '',
    posterUrl: posterUrl(item.poster_path),
    backdropUrl: posterUrl(item.backdrop_path, 'w1280'),
    cast: [],
    platforms: [],
  };
}

// ---------------------------------------------------------------------------
// Details enrichment: runtime, seasons, cast, trailer, keywords, real providers
// ---------------------------------------------------------------------------

export async function getDetails(media: MediaType, id: number, region = 'IN'): Promise<Movie | null> {
  const append = media === 'movie'
    ? 'credits,videos,watch/providers,keywords'
    : 'aggregate_credits,videos,watch/providers,keywords';
  const d = await tmdb<any>(`/${media}/${id}`, { append_to_response: append });
  if (!d) return null;

  const genreIds: number[] = (d.genres || []).map((g: any) => g.id);
  const genres: string[] = (d.genres || []).map((g: any) => (media === 'movie' ? MOVIE_GENRES[g.id] : TV_GENRES[g.id]) || g.name);
  const date = media === 'movie' ? d.release_date : d.first_air_date;

  const providersForRegion = d['watch/providers']?.results?.[region] || {};
  const streaming = [...(providersForRegion.flatrate || []), ...(providersForRegion.free || []), ...(providersForRegion.ads || [])]
    .map((p: any) => p.provider_name as string);
  const platforms = [...new Set(streaming)];

  const castList = media === 'movie' ? d.credits?.cast : d.aggregate_credits?.cast;
  const cast = (castList || []).slice(0, 8).map((c: any) => c.name);

  const videos: any[] = d.videos?.results || [];
  const trailer = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official) ||
                  videos.find(v => v.site === 'YouTube' && v.type === 'Trailer') ||
                  videos.find(v => v.site === 'YouTube' && v.type === 'Teaser');

  const keywordList: any[] = media === 'movie' ? d.keywords?.keywords : d.keywords?.results;
  const themes = (keywordList || []).slice(0, 10).map((k: any) => k.name);

  const statusMap: Record<string, Movie['seriesStatus']> = {
    Ended: 'finished', Canceled: 'cancelled', 'Returning Series': 'ongoing', 'In Production': 'ongoing', Planned: 'ongoing',
  };
  const seriesStatus = media === 'tv'
    ? (d.type === 'Miniseries' && d.status === 'Ended' ? 'limited_series' : statusMap[d.status])
    : undefined;

  const runtime = media === 'movie'
    ? d.runtime || 0
    : d.episode_run_time?.[0] || d.last_episode_to_air?.runtime || 0;

  const countryCodes: string[] = d.origin_country?.length
    ? d.origin_country
    : (d.production_countries || []).map((c: any) => c.iso_3166_1);

  return {
    id: tmdbId(media, d.id),
    title: media === 'movie' ? d.title : d.name,
    year: date ? Number(String(date).slice(0, 4)) : 0,
    contentType: contentTypeFor(media, genreIds, d.original_language, d.type),
    rating: Math.round((d.vote_average || 0) * 10) / 10,
    voteCount: d.vote_count || 0,
    runtime,
    seasons: media === 'tv' ? d.number_of_seasons : undefined,
    episodes: media === 'tv' ? d.number_of_episodes : undefined,
    seriesStatus,
    genres,
    moods: deriveMoods(genres),
    themes,
    pace: 'medium',
    languages: [...new Set([languageName(d.original_language), ...(d.spoken_languages || []).map((l: any) => l.english_name).filter(Boolean)])],
    countries: countryCodes.map(countryName).filter(Boolean),
    synopsis: d.overview || '',
    posterUrl: posterUrl(d.poster_path),
    backdropUrl: posterUrl(d.backdrop_path, 'w1280'),
    cast,
    platforms,
    trailerUrl: trailer ? `https://www.youtube.com/embed/${trailer.key}` : undefined,
  };
}

// Replace list-level data with full details for TMDB titles. Non-TMDB titles are left untouched.
export async function enrichMovies(movies: Movie[], region = 'IN', concurrency = 8): Promise<Movie[]> {
  return mapLimit(movies, concurrency, async m => {
    const parsed = parseTmdbId(m.id);
    if (!parsed) return m;
    const full = await getDetails(parsed.media, parsed.id, region);
    return full || m;
  });
}

// ---------------------------------------------------------------------------
// Title search & matching
// ---------------------------------------------------------------------------

export async function searchTitles(query: string, pages = 1): Promise<Movie[]> {
  const results: Movie[] = [];
  for (let page = 1; page <= pages; page++) {
    const data = await tmdb<any>('/search/multi', { query, include_adult: false, page });
    for (const item of data?.results || []) {
      const m = mapListItem(item);
      if (m) results.push(m);
    }
    if (!data || page >= (data.total_pages || 1)) break;
  }
  return results;
}

// Find the TMDB entry for a title we got from somewhere else (curated list, OMDb, TVMaze).
const normTitle = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

// Find the TMDB entry for a title we got from somewhere else (curated list, collections, OMDb, TVMaze,
// saved movies). Searches films AND series and scores the candidates, because the first search hit
// is often wrong: "Dark" → The Dark Knight, "Chernobyl" → Chernobyl Diaries, "Severance" → a 2006 film.
export async function findTitle(title: string, year?: number, contentType?: ContentType): Promise<{ media: MediaType; id: number; posterUrl: string; backdropUrl: string } | null> {
  // "True Detective (Season 1)" → "True Detective"
  title = title.replace(/\s*[(\[](?:season|series|part|vol\.?|volume)\s*[\w ]*[)\]]\s*$/i, '').trim() || title;
  const wanted = normTitle(title);

  const search = async (media: MediaType) => {
    const yearParam = year ? (media === 'movie' ? { year } : { first_air_date_year: year }) : {};
    let data = await tmdb<any>(`/search/${media}`, { query: title, include_adult: false, ...yearParam });
    if (year && !data?.results?.length) data = await tmdb<any>(`/search/${media}`, { query: title, include_adult: false });
    return (data?.results || []).slice(0, 10).map((r: any) => ({ media, r }));
  };
  const candidates = (await Promise.all([search('movie'), search('tv')])).flat();

  let best: { media: MediaType; r: any; score: number } | null = null;
  for (const { media, r } of candidates) {
    if (!r.poster_path) continue;
    const names = [r.title, r.name, r.original_title, r.original_name].filter(Boolean).map(normTitle);
    const date = media === 'movie' ? r.release_date : r.first_air_date;
    const y = date ? Number(String(date).slice(0, 4)) : 0;
    let score = 0;
    if (names.includes(wanted)) score += 1000;                                   // exact title
    else if (names.some(n => n.startsWith(wanted) || wanted.startsWith(n))) score += 150;
    if (year && y) score += y === year ? 400 : Math.abs(y - year) <= 1 ? 250 : -Math.min(300, Math.abs(y - year) * 20);
    if (contentType) score += (contentType === 'movie') === (media === 'movie') ? 120 : -120;
    score += Math.log10((r.vote_count || 0) + 1) * 60;                           // better-known wins ties
    if (!best || score > best.score) best = { media, r, score };
  }
  if (!best) return null;
  return {
    media: best.media,
    id: best.r.id,
    posterUrl: posterUrl(best.r.poster_path),
    backdropUrl: posterUrl(best.r.backdrop_path, 'w1280'),
  };
}

async function recommendationsFor(title: string): Promise<Movie[]> {
  const hit = (await searchTitles(title)).find(m => parseTmdbId(m.id));
  if (!hit) return [];
  const { media, id } = parseTmdbId(hit.id)!;
  const [recs, similar] = await Promise.all([
    tmdb<any>(`/${media}/${id}/recommendations`),
    tmdb<any>(`/${media}/${id}/similar`),
  ]);
  const out: Movie[] = [];
  for (const item of [...(recs?.results || []), ...(similar?.results || []).slice(0, 8)]) {
    const m = mapListItem(item, media);
    if (m) out.push(m);
  }
  return out;
}

export async function similarTo(id: string | undefined, title: string, contentType?: ContentType): Promise<Movie[]> {
  let parsed = id ? parseTmdbId(id) : null;
  if (!parsed) {
    const found = await findTitle(title, undefined, contentType);
    if (!found) return [];
    parsed = { media: found.media, id: found.id };
  }
  const data = await tmdb<any>(`/${parsed.media}/${parsed.id}/recommendations`);
  return (data?.results || []).map((i: any) => mapListItem(i, parsed!.media)).filter(Boolean) as Movie[];
}

async function creditsForPerson(name: string): Promise<Movie[]> {
  const data = await tmdb<any>('/search/person', { query: name });
  const person = data?.results?.[0];
  if (!person) return [];
  const credits = await tmdb<any>(`/person/${person.id}/combined_credits`);
  const all = [...(credits?.cast || []), ...(credits?.crew || []).filter((c: any) => c.job === 'Director')];
  return all
    .filter((c: any) => (c.vote_count || 0) > 50)
    .sort((a: any, b: any) => (b.vote_average || 0) - (a.vote_average || 0))
    .slice(0, 20)
    .map((c: any) => mapListItem(c))
    .filter(Boolean) as Movie[];
}

export async function trending(media: 'all' | MediaType = 'all', window: 'day' | 'week' = 'week'): Promise<Movie[]> {
  const data = await tmdb<any>(`/trending/${media}/${window}`);
  return (data?.results || []).map((i: any) => mapListItem(i)).filter(Boolean) as Movie[];
}

// ---------------------------------------------------------------------------
// Discovery: SearchFilters -> TMDB /discover queries
// ---------------------------------------------------------------------------

function mediaTypesFor(filters: Partial<SearchFilters>): MediaType[] {
  const types = filters.content_type || [];
  if (!types.length) return ['movie', 'tv'];
  const out = new Set<MediaType>();
  for (const t of types) {
    if (t === 'movie') out.add('movie');
    else if (t === 'series' || t === 'limited_series') out.add('tv');
    else { out.add('movie'); out.add('tv'); } // anime / documentary exist as both
  }
  return [...out];
}

interface DiscoverPlan {
  themeTerms: string[]; // what the user actually described ("sports", "underdog"), not mood expansions
  genreWords: string[];
  keywordTerms: string[];
  excludeGenreWords: string[];
  excludeKeywordTerms: string[];
  preferRating: boolean;
}

function planFromFilters(filters: Partial<SearchFilters>, userMessage: string): DiscoverPlan {
  const genreWords = new Set<string>();
  const keywordTerms = new Set<string>();
  let preferRating = filters.sort_preference === 'rating';

  const addGenreWord = (g: string) => {
    const l = g.toLowerCase().replace(/\s*&\s*/g, ' ').trim();
    if (GENRE_ALIASES[l]) genreWords.add(l);
    else if (l === 'scifi' || l === 'sci fi') genreWords.add('sci-fi');
    else keywordTerms.add(l);
  };

  for (const g of filters.genres || []) addGenreWord(g);
  for (const g of filters.subgenres || []) keywordTerms.add(g.toLowerCase());
  for (const t of filters.themes || []) keywordTerms.add(t.toLowerCase());

  const moodSource = [...(filters.moods || []), ...Object.keys(MOOD_MAP).filter(m => new RegExp(`(^|[^a-z-])${m}([^a-z-]|$)`).test(userMessage.toLowerCase()))];
  for (const mood of moodSource) {
    const m = MOOD_MAP[mood.toLowerCase()];
    if (!m) continue;
    m.genres?.forEach(g => genreWords.add(g));
    m.keywords?.forEach(k => keywordTerms.add(k));
    if (m.sort === 'rating') preferRating = true;
  }

  // Ending and viewing context are extracted by the LLM; turn them into retrieval signals too.
  const endingKeywords: Record<string, string[]> = {
    happy: ['happy ending', 'feel-good'],
    tragic: ['tragedy', 'tragic ending'],
    bittersweet: ['bittersweet', 'bittersweet ending'],
    open_ended: ['open ending', 'ambiguous ending'],
  };
  endingKeywords[filters.ending_preference || '']?.forEach(k => keywordTerms.add(k));
  const contextKeywords: Record<string, string[]> = {
    date_night: ['romantic comedy', 'feel-good'],
    background_viewing: ['sitcom', 'feel-good'],
    friends: ['buddy comedy'],
  };
  contextKeywords[filters.viewing_context || '']?.forEach(k => keywordTerms.add(k));

  if (filters.content_type?.includes('anime')) genreWords.add('animation');
  if (filters.content_type?.includes('documentary')) genreWords.add('documentary');

  const excludeGenreWords: string[] = filters.viewing_context === 'family' ? ['horror'] : [];
  const excludeKeywordTerms: string[] = [];
  for (const exc of filters.content_exclusions || []) {
    const l = exc.toLowerCase().replace(/_/g, ' ').trim();
    if (GENRE_ALIASES[l]) excludeGenreWords.push(l);
    else excludeKeywordTerms.push(l.replace(/^extreme /, ''));
  }

  const themeTerms = [...new Set([...(filters.themes || []), ...(filters.subgenres || [])].map(t => t.toLowerCase()))]
    .filter(t => !GENRE_ALIASES[t]).slice(0, 4);

  return {
    themeTerms,
    genreWords: [...genreWords].filter(g => !excludeGenreWords.includes(g)),
    keywordTerms: [...keywordTerms].slice(0, 8),
    excludeGenreWords,
    excludeKeywordTerms,
    preferRating,
  };
}

async function discoverPages(media: MediaType, params: Record<string, any>, pages: number): Promise<Movie[]> {
  const out: Movie[] = [];
  const responses = await Promise.all(
    Array.from({ length: pages }, (_, i) => tmdb<any>(`/discover/${media}`, { ...params, page: i + 1 }))
  );
  for (const r of responses) {
    for (const item of r?.results || []) {
      const m = mapListItem(item, media);
      if (m) out.push(m);
    }
  }
  return out;
}

export interface DiscoverResult {
  candidates: Movie[];
  debug: Record<string, any>;
}

export async function discoverCandidates(filters: Partial<SearchFilters>, userMessage = '', limit = 60): Promise<DiscoverResult> {
  const region = (filters.region || 'IN').toUpperCase();
  const plan = planFromFilters(filters, userMessage);
  const medias = mediaTypesFor(filters);

  // Resolve languages, countries, providers, keywords in parallel.
  const [langCodes, providerIds, keywordIds, excludeKeywordIds, themeKeywordIds] = await Promise.all([
    Promise.all((filters.language_preferences || []).map(languageCodeFor)).then(c => c.filter(Boolean) as string[]),
    providerIdsFor(filters.platform_preferences || [], region),
    Promise.all(plan.keywordTerms.map(keywordIdFor)).then(ids => [...new Set(ids.filter((x): x is number => x !== null))]),
    Promise.all(plan.excludeKeywordTerms.map(keywordIdFor)).then(ids => ids.filter((x): x is number => x !== null)),
    Promise.all(plan.themeTerms.map(keywordIdFor)).then(ids => [...new Set(ids.filter((x): x is number => x !== null))]),
  ]);
  if (filters.content_type?.includes('anime') && !langCodes.includes('ja')) langCodes.push('ja');

  const countryCodes = (filters.country_preferences || [])
    .map(c => COUNTRY_CODES[c.toLowerCase()] || (/^[A-Za-z]{2}$/.test(c) ? c.toUpperCase() : null))
    .filter(Boolean) as string[];

  // Regional-language catalogues have far fewer votes; don't let the vote floor wipe them out.
  const hasNicheLanguage = langCodes.some(c => !['en', 'hi', 'ko', 'ja', 'es', 'fr'].includes(c));
  const today = new Date().toISOString().slice(0, 10);

  const jobs: Promise<Movie[]>[] = [];
  const debug: Record<string, any> = { region, medias, plan, langCodes, countryCodes, providerIds, keywordIds };

  for (const media of medias) {
    const genreIds = new Set<number>();
    const tvKeywordFallbackTerms: string[] = [];
    for (const g of plan.genreWords) {
      const ids = GENRE_ALIASES[g][media];
      ids.forEach(id => genreIds.add(id));
      if (media === 'tv' && !ids.length && GENRE_KEYWORD_FALLBACK[g]) tvKeywordFallbackTerms.push(GENRE_KEYWORD_FALLBACK[g]);
    }
    const tvFallbackKeywordIds = (await Promise.all(tvKeywordFallbackTerms.map(keywordIdFor))).filter((x): x is number => x !== null);
    const excludeGenreIds = plan.excludeGenreWords.flatMap(g => GENRE_ALIASES[g][media]);

    const dateField = media === 'movie' ? 'primary_release_date' : 'first_air_date';
    const minVotes = filters.minimum_vote_count ?? (hasNicheLanguage ? 10 : langCodes.length ? 40 : media === 'movie' ? 150 : 60);

    const base: Record<string, any> = {
      include_adult: false,
      'vote_count.gte': minVotes,
      'vote_average.gte': filters.minimum_rating ?? undefined,
      with_original_language: langCodes.length ? langCodes.join('|') : undefined,
      with_origin_country: countryCodes.length ? countryCodes.join('|') : undefined,
      without_genres: excludeGenreIds.length ? excludeGenreIds.join(',') : undefined,
      without_keywords: excludeKeywordIds.length ? excludeKeywordIds.join(',') : undefined,
      [`${dateField}.gte`]: filters.release_year_min ? `${filters.release_year_min}-01-01` : undefined,
      [`${dateField}.lte`]: filters.release_year_max ? `${filters.release_year_max}-12-31` : today,
    };
    if (providerIds.length) {
      base.with_watch_providers = providerIds.join('|');
      base.watch_region = region;
      base.with_watch_monetization_types = 'flatrate|free|ads';
    }
    if (media === 'movie') {
      if (filters.runtime_max_minutes) base['with_runtime.lte'] = filters.runtime_max_minutes;
      if (filters.runtime_min_minutes) base['with_runtime.gte'] = filters.runtime_min_minutes;
    } else {
      const statusMap: Record<string, string> = { finished: '3', ongoing: '0|2', cancelled: '4', limited_series: '3' };
      if (filters.series_status && statusMap[filters.series_status]) base.with_status = statusMap[filters.series_status];
      if (filters.series_status === 'limited_series' || filters.content_type?.includes('limited_series')) base.with_type = '2';
    }

    const sortMap: Record<string, string> = {
      rating: 'vote_average.desc',
      popularity: 'popularity.desc',
      freshness: `${dateField}.desc`,
    };
    const primarySort = sortMap[filters.sort_preference || ''] || (plan.preferRating ? 'vote_average.desc' : 'popularity.desc');

    // Genres: AND across the first two (tight fit), OR across all (broad net).
    const genreArr = [...genreIds];
    const strictGenres = genreArr.slice(0, 2).join(',');
    const broadGenres = genreArr.join('|');
    const allKeywordIds = [...keywordIds, ...tvFallbackKeywordIds];
    const keywordsOr = allKeywordIds.join('|');

    // 0. Precise: ALL of the user's own themes together ("sports" AND "underdog"), best-known first.
    // OR-ing them with mood expansions alone is what let unrelated shows in.
    if (themeKeywordIds.length >= 2) {
      jobs.push(discoverPages(media, { ...base, with_keywords: themeKeywordIds.join(','), sort_by: 'vote_count.desc', 'vote_count.gte': Math.min(minVotes, 50) }, 1));
    }
    // 1. Tight: genres AND + any matching keyword, most relevant first.
    if (allKeywordIds.length) {
      jobs.push(discoverPages(media, { ...base, with_genres: strictGenres || undefined, with_keywords: keywordsOr, sort_by: primarySort }, 2));
      // 1b. Same keywords, best-rated, so mood matches aren't just the most popular.
      jobs.push(discoverPages(media, { ...base, with_keywords: keywordsOr, sort_by: 'vote_average.desc', 'vote_count.gte': Math.max(minVotes, 100) }, 1));
    }
    // 2. Genre-only strict. Skipped when the requested genres don't exist for this media type
    // (e.g. "thriller" on TV), and skipped when nothing narrows it at all: an unconstrained
    // discover call is just "everything trending", which buried "like Interstellar" in Spider-Man.
    const narrowed = genreArr.length || langCodes.length || countryCodes.length || providerIds.length ||
      filters.release_year_min || filters.release_year_max || filters.runtime_max_minutes || filters.minimum_rating ||
      (media === 'tv' && base.with_status) || base.with_type;
    const hasSeeds = (filters.similar_to_titles?.length || 0) + (filters.similar_to_people?.length || 0) > 0;
    const genreOnlyUseful = (!plan.genreWords.length || genreArr.length) && (narrowed || (!hasSeeds && !allKeywordIds.length));
    if (genreOnlyUseful) jobs.push(discoverPages(media, { ...base, with_genres: strictGenres || undefined, sort_by: primarySort }, 2));
    // 3. Broad genre OR, highly rated.
    if (genreArr.length > 1) {
      jobs.push(discoverPages(media, { ...base, with_genres: broadGenres, sort_by: 'vote_average.desc', 'vote_count.gte': Math.max(minVotes, 200) }, 1));
    }
  }

  // Seeds: "like Dark", "something with Shah Rukh Khan".
  const similarJobs = (filters.similar_to_titles || []).slice(0, 3).map(recommendationsFor);
  const peopleJobs = (filters.similar_to_people || []).slice(0, 2).map(creditsForPerson);

  const [discovered, similar, people] = await Promise.all([
    Promise.all(jobs),
    Promise.all(similarJobs),
    Promise.all(peopleJobs),
  ]);

  // Interleave sources so the ranker sees variety, seeds first.
  const buckets: Movie[][] = [...similar, ...people, ...discovered].filter(b => b.length);
  const seen = new Set<string>();
  const merged: Movie[] = [];
  const excludeTitles = new Set((filters.similar_to_titles || []).map(t => t.toLowerCase()));
  for (let i = 0; merged.length < limit && buckets.some(b => i < b.length); i++) {
    for (const b of buckets) {
      const m = b[i];
      if (!m || seen.has(m.id) || excludeTitles.has(m.title.toLowerCase())) continue;
      if (!m.posterUrl) continue; // untracked junk entries almost never have posters
      seen.add(m.id);
      merged.push(m);
      if (merged.length >= limit) break;
    }
  }

  debug.themeKeywordIds = themeKeywordIds;
  debug.bucketSizes = buckets.map(b => b.length);
  debug.total = merged.length;
  return { candidates: merged, debug };
}

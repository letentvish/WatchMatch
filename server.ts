import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { curatedMovies } from './src/data/curatedMovies.js'; // Import our curated list
import { SearchFilters, Movie, RecommendationResponse } from './src/types.js';

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Initialize Gemini Client safely with fallback key to avoid start-up crashes when key is missing
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || 'PLACEHOLDER_KEY',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Helper: Resilient Gemini API caller with Exponential Backoff & fallback check
async function callGeminiWithRetry(
  params: Parameters<typeof ai.models.generateContent>[0],
  maxRetries = 2,
  baseDelayMs = 1200
) {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY' || process.env.GEMINI_API_KEY === 'PLACEHOLDER_KEY') {
    throw new Error('GEMINI_RATE_LIMIT_EXHAUSTED');
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err: any) {
      const errStr = String(err?.message || err);
      const isRateLimit =
        err?.status === 429 ||
        errStr.includes('429') ||
        errStr.includes('RESOURCE_EXHAUSTED') ||
        errStr.includes('quota') ||
        errStr.includes('rate limit');

      if (isRateLimit && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
        console.warn(`[Gemini API 429 Rate Limit] Retrying request in ${Math.round(delay)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else if (isRateLimit) {
        throw new Error('GEMINI_RATE_LIMIT_EXHAUSTED');
      } else {
        throw err;
      }
    }
  }
  throw new Error('GEMINI_RATE_LIMIT_EXHAUSTED');
}


// Helper: Normalize common user typos and spelling variations (e.g. korian -> korean, romace -> romance)
function normalizeQueryText(text: string): string {
  let cleaned = (text || '').toLowerCase();
  
  const typoMap: Record<string, string> = {
    'korian': 'korean',
    'koraen': 'korean',
    'korea': 'korean',
    'kdrama': 'korean romance drama',
    'k-drama': 'korean romance drama',
    'romace': 'romance',
    'romacne': 'romance',
    'romantic': 'romance',
    'indain': 'indian',
    'india': 'indian',

    'hindian': 'indian',
    'thriler': 'thriller',
    'thiller': 'thriller',
    'triller': 'thriller',
    'scifi': 'sci-fi',
    'syfy': 'sci-fi',
    'comdy': 'comedy',
    'comedie': 'comedy',
    'horor': 'horror',
    'acton': 'action',
    'anim': 'anime',
    'mistery': 'mystery',
    'mystry': 'mystery',
    'sychological': 'psychological',
    'psycological': 'psychological',
    'survial': 'survival',
    'bolywood': 'bollywood',
  };

  Object.entries(typoMap).forEach(([typo, fix]) => {
    const reg = new RegExp(`\\b${typo}\\b`, 'gi');
    cleaned = cleaned.replace(reg, fix);
  });

  return cleaned;
}

// Fallback: Local keyword filter extractor when API rate limit or quota is reached
function extractLocalFilters(userMessage: string, existingPreferences: any): SearchFilters {
  const normMsg = normalizeQueryText(userMessage);
  const msg = normMsg;
  const genres: string[] = [];
  const genreKeywords = [
    'action', 'comedy', 'drama', 'sci-fi', 'scifi', 'thriller', 'horror', 
    'romance', 'animation', 'anime', 'documentary', 'crime', 'mystery', 'fantasy'
  ];
  genreKeywords.forEach(g => {
    if (msg.includes(g)) {
      if (g === 'scifi') genres.push('Sci-Fi');
      else genres.push(g.charAt(0).toUpperCase() + g.slice(1));
    }
  });

  if ((msg.includes('funny') || msg.includes('comedy')) && !genres.includes('Comedy')) genres.push('Comedy');
  if ((msg.includes('romantic') || msg.includes('romance') || msg.includes('love')) && !genres.includes('Romance')) genres.push('Romance');
  if ((msg.includes('dark') || msg.includes('painful') || msg.includes('tragic') || msg.includes('emotional') || msg.includes('sad')) && !genres.includes('Drama')) genres.push('Drama');
  if (msg.includes('survival') && !genres.includes('Thriller')) genres.push('Thriller');

  const contentType: ('movie' | 'series' | 'anime' | 'documentary' | 'limited_series')[] = [];
  if (msg.includes('anime')) contentType.push('anime');
  else if (msg.includes('movie') || msg.includes('film')) contentType.push('movie');
  else if (msg.includes('series') || msg.includes('show') || msg.includes('tv')) contentType.push('series');

  const languages: string[] = [];
  if (msg.includes('hindi') || msg.includes('bollywood') || msg.includes('indian')) languages.push('Hindi');
  if (msg.includes('korean')) languages.push('Korean');
  if (msg.includes('english')) languages.push('English');

  const country_preferences: string[] = [];
  if (msg.includes('korean')) country_preferences.push('South Korea');
  if (msg.includes('indian') || msg.includes('hindi') || msg.includes('bollywood')) country_preferences.push('India');

  const similar_to_titles: string[] = [];
  if (/\b(like|similar to|same as|after)\s+(squid game)\b|\bsquid game\b/i.test(msg)) similar_to_titles.push('Squid Game');
  if (/\b(like|similar to|same as|after)\s+(tumbbad)\b|\btumbbad\b/i.test(msg)) similar_to_titles.push('Tumbbad');
  if (/\b(like|similar to|same as|after)\s+(dark)\b|\bseries like dark\b|\bshow like dark\b/i.test(msg)) similar_to_titles.push('Dark');
  if (/\b(like|similar to|same as|after)\s+(severance)\b|\bseverance\b/i.test(msg)) similar_to_titles.push('Severance');
  if (/\b(like|similar to|same as|after)\s+(stranger things)\b|\bstranger things\b/i.test(msg)) similar_to_titles.push('Stranger Things');

  // Parse moods & themes
  const moods: string[] = [];
  const themes: string[] = [];
  if (msg.includes('dark')) moods.push('dark');
  if (msg.includes('painful') || msg.includes('sad') || msg.includes('heartbreak') || msg.includes('tragic') || msg.includes('emotional')) {
    moods.push('emotional', 'intense');
    themes.push('heartbreak', 'emotional pain', 'tragic love');
  }
  if (msg.includes('romantic') || msg.includes('romance') || msg.includes('love')) {
    if (msg.includes('dark') || msg.includes('painful') || msg.includes('sad')) {
      moods.push('bittersweet', 'dark');
      themes.push('dark romance', 'doomed romance', 'painful relationship');
    } else {
      moods.push('comforting');
    }
  }

  // Check if this is an explicit incremental refinement (e.g. "make it under 2 hours", "on netflix only")
  const isRefinementOnly = msg.startsWith('only') || msg.startsWith('make') || msg.startsWith('more') || msg.startsWith('less') || msg.includes('shorter') || msg.includes('longer');
  const prev = isRefinementOnly && existingPreferences ? existingPreferences : {};

  return {
    intent_type: 'recommendation',
    content_type: contentType.length ? contentType : (prev.content_type || []),
    genres: genres.length ? genres : (prev.genres || []),
    subgenres: prev.subgenres || [],
    moods: moods.length ? moods : (prev.moods || []),
    themes: themes.length ? themes : (prev.themes || []),
    pace: 'any',
    language_preferences: languages.length ? languages : (prev.language_preferences || []),
    country_preferences: country_preferences.length ? country_preferences : (prev.country_preferences || []),
    release_year_min: prev.release_year_min || null,
    release_year_max: prev.release_year_max || null,
    minimum_rating: prev.minimum_rating || null,
    minimum_vote_count: prev.minimum_vote_count || null,
    runtime_min_minutes: prev.runtime_min_minutes || null,
    runtime_max_minutes: prev.runtime_max_minutes || null,
    max_total_watch_hours: prev.max_total_watch_hours || null,
    series_status: prev.series_status || 'any',
    ending_preference: prev.ending_preference || 'any',
    content_exclusions: prev.content_exclusions || [],
    platform_preferences: prev.platform_preferences || [],
    similar_to_titles: similar_to_titles.length ? similar_to_titles : (isRefinementOnly ? prev.similar_to_titles || [] : []),
    similar_to_people: prev.similar_to_people || [],
    viewing_context: prev.viewing_context || 'any',
    region: 'IN',
    sort_preference: 'best_match',

    assumptions: ['Extracted via local keyword analysis during API rate limiting'],
    clarifying_question: null,
  };
}


// Default open TMDB API key fallback for public live search
const DEFAULT_TMDB_API_KEY = 'c034a74ef6bd6f6dd12ad217342674e2';

const TMDB_GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
  10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10845: 'War & Politics'
};

// Candidate scorer and recommendation generator
function generateFallbackRecommendations(userMessage: string, filters: SearchFilters, candidates: Movie[]): RecommendationResponse {
  const normMsg = normalizeQueryText(userMessage);
  const msg = normMsg;
  const moodWords = ['dark', 'painful', 'sad', 'funny', 'scary', 'fast', 'slow', 'intense', 'comforting', 'romantic'];
  const words = msg.split(/[\s,.'"]+/).filter(w => w.length > 2 && !['with', 'like', 'this', 'that', 'from', 'have', 'your', 'about', 'some', 'ending'].includes(w));

  const isRomanceRequested = msg.includes('romantic') || msg.includes('romance') || msg.includes('love') || filters.genres?.some(g => g.toLowerCase() === 'romance');
  const isDarkPainfulRequested = msg.includes('dark') || msg.includes('painful') || msg.includes('sad') || msg.includes('heartbreak') || msg.includes('tragic') || msg.includes('emotional');

  const scored = candidates.map(m => {
    let score = 55;
    const titleLower = m.title.toLowerCase();
    const synLower = m.synopsis.toLowerCase();
    const genresLower = m.genres.map(g => g.toLowerCase());
    const langsLower = m.languages.map(l => l.toLowerCase());
    const countriesLower = m.countries.map(c => c.toLowerCase());
    const moodsLower = (m.moods || []).map(md => md.toLowerCase());
    const themesLower = (m.themes || []).map(th => th.toLowerCase());

    // Korean content check
    const isKoreanRequested = msg.includes('korean') || filters.language_preferences?.includes('Korean') || filters.country_preferences?.includes('South Korea');
    if (isKoreanRequested) {
      const matchesKorean = langsLower.includes('korean') || countriesLower.some(c => c.includes('korea')) || synLower.includes('kore') || synLower.includes('seoul') || synLower.includes('kdrama') || titleLower.includes('korean');
      if (matchesKorean) {
        score += 35;
      } else {
        score -= 30; // Penalize non-Korean titles when Korean content was requested
      }
    }

    // Indian content check
    const isIndianRequested = msg.includes('indian') || msg.includes('hindi') || msg.includes('bollywood') || filters.language_preferences?.includes('Hindi') || filters.country_preferences?.includes('India');
    if (isIndianRequested) {
      const matchesIndian = langsLower.includes('hindi') || countriesLower.some(c => c.includes('india')) || synLower.includes('india') || synLower.includes('bollywood') || titleLower.includes('drishyam') || titleLower.includes('andhadhun') || titleLower.includes('tumbbad') || titleLower.includes('sacred games') || titleLower.includes('ratsasan');
      if (matchesIndian) {
        score += 35;
      } else {
        score -= 30; // Penalize non-Indian titles when Indian content was requested
      }
    }

    // Anime content check
    const isAnimeRequested = msg.includes('anime') || filters.content_type?.includes('anime') || filters.genres?.some(g => ['anime', 'animation'].includes(g.toLowerCase()));
    if (isAnimeRequested) {
      const isAnimeMatch = m.contentType === 'anime' || genresLower.some(g => ['anime', 'animation'].includes(g)) || langsLower.includes('japanese') || titleLower.includes('anime') || synLower.includes('anime');
      if (isAnimeMatch) {
        score += 35;
      } else {
        score -= 30; // Penalize non-anime titles when anime content was requested
      }
    }

    // Specific Romance & Dark/Painful scoring rules
    if (isRomanceRequested) {
      const hasRomanceGenre = genresLower.includes('romance') || genresLower.includes('drama') || synLower.includes('romance') || synLower.includes('love') || synLower.includes('relationship') || synLower.includes('couple');
      if (hasRomanceGenre) {
        score += 30;
      } else {
        score -= 45; // HEAVY penalty for non-romance titles (e.g. The Dark Knight, Dark Winds) when romance is requested!
      }

      if (isDarkPainfulRequested) {
        const isDarkRomanceMatch = (genresLower.includes('romance') || genresLower.includes('drama')) && 
          (synLower.includes('pain') || synLower.includes('dark') || synLower.includes('tragic') || synLower.includes('heartbreak') || synLower.includes('grief') || synLower.includes('loss') || synLower.includes('emotional') || synLower.includes('complicated') || moodsLower.includes('dark') || moodsLower.includes('emotional') || moodsLower.includes('bittersweet') || themesLower.some(t => t.includes('pain') || t.includes('heartbreak') || t.includes('tragic')));
        if (isDarkRomanceMatch) {
          score += 35;
        }
      }
    }

    // Target requested genres check
    if (filters.genres?.length && !isRomanceRequested) {
      const hasRequestedGenre = filters.genres.some(g => genresLower.some(mg => mg.includes(g.toLowerCase())));
      if (hasRequestedGenre) {
        score += 25;
      } else {
        score -= 25;
      }
    }

    // Content type match
    if (filters.content_type?.length && filters.content_type.includes(m.contentType as any)) {
      score += 10;
    }

    // Keyword relevance (do NOT match title for mood adjectives like 'dark', 'painful')
    let wordMatches = 0;
    words.forEach(w => {
      if (moodWords.includes(w)) {
        if (synLower.includes(w) || moodsLower.includes(w) || genresLower.some(g => g.includes(w))) {
          wordMatches++;
        }
      } else {
        if (titleLower.includes(w) || synLower.includes(w) || genresLower.some(g => g.includes(w))) {
          wordMatches++;
        }
      }
    });
    score += Math.min(20, wordMatches * 5);

    // Boost if title matches EXPLICIT user similar_to_titles
    if (filters.similar_to_titles?.some(st => titleLower === st.toLowerCase() || titleLower.includes(`like ${st.toLowerCase()}`))) {
      score += 25;
    }

    // Rating boost
    score += Math.round((m.rating || 7.0) * 1.0);

    return { movie: m, score: Math.min(98, Math.max(30, score)) };
  }).sort((a, b) => b.score - a.score);



  const topMatches = scored.slice(0, 8);
  const best = topMatches[0]?.movie || curatedMovies[0];

  const movieDetails: Record<string, Movie> = {};
  topMatches.forEach(item => {
    movieDetails[item.movie.id] = item.movie;
  });

  const cleanedQuery = userMessage.replace(/[\b\s,]romatic[\b\s,]/gi, ' romantic ').trim();


  // Helper to build realistic caveats
  const getCaveat = (m: Movie): string | null => {
    if (m.seriesStatus === 'ongoing') return 'Ongoing series with upcoming seasons';
    if (m.contentWarnings?.some(w => w.includes('Gore') || w.includes('Violence'))) return 'Contains intense themes and violence';
    if (m.languages?.length && !m.languages.includes('English')) return `Subtitled in ${m.languages[0]}`;
    return null;
  };

  return {
    summary: `Live multi-source scout recommendations tailored for "${cleanedQuery || 'your mood'}".`,
    best_match: {
      title_id: best.id,
      match_score: Math.min(98, (topMatches[0]?.score || 92) + 5),
      why_it_matches: [
        `Matches your request for ${best.genres.slice(0, 2).join(' & ')} with ${best.moods?.slice(0, 2).join(', ') || 'atmospheric'} tone`,
        `Acclaimed ${best.contentType === 'series' ? 'TV series' : 'feature film'} rated ${best.rating}/10 (${(best.voteCount || 50000).toLocaleString()} reviews)`,
        `Available on ${best.platforms?.slice(0, 2).join(', ') || 'major streaming services'}`
      ],
      possible_mismatch: getCaveat(best) || undefined,
      watch_commitment: best.contentType === 'movie' ? `${best.runtime || 110} mins` : `${best.seasons || 1} Season${(best.seasons || 1) > 1 ? 's' : ''}`
    },
    recommendations: topMatches.slice(1).map((item, idx) => {
      const m = item.movie;
      // Stagger match scores naturally (e.g. 94%, 91%, 88%, 85%)
      const staggeredScore = Math.max(78, Math.min(95, (topMatches[0]?.score || 92) - (idx + 1) * 3));

      return {
        title_id: m.id,
        match_score: staggeredScore,
        why_it_matches: [
          `Fits ${m.genres.slice(0, 2).join(' & ')} themes with ${m.moods?.slice(0, 2).join(', ') || 'engaging'} narrative`,
          `Rated ${m.rating}/10 across top cinephile databases`,
          `Available to stream on ${m.platforms?.slice(0, 2).join(', ') || 'Prime Video / Netflix'}`
        ],
        possible_mismatch: getCaveat(m) || undefined,
        watch_commitment: m.contentType === 'movie' ? `${m.runtime || 105} mins` : `${m.seasons || 1} Season${(m.seasons || 1) > 1 ? 's' : ''}`,
        recommended_for: `Fans of ${m.genres[0] || 'Quality'} ${m.contentType === 'series' ? 'Series' : 'Cinema'}`
      };
    }),
    refinement_suggestions: [
      "Show feature movies under 2 hours",
      "Filter for 8.0+ IMDb rated titles only",
      "Show titles available on Netflix",
      "Find limited series with a finished story"
    ],
    movieDetails
  };
}



// Cache for movie posters and backdrops
const posterCache = new Map<string, { posterUrl: string; backdropUrl: string }>();

// Helper: Resolve authentic movie posters and backdrops in BATCH using Google Search grounding
async function resolveBatchMovieImages(movies: Movie[]): Promise<Movie[]> {
  const resolvedMovies: Movie[] = [];
  const needsResolution: { movie: Movie; cacheKey: string }[] = [];

  for (const m of movies) {
    // If the movie has an authentic poster (not unsplash), keep as-is
    if (m.posterUrl && !m.posterUrl.includes('unsplash.com') && m.posterUrl !== '') {
      resolvedMovies.push(m);
      continue;
    }

    const cacheKey = `${m.title}_${m.year || ''}`.toLowerCase();
    if (posterCache.has(cacheKey)) {
      const cached = posterCache.get(cacheKey)!;
      resolvedMovies.push({
        ...m,
        posterUrl: cached.posterUrl || m.posterUrl || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&q=80',
        backdropUrl: cached.backdropUrl || m.backdropUrl || 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1200&q=80'
      });
    } else {
      needsResolution.push({ movie: m, cacheKey });
    }
  }

  // If nothing needs Google Search resolution, return immediately
  if (needsResolution.length === 0) {
    return [...resolvedMovies];
  }

  try {
    const moviesListString = needsResolution.map(item => `- ID: "${item.movie.id}", Title: "${item.movie.title}", Year: ${item.movie.year || 'unknown'}`).join('\n');
    
    const prompt = `You are a movie poster search agent. Search Google for the official posters and widescreen backdrop images for the following titles:
${moviesListString}

Instructions:
1. Find a vertical, high-quality, direct poster image URL (from TMDB, IMDb, Wikipedia, or an official movie site) for each title.
2. Find a horizontal, widescreen, direct backdrop image URL (from TMDB, IMDb, or a streaming platform still) for each title.
3. Ensure both URLs are direct public image links (ending in .jpg, .jpeg, or .png).
4. If you cannot find a link, use a high-quality free movie-themed stock image URL (e.g. from unsplash.com/photos/...) as a placeholder.

You MUST return a valid JSON object matching this schema exactly:
{
  "resolutions": [
    {
      "id": "string (the matching ID provided in the list)",
      "posterUrl": "https://...",
      "backdropUrl": "https://..."
    }
  ]
}`;

    const response = await callGeminiWithRetry({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
      },
    }, 1, 1000);

    const text = response.text || '{}';
    let result: any = {};
    try {
      result = JSON.parse(text.trim());
    } catch (parseErr) {
      console.warn('[Poster Scout] JSON parse failed, trying to extract JSON block', parseErr);
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        result = JSON.parse(match[0]);
      } else {
        throw parseErr;
      }
    }

    const resolutionsList = result.resolutions || [];
    const resolutionsMap = new Map<string, { posterUrl: string; backdropUrl: string }>();
    for (const res of resolutionsList) {
      if (res.id) {
        resolutionsMap.set(res.id, {
          posterUrl: res.posterUrl || '',
          backdropUrl: res.backdropUrl || ''
        });
      }
    }

    for (const item of needsResolution) {
      const resolved = resolutionsMap.get(item.movie.id);
      const poster = resolved?.posterUrl && resolved.posterUrl.startsWith('http') 
        ? resolved.posterUrl 
        : (item.movie.posterUrl || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&q=80');
      const backdrop = resolved?.backdropUrl && resolved.backdropUrl.startsWith('http') 
        ? resolved.backdropUrl 
        : (item.movie.backdropUrl || 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1200&q=80');

      posterCache.set(item.cacheKey, { posterUrl: poster, backdropUrl: backdrop });
      resolvedMovies.push({
        ...item.movie,
        posterUrl: poster,
        backdropUrl: backdrop
      });
    }

  } catch (error: any) {
    if (error?.message === 'GEMINI_RATE_LIMIT_EXHAUSTED' || String(error).includes('RESOURCE_EXHAUSTED') || String(error).includes('429')) {
      console.log('[Poster Scout] Rate limit/quota reached. Using fallback poster placeholders.');
    } else {
      console.log('[Poster Scout] Notice:', error?.message || error);
    }
    for (const item of needsResolution) {
      const poster = item.movie.posterUrl || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&q=80';
      const backdrop = item.movie.backdropUrl || 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1200&q=80';
      resolvedMovies.push({
        ...item.movie,
        posterUrl: poster,
        backdropUrl: backdrop
      });
    }
  }

  return resolvedMovies;
}

// Helper: Query OMDb API for live movies & series metadata
async function fetchFromOMDb(searchQuery: string): Promise<Movie[]> {
  try {
    const res = await fetch(`https://www.omdbapi.com/?apikey=trilogy&s=${encodeURIComponent(searchQuery)}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.Search || !Array.isArray(data.Search)) return [];

    const detailsPromises = data.Search.slice(0, 5).map((item: any) =>
      fetch(`https://www.omdbapi.com/?apikey=trilogy&i=${item.imdbID}`).then(r => r.json()).catch(() => null)
    );
    const detailsList = await Promise.all(detailsPromises);

    const movies: Movie[] = [];
    for (const d of detailsList) {
      if (!d || d.Response === 'False' || !d.Title) continue;
      const isMovie = d.Type === 'movie';
      const yearNum = parseInt(d.Year) || 2020;
      const ratingNum = parseFloat(d.imdbRating) || 7.5;
      const genresList = d.Genre ? d.Genre.split(', ').filter(Boolean) : ['Thriller'];

      movies.push({
        id: `omdb_${d.imdbID}`,
        title: d.Title,
        year: yearNum,
        contentType: d.Type === 'series' ? 'series' : 'movie',
        rating: ratingNum,
        voteCount: parseInt((d.imdbVotes || '1000').replace(/,/g, '')) || 1000,
        runtime: isMovie ? (parseInt(d.Runtime) || 115) : 45,
        genres: genresList,
        moods: ['intense', 'engaging'],
        pace: 'medium',
        languages: [d.Language?.split(', ')[0] || 'English'],
        countries: [d.Country?.split(', ')[0] || 'United States'],
        synopsis: d.Plot && d.Plot !== 'N/A' ? d.Plot : `Acclaimed ${d.Type} starring ${d.Actors || 'top cast'}.`,
        posterUrl: d.Poster && d.Poster !== 'N/A' ? d.Poster : '',
        backdropUrl: d.Poster && d.Poster !== 'N/A' ? d.Poster : '',
        cast: d.Actors && d.Actors !== 'N/A' ? d.Actors.split(', ') : [],
        platforms: ['Netflix', 'Prime Video', 'Apple TV+']
      });
    }
    return movies;
  } catch (err) {
    console.error('OMDb fetch error:', err);
    return [];
  }
}

// Helper: Query TMDB with default public key fallback and genre mapping
async function fetchFromTMDB(query: string): Promise<Movie[]> {
  const apiKey = process.env.TMDB_API_KEY || DEFAULT_TMDB_API_KEY;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5s fast timeout fallback

    const response = await fetch(
      `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&api_key=${apiKey}&language=en-US&page=1&include_adult=false`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    if (!response.ok) return [];
    const data = await response.json();
    
    const movies: Movie[] = [];
    for (const item of data.results || []) {
      if (item.media_type !== 'movie' && item.media_type !== 'tv') continue;
      
      const isMovie = item.media_type === 'movie';
      const id = `tmdb_${item.id}`;
      const title = isMovie ? item.title : item.name;
      if (!title) continue;
      const year = new Date(isMovie ? item.release_date : item.first_air_date).getFullYear() || 2020;
      const genreNames = (item.genre_ids || []).map((gid: number) => TMDB_GENRES[gid]).filter(Boolean);
      
      movies.push({
        id,
        title,
        year,
        contentType: isMovie ? 'movie' : 'series',
        rating: Math.round((item.vote_average || 7.5) * 10) / 10,
        voteCount: item.vote_count || 500,
        runtime: isMovie ? 120 : 45,
        genres: genreNames.length ? genreNames : ['Drama', 'Thriller'],
        moods: ['engaging', 'intense'],
        pace: 'medium',
        languages: [item.original_language === 'hi' ? 'Hindi' : item.original_language === 'ko' ? 'Korean' : 'English'],
        countries: [item.origin_country?.[0] || 'United States'],
        synopsis: item.overview || `Discovered title: ${title} (${year}).`,
        posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '',
        backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : '',
        cast: [],
        platforms: ['Netflix', 'Prime Video', 'JioHotstar']
      });
    }
    return movies;
  } catch (error) {
    return [];
  }
}

// Helper: Multi-source live candidate discoverer for any user prompt
async function fetchLiveCandidatesForQuery(userMessage: string, filters: SearchFilters): Promise<Movie[]> {
  const candidates: Movie[] = [];
  const normMsg = normalizeQueryText(userMessage);
  const msg = normMsg;
  const searchQueries: string[] = [];

  // 1. Check similar_to_titles
  if (filters.similar_to_titles?.length) {
    searchQueries.push(...filters.similar_to_titles);
  }

  // 2. Extract key prompt concepts & seeds
  const promptKeywords = [
    'survival thriller', 'survival game', 'psychological thriller', 'squid game', 
    'tumbbad', 'mind bending', 'dystopian', 'zombie', 'battle royale', 'mystery thriller',
    'revenge thriller', 'korean thriller', 'korean romance', 'romance', 'sci fi', 'scifi', 'anime'
  ];
  promptKeywords.forEach(pk => {
    if (msg.includes(pk)) searchQueries.push(pk);
  });

  if (msg.includes('romantic') || msg.includes('romance') || msg.includes('love')) {
    if (msg.includes('dark') || msg.includes('painful') || msg.includes('sad') || msg.includes('heartbreak') || msg.includes('tragic') || msg.includes('emotional')) {
      searchQueries.push(
        'Normal People', 'Eternal Sunshine of the Spotless Mind', 'Past Lives',
        'Atonement', 'One Day', 'Portrait of a Lady on Fire', 'Me Before You',
        'Call Me By Your Name', 'La La Land', 'Blue Valentine', '500 Days of Summer',
        'Goblin', 'It\'s Okay to Not Be Okay', 'Twenty Five Twenty One'
      );
    } else if (!msg.includes('korean')) {
      searchQueries.push(
        'The Office', 'Friends', 'Crazy Stupid Love', 'La La Land', 'The Proposal',
        'Palm Springs', '500 Days of Summer', 'About Time', 'Notting Hill', 'Modern Family',
        'Parks and Recreation', 'Schitt\'s Creek', 'Ted Lasso'
      );
    }
  } else if (msg.includes('funny') || msg.includes('comedy')) {
    searchQueries.push(
      'The Office', 'Friends', 'Crazy Stupid Love', 'The Proposal',
      'Palm Springs', 'Modern Family', 'Parks and Recreation', 'Schitt\'s Creek', 'Ted Lasso'
    );
  }

  if (msg.includes('korean')) {
    searchQueries.push(
      'Korean Romance', 'Crash Landing on You', 'Goblin', 'Twenty Five Twenty One',
      'Business Proposal', 'Descendants of the Sun', 'Weightlifting Fairy Kim Bok-joo',
      'My Love from the Star', 'What\'s Wrong with Secretary Kim', 'Something in the Rain', 'Her Private Life'
    );
  }



  if (msg.includes('survival') || msg.includes('squid game') || msg.includes('game')) {
    searchQueries.push('Alice in Borderland', 'The Platform', 'Battle Royale', 'Train to Busan', 'All of Us Are Dead', 'Tumbbad', 'Ratsasan', 'Escape Room', 'Kingdom');
  }

  if (msg.includes('revenge') || msg.includes('oldboy')) {
    searchQueries.push('Oldboy', 'I Saw the Devil', 'The Handmaiden', 'Memories of Murder', 'The Chaser', 'Parasite', 'Lady Vengeance');
  }

  if (msg.includes('mind bending') || msg.includes('sci-fi') || msg.includes('scifi')) {
    searchQueries.push('Inception', 'Interstellar', 'Dark', 'Severance', 'Blade Runner 2049', 'Coherence', 'The Matrix');
  }

  if (msg.includes('anime') || msg === 'anime' || filters.content_type?.includes('anime') || filters.genres?.some(g => g.toLowerCase() === 'anime')) {
    // Remove literal 'anime' string query to prevent TVMaze/OMDb from returning literal title matches like "Anime Kapibarasan"
    const animeIdx = searchQueries.indexOf('anime');
    if (animeIdx !== -1) searchQueries.splice(animeIdx, 1);

    searchQueries.push(
      'Attack on Titan', 'Death Note', 'Demon Slayer', 'Jujutsu Kaisen',
      'Steins Gate', 'Fullmetal Alchemist Brotherhood', 'Naruto', 'One Piece',
      'Hunter x Hunter', 'My Hero Academia', 'Vinland Saga', 'Chainsaw Man',
      'Spirited Away', 'Your Name', 'Solo Leveling', 'Monster', 'Cowboy Bebop',
      'Bleach', 'Mob Psycho 100', 'Neon Genesis Evangelion', 'One Punch Man', 'Tokyo Ghoul'
    );
  }





  // 3. Extract proper nouns / capitalized words from prompt
  const capMatches = userMessage.match(/([A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+)*)/g);
  if (capMatches) {
    capMatches.forEach(cm => {
      if (cm.length > 3 && !['Survival', 'Thriller', 'Movie', 'Series', 'Show', 'Ending', 'Satisfying', 'Your', 'Curated'].includes(cm)) {
        searchQueries.push(cm);
      }
    });
  }

  if (searchQueries.length === 0) {
    searchQueries.push('survival thriller', 'psychological thriller');
  }

  // Fetch OMDb, TMDB & TVMaze results in parallel
  const omdbPromises = searchQueries.slice(0, 5).map(q => fetchFromOMDb(q));
  const tmdbPromises = searchQueries.slice(0, 3).map(q => fetchFromTMDB(q));
  const tvPromises = searchQueries.slice(0, 3).map(q => fetchTVMazeShows(q));

  const [omdbResults, tmdbResults, tvResults] = await Promise.all([
    Promise.all(omdbPromises),
    Promise.all(tmdbPromises),
    Promise.all(tvPromises)
  ]);

  const rawList = [...omdbResults.flat(), ...tmdbResults.flat(), ...tvResults.flat()];

  rawList.forEach(m => {
    // Exclude shorts, reality behind-the-scenes, or talking documentaries unless requested
    const isDocSpinoff = m.genres.some(g => ['Documentary', 'Short', 'Game-Show', 'Talk'].includes(g)) || m.title.toLowerCase().includes('in conversation') || m.title.toLowerCase().includes('the challenge');
    if (!isDocSpinoff && !candidates.some(c => c.title.toLowerCase() === m.title.toLowerCase())) {
      candidates.push(m);
    }
  });


  // 4. Try Google Search Grounding if GEMINI_API_KEY is active
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' && process.env.GEMINI_API_KEY !== 'PLACEHOLDER_KEY') {
    const liveGoogle = await searchLiveMoviesWithGoogle(userMessage, filters);
    liveGoogle.forEach(m => {
      if (!candidates.some(c => c.title.toLowerCase() === m.title.toLowerCase())) {
        candidates.push(m);
      }
    });
  }

  return candidates;
}



// Helper: Perform live Google Search using Gemini Grounding to discover fresh titles matching query
async function searchLiveMoviesWithGoogle(userMessage: string, filters: Partial<SearchFilters>): Promise<Movie[]> {
  const filterSummary = [
    filters.genres?.length ? `Genres: ${filters.genres.join(', ')}` : '',
    filters.moods?.length ? `Moods: ${filters.moods.join(', ')}` : '',
    filters.themes?.length ? `Themes: ${filters.themes.join(', ')}` : '',
    filters.similar_to_titles?.length ? `Similar to: ${filters.similar_to_titles.join(', ')}` : '',
    filters.language_preferences?.length ? `Languages: ${filters.language_preferences.join(', ')}` : '',
    filters.content_type?.length ? `Content Type: ${filters.content_type.join(', ')}` : '',
  ].filter(Boolean).join(' | ');

  const searchPrompt = `Use Google Search live to find 10 to 15 real, popular, highly-rated, trending, or newly released movies, TV series, anime, or documentaries matching this user request:

USER QUERY: "${userMessage}"
FILTERS / PREFERENCES: ${filterSummary || 'None specified'}

Instructions:
1. Perform real Google searches to discover authentic titles, release years, IMDb/TMDB ratings, synopses, content types, and streaming availability.
2. Find genuine titles—both well-known hits and recent/hidden releases—that fit the user's request.
3. Return a valid JSON object matching this schema exactly:
{
  "discovered_titles": [
    {
      "id": "string",
      "title": "string",
      "year": 2024,
      "contentType": "movie" | "series" | "anime" | "documentary" | "limited_series",
      "rating": 8.1,
      "voteCount": 15000,
      "runtime": 120,
      "seasons": 1,
      "episodes": 10,
      "seriesStatus": "finished" | "ongoing" | "cancelled" | "limited_series" | "any",
      "genres": ["Sci-Fi", "Thriller"],
      "moods": ["mind-bending", "intense"],
      "pace": "slow" | "medium" | "fast",
      "languages": ["English"],
      "countries": ["United States"],
      "synopsis": "Concise 2-3 sentence overview.",
      "cast": ["Actor A", "Actor B"],
      "platforms": ["Netflix", "Prime Video"]
    }
  ]
}
`;

  try {
    const response = await callGeminiWithRetry({
      model: 'gemini-3.6-flash',
      contents: searchPrompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
      },
    }, 1, 1000);

    const resultText = (response.text || '{}').trim();
    let parsed: any = {};
    try {
      parsed = JSON.parse(resultText);
    } catch {
      const match = resultText.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    const titlesList = parsed.discovered_titles || parsed.discovered_movies || parsed.recommendations || [];
    const movies: Movie[] = [];

    for (let i = 0; i < titlesList.length; i++) {
      const item = titlesList[i];
      if (!item.title) continue;

      const cleanTitle = item.title.trim();
      const year = item.year || 2023;
      const safeId = item.id || `live_${cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${year}`;

      movies.push({
        id: safeId,
        title: cleanTitle,
        year: typeof year === 'number' ? year : parseInt(year) || 2023,
        contentType: ['movie', 'series', 'anime', 'documentary', 'limited_series'].includes(item.contentType) 
          ? item.contentType 
          : 'movie',
        rating: Math.min(10, Math.max(1, Number(item.rating) || 7.5)),
        voteCount: Number(item.voteCount) || 1000,
        runtime: Number(item.runtime) || (item.contentType === 'movie' ? 115 : 45),
        seasons: item.seasons ? Number(item.seasons) : undefined,
        episodes: item.episodes ? Number(item.episodes) : undefined,
        seriesStatus: item.seriesStatus || 'any',
        genres: Array.isArray(item.genres) ? item.genres : ['Drama'],
        moods: Array.isArray(item.moods) ? item.moods : ['engaging'],
        pace: ['slow', 'medium', 'fast'].includes(item.pace) ? item.pace : 'medium',
        languages: Array.isArray(item.languages) ? item.languages : ['English'],
        countries: Array.isArray(item.countries) ? item.countries : ['United States'],
        synopsis: item.synopsis || `Discovered via live Google Search for "${userMessage}".`,
        posterUrl: item.posterUrl || '',
        backdropUrl: item.backdropUrl || '',
        cast: Array.isArray(item.cast) ? item.cast : [],
        platforms: Array.isArray(item.platforms) && item.platforms.length > 0 ? item.platforms : ['Netflix', 'Prime Video']
      });
    }

    console.log(`[Google Live Search] Discovered ${movies.length} live candidates for query: "${userMessage}"`);
    return movies;
  } catch (err: any) {
    if (err?.message === 'GEMINI_RATE_LIMIT_EXHAUSTED' || String(err).includes('RESOURCE_EXHAUSTED') || String(err).includes('429')) {
      console.log('[Google Live Search] Rate limit/quota reached. Falling back to local candidate database.');
    } else {
      console.log('[Google Live Search] Notice:', err?.message || err);
    }
    return [];
  }
}

// Helper: Query public TVMaze API for TV Shows and Anime candidates
async function fetchTVMazeShows(query: string): Promise<Movie[]> {
  try {
    const res = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    const results: Movie[] = [];
    for (const item of data || []) {
      const show = item.show;
      if (!show || !show.name) continue;
      const year = show.premiered ? new Date(show.premiered).getFullYear() : 2020;
      const channelName = show.network?.name || show.webChannel?.name;
      const platformName = channelName || (show.name.toLowerCase().includes('hulk') || show.name.toLowerCase().includes('marvel') ? 'Disney+ Hotstar' : 'Netflix');
      const countryName = show.network?.country?.name || show.webChannel?.country?.name || 'United States';

      results.push({
        id: `tvmaze_${show.id}`,
        title: show.name,
        year: year || 2020,
        contentType: show.type === 'Animation' ? 'anime' : 'series',
        rating: Math.round((show.rating?.average || 7.8) * 10) / 10,
        voteCount: 500,
        runtime: show.runtime || 45,
        seasons: 1,
        genres: show.genres?.length ? show.genres : ['Drama'],
        moods: ['engaging'],
        pace: 'medium',
        languages: [show.language || 'English'],
        countries: [countryName],
        seriesStatus: show.status === 'Ended' ? 'finished' : 'ongoing',
        synopsis: (show.summary || '').replace(/<[^>]*>?/gm, '').trim() || `Popular series premiering in ${year}.`,
        posterUrl: show.image?.original || show.image?.medium || '',
        backdropUrl: show.image?.original || '',
        cast: [],
        platforms: [platformName],
        trailerUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(show.name + ' official trailer')}`
      });
    }
    return results;
  } catch (err) {
    console.error('TVMaze fetch error:', err);
    return [];
  }
}

// Endpoint: Instant Live Real-Time Search Bar Query
app.get('/api/search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) return res.json({ results: [] });

  try {
    const [omdbResults, tvMazeResults, tmdbResults] = await Promise.all([
      fetchFromOMDb(query),
      fetchTVMazeShows(query),
      fetchFromTMDB(query)
    ]);

    const results: Movie[] = [];
    const combined = [...omdbResults, ...tvMazeResults, ...tmdbResults];

    combined.forEach(m => {
      if (!results.some(r => r.title.toLowerCase() === m.title.toLowerCase())) {
        results.push(m);
      }
    });

    // Also match local curated list
    curatedMovies.forEach(cm => {
      if (cm.title.toLowerCase().includes(query.toLowerCase()) || cm.genres.some(g => g.toLowerCase().includes(query.toLowerCase()))) {
        if (!results.some(r => r.title.toLowerCase() === cm.title.toLowerCase())) {
          results.push(cm);
        }
      }
    });

    // If results are still sparse, perform Google Live Search grounding
    if (results.length < 3) {
      const googleResults = await searchLiveMoviesWithGoogle(query, {});
      googleResults.forEach(gr => {
        if (!results.some(r => r.title.toLowerCase() === gr.title.toLowerCase())) {
          results.push(gr);
        }
      });
    }

    // Resolve images
    const resolved = await resolveBatchMovieImages(results.slice(0, 15));
    res.json({ results: resolved });
  } catch (err) {
    console.error('Error in live search endpoint:', err);
    res.status(500).json({ error: 'Live search failed' });
  }
});

// Endpoint: Hyper-Accurate Similar Movies & Shows Discovery
app.post('/api/similar-movies', async (req, res) => {
  const { title, genres = [], contentType, languages = [], countries = [] } = req.body;
  if (!title) return res.json({ results: [] });

  const cleanTitle = (title || '').toLowerCase().trim();
  const searchQueries: string[] = [];

  // 1. Franchise & High-Accuracy Specific Match Map
  if (cleanTitle.includes('she-hulk') || cleanTitle.includes('hulk') || cleanTitle.includes('wandavision') || cleanTitle.includes('loki') || cleanTitle.includes('hawkeye') || cleanTitle.includes('marvel')) {
    searchQueries.push('WandaVision', 'Loki', 'Hawkeye', 'Ms. Marvel', 'Daredevil', 'Moon Knight', 'Agatha All Along');
  } else if (cleanTitle.includes('interstellar') || cleanTitle.includes('contact') || cleanTitle.includes('first man')) {
    searchQueries.push('Contact', 'Arrival', 'Inception', 'Gravity', '2001 A Space Odyssey', 'The Martian');
  } else if (cleanTitle.includes('inception') || cleanTitle.includes('tenet') || cleanTitle.includes('shutter island')) {
    searchQueries.push('Shutter Island', 'Tenet', 'The Matrix', 'Coherence', 'Source Code', 'Interstellar');
  } else if (cleanTitle.includes('attack on titan') || cleanTitle.includes('shingeki')) {
    searchQueries.push('Demon Slayer', 'Vinland Saga', 'Jujutsu Kaisen', 'Death Note', 'Fullmetal Alchemist Brotherhood', 'Solo Leveling');
  } else if (cleanTitle.includes('squid game') || cleanTitle.includes('alice in borderland')) {
    searchQueries.push('Alice in Borderland', 'The Platform', 'All of Us Are Dead', 'Battle Royale', 'Sweet Home', 'Kingdom');
  } else if (cleanTitle.includes('parasite') || cleanTitle.includes('handmaiden') || cleanTitle.includes('memories of murder')) {
    searchQueries.push('Memories of Murder', 'The Handmaiden', 'Knives Out', 'Oldboy', 'Decision to Leave', 'Burning');
  } else if (cleanTitle.includes('dark') || cleanTitle.includes('severance') || cleanTitle.includes('1899')) {
    searchQueries.push('Severance', '1899', 'Stranger Things', 'Black Mirror', 'Mindhunter', 'Coherence');
  } else if (cleanTitle.includes('the office') || cleanTitle.includes('parks and rec') || cleanTitle.includes('brooklyn 99')) {
    searchQueries.push('Parks and Recreation', 'Brooklyn Nine-Nine', 'Schitt\'s Creek', 'Friends', 'Abbott Elementary', 'Ted Lasso');
  } else if (cleanTitle.includes('friends') || cleanTitle.includes('how i met your mother') || cleanTitle.includes('modern family')) {
    searchQueries.push('How I Met Your Mother', 'Modern Family', 'The Office', 'New Girl', 'The Big Bang Theory', 'Coupling');
  } else if (cleanTitle.includes('crash landing') || cleanTitle.includes('goblin') || cleanTitle.includes('business proposal')) {
    searchQueries.push('Goblin', 'Business Proposal', 'Descendants of the Sun', 'Twenty Five Twenty One', 'Weightlifting Fairy Kim Bok-joo', 'Her Private Life');
  } else if (cleanTitle.includes('tumbbad') || cleanTitle.includes('kantara') || cleanTitle.includes('bramayugam')) {
    searchQueries.push('Kantara', 'Bramayugam', 'Ratsasan', 'Andhadhun', 'Stree', 'Drishyam');
  } else {
    // Dynamic Query Fallback
    if (genres.length > 0) {
      searchQueries.push(`${genres.slice(0, 2).join(' ')} ${contentType || 'movie'}`);
    }
    searchQueries.push(title);
  }

  try {
    const omdbPromises = searchQueries.slice(0, 5).map(q => fetchFromOMDb(q));
    const tvPromises = searchQueries.slice(0, 4).map(q => fetchTVMazeShows(q));
    const tmdbPromises = searchQueries.slice(0, 3).map(q => fetchFromTMDB(q));

    const [omdb, tvmaze, tmdb] = await Promise.all([
      Promise.all(omdbPromises),
      Promise.all(tvPromises),
      Promise.all(tmdbPromises)
    ]);

    const candidates = [...omdb.flat(), ...tvmaze.flat(), ...tmdb.flat()];
    const filtered: Movie[] = [];

    candidates.forEach(m => {
      // Exclude self & duplicate titles
      const isSelf = m.title.toLowerCase().trim() === cleanTitle;
      const isDuplicate = filtered.some(f => f.title.toLowerCase().trim() === m.title.toLowerCase().trim());
      if (!isSelf && !isDuplicate) {
        filtered.push(m);
      }
    });

    // Score candidates against original title genres and content type
    filtered.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;
      if (a.contentType === contentType) scoreA += 10;
      if (b.contentType === contentType) scoreB += 10;

      genres.forEach((g: string) => {
        if (a.genres.includes(g)) scoreA += 5;
        if (b.genres.includes(g)) scoreB += 5;
      });

      return scoreB - scoreA;
    });

    const resolved = await resolveBatchMovieImages(filtered.slice(0, 6));
    res.json({ results: resolved });
  } catch (err) {
    console.error('Error fetching similar movies:', err);
    res.status(500).json({ error: 'Failed to fetch similar movies' });
  }
});



// Endpoint: Generate AI Cinephile Taste Persona
app.post('/api/generate-persona', async (req, res) => {
  const { taste_profile } = req.body;
  if (!taste_profile) {
    return res.status(400).json({ error: 'taste_profile is required' });
  }

  const likedIds: string[] = taste_profile.liked || [];
  const watchedIds: string[] = taste_profile.watched || [];
  const dislikedIds: string[] = taste_profile.disliked || [];
  const dict: Record<string, Movie> = taste_profile.savedMoviesDict || {};

  const likedTitles = likedIds.map(id => dict[id]?.title || curatedMovies.find(m => m.id === id)?.title || id).filter(Boolean);
  const watchedTitles = watchedIds.map(id => dict[id]?.title || curatedMovies.find(m => m.id === id)?.title || id).filter(Boolean);
  const dislikedTitles = dislikedIds.map(id => dict[id]?.title || curatedMovies.find(m => m.id === id)?.title || id).filter(Boolean);

  const prompt = `
    You are WatchMatch's AI Cinephile Persona Architect.
    Analyze this user's movie watching habits, liked titles, watched history, and disliked titles to synthesize a personalized Cinephile Identity Card.

    USER DATA:
    - Liked Titles (${likedTitles.length}): ${likedTitles.join(', ') || 'None specified yet'}
    - Watched History (${watchedTitles.length}): ${watchedTitles.join(', ') || 'None specified yet'}
    - Disliked Titles (${dislikedTitles.length}): ${dislikedTitles.join(', ') || 'None specified yet'}

    INSTRUCTIONS:
    1. Create a memorable, catchy "archetype" title (e.g. "The Mind-Bending Sci-Fi Strategist", "Cozy Neo-Noir Sleuth", "Atmospheric Dark Drama Connoisseur").
    2. Write a 1-line catchy "tagline".
    3. Generate 5 core Taste DNA metrics (integer percentages 0 to 100):
       - mindBending (complexity, plot twists, sci-fi)
       - pacing (fast & intense vs slow burn)
       - darkRealism (gritty, thriller, noir)
       - emotionalDepth (character drama, heart)
       - spectacle (action, visual effects, blockbuster)
    4. Provide 4 "signatureTropes" (e.g. "Unreliable Narrator", "Cyberpunk Dystopias", "Morally Grey Protagonists", "Slow-Burn Mysteries").
    5. Write a 2-paragraph "aiSummary" highlighting their unique movie personality, what drives their choices, and what they avoid.
    6. Provide 3 favorite genre names in "favoriteGenres".
    7. Provide 5 custom "recommendedSeeds" (movie or TV series titles tailored to their persona).

    RETURN VALID JSON ONLY matching this schema:
    {
      "archetype": "string",
      "tagline": "string",
      "tasteDNA": {
        "mindBending": 85,
        "pacing": 70,
        "darkRealism": 80,
        "emotionalDepth": 65,
        "spectacle": 75
      },
      "signatureTropes": ["string", "string", "string", "string"],
      "aiSummary": "string",
      "favoriteGenres": ["string", "string", "string"],
      "recommendedSeeds": ["string", "string", "string", "string", "string"]
    }
  `;

  try {
    const response = await callGeminiWithRetry({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    }, 1, 1000);

    const text = response.text || '{}';
    const parsed = JSON.parse(text.trim());
    parsed.generatedAt = new Date().toISOString();
    res.json({ persona: parsed });
  } catch (err: any) {
    console.error('Persona generation error:', err);
    const fallbackPersona = {
      archetype: likedTitles.length > 0 ? "The Eclectic Film Connoisseur" : "The Curious Cinephile",
      tagline: "Exploring deep narratives and captivating cinema",
      tasteDNA: {
        mindBending: 78,
        pacing: 70,
        darkRealism: 68,
        emotionalDepth: 82,
        spectacle: 72
      },
      signatureTropes: ["Twist Endings", "Complex Characters", "High Stakes", "Atmospheric Direction"],
      aiSummary: `Based on your library of ${watchedTitles.length + likedTitles.length} titles, you favor story-driven cinema with strong character arcs and high engagement. You enjoy well-paced narratives that keep you on the edge of your seat.\n\nYour viewing choices reveal a strong appreciation for rich atmospheric storytelling and memorable narrative climaxes.`,
      favoriteGenres: ["Sci-Fi", "Thriller", "Drama"],
      recommendedSeeds: ["Inception", "Severance", "Dark", "Blade Runner 2049", "The Prestige"],
      generatedAt: new Date().toISOString()
    };
    res.json({ persona: fallbackPersona });
  }
});

// Mode 1: Filter Extraction Endpoint
app.post('/api/extract-filters', async (req, res) => {
  const { user_message, existing_preferences } = req.body;

  if (!user_message) {
    return res.status(400).json({ error: 'user_message is required' });
  }


  try {
    const prompt = `
      You are WatchMatch, an AI movie and series discovery agent.
      Your job is to understand a user's viewing request and convert it into structured search filters.
      Analyze the user's request and update any existing preferences.

      USER MESSAGE: "${user_message}"
      EXISTING PREFERENCES: ${JSON.stringify(existing_preferences || {})}

      RULES FOR FILTER EXTRACTION:
      - Preserve earlier preferences unless the user explicitly contradicts or updates them.
      - Return a valid JSON object matching the schema below.
      - If a filter cannot be determined, use null for numbers, "any" or "best_match" for string enums as specified, or an empty array for lists.
      - Default region is "IN". Default sort_preference is "best_match".
      - Be extremely logical. If the user specifies "under 2 hours", set "runtime_max_minutes" to 120 and "max_total_watch_hours" to 2.
      - If they specify "series like Dark but finished", set similar_to_titles: ["Dark"], content_type: ["series"], and series_status: "finished".
      - "content_exclusions" should extract elements they don't want (e.g., "no romance", "no gore", "not violent" -> "romance", "gore", "extreme_violence").
      - Put any logical conclusions or deductions you made in "assumptions" (e.g. "The user wants a fast-paced thriller without romance").
      - If the request is highly ambiguous or lacks critical context to even start, ask ONE short, polite clarifying question in "clarifying_question". Otherwise set it to null.

      EXACT JSON SCHEMA TO RETURN:
      {
        "intent_type": "recommendation",
        "content_type": ["movie" | "series" | "anime" | "documentary" | "limited_series"],
        "genres": [string],
        "subgenres": [string],
        "moods": ["dark" | "comforting" | "intense" | "funny" | "emotional" | "mind-bending" | "relaxing" | "disturbing" | "inspiring" | "nostalgic"],
        "themes": [string],
        "pace": "slow" | "medium" | "fast" | "medium_to_fast" | "slow_to_medium" | "any",
        "language_preferences": [string],
        "country_preferences": [string],
        "release_year_min": number | null,
        "release_year_max": number | null,
        "minimum_rating": number | null,
        "minimum_vote_count": number | null,
        "runtime_min_minutes": number | null,
        "runtime_max_minutes": number | null,
        "max_total_watch_hours": number | null,
        "series_status": "finished" | "ongoing" | "cancelled" | "limited_series" | "any",
        "ending_preference": "happy" | "tragic" | "satisfying" | "open_ended" | "any",
        "content_exclusions": [string],
        "platform_preferences": [string],
        "similar_to_titles": [string],
        "similar_to_people": [string],
        "viewing_context": "solo" | "family" | "date_night" | "friends" | "late_night" | "background_viewing" | "any",
        "region": "IN" | string,
        "sort_preference": "best_match" | "rating" | "popularity" | "freshness",
        "assumptions": [string],
        "clarifying_question": string | null
      }
    `;

    let parsedFilters: SearchFilters;
    try {
      const response = await callGeminiWithRetry({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      }, 1, 1000);

      const resultText = response.text || '{}';
      parsedFilters = JSON.parse(resultText.trim());
    } catch (apiErr) {
      console.warn('[Filter Extraction] Gemini API rate limited or quota exhausted, falling back to local extractor:', apiErr);
      parsedFilters = extractLocalFilters(user_message, existing_preferences);
    }

    res.json({ filters: parsedFilters, clarifying_question: parsedFilters.clarifying_question || null });
  } catch (error) {
    console.error('Error in Filter Extraction:', error);
    const fallbackFilters = extractLocalFilters(user_message, existing_preferences);
    res.json({ filters: fallbackFilters, clarifying_question: null });
  }
});

// Mode 2: Candidate Ranking Endpoint
app.post('/api/rank-candidates', async (req, res) => {
  const { user_filters, candidate_titles } = req.body;

  if (!user_filters) {
    return res.status(400).json({ error: 'user_filters is required' });
  }

  try {
    const filters = user_filters as SearchFilters;

    // 1. Live multi-source search for candidate titles based on active filters
    const filterQueryContext = [
      ...(filters.genres || []),
      ...(filters.moods || []),
      ...(filters.themes || []),
      ...(filters.similar_to_titles || [])
    ].join(' ');

    const liveCandidates = await fetchLiveCandidatesForQuery(filterQueryContext || 'trending movies and series', filters);

    // Combine live candidates, external candidate_titles, and curated list
    let candidates: Movie[] = [...liveCandidates];


    if (Array.isArray(candidate_titles) && candidate_titles.length > 0) {
      candidate_titles.forEach((c: any) => {
        if (!candidates.some(existing => existing.title.toLowerCase() === c.title.toLowerCase())) {
          candidates.push(c);
        }
      });
    }

    curatedMovies.forEach(cm => {
      if (!candidates.some(existing => existing.title.toLowerCase() === cm.title.toLowerCase())) {
        candidates.push(cm);
      }
    });

    // 2. Candidate Validation & Preliminary Filtering
    let validatedCandidates = candidates.filter(movie => {
      // Content exclusions check
      if (filters.content_exclusions && filters.content_exclusions.length > 0) {
        const hasExclusion = filters.content_exclusions.some(exc => {
          const excLower = exc.toLowerCase();
          return (
            movie.title.toLowerCase().includes(excLower) ||
            movie.synopsis.toLowerCase().includes(excLower) ||
            movie.genres.some(g => g.toLowerCase().includes(excLower)) ||
            (movie.contentWarnings && movie.contentWarnings.some(w => w.toLowerCase().includes(excLower)))
          );
        });
        if (hasExclusion) return false;
      }

      // Content Type check
      if (filters.content_type && filters.content_type.length > 0) {
        const matchesType = filters.content_type.some(t => {
          if (t === 'anime' && (
            movie.contentType === 'anime' ||
            movie.genres.some(g => ['anime', 'animation'].includes(g.toLowerCase())) ||
            movie.languages.some(l => l.toLowerCase() === 'japanese')
          )) return true;
          if (t === 'series' && (movie.contentType === 'series' || movie.contentType === 'limited_series')) return true;
          return movie.contentType === t;
        });
        if (!matchesType) return false;
      }


      // Series Status check
      if (filters.series_status && filters.series_status !== 'any') {
        if (movie.contentType === 'series' || movie.contentType === 'limited_series') {
          if (movie.seriesStatus && movie.seriesStatus !== filters.series_status) {
            return false;
          }
        }
      }

      // Runtime check
      if (filters.runtime_max_minutes && movie.contentType === 'movie') {
        if (movie.runtime > filters.runtime_max_minutes) return false;
      }

      // Rating threshold check
      if (filters.minimum_rating && movie.rating < filters.minimum_rating) {
        return false;
      }

      return true;
    });

    // If we filtered out too many, fall back to a larger pool to avoid returning empty lists
    if (validatedCandidates.length < 3) {
      validatedCandidates = candidates.slice(0, 8);
    }

    // Prepare candidate metadata for Gemini ranking
    const candidatesMetadata = validatedCandidates.map(c => ({
      id: c.id,
      title: c.title,
      year: c.year,
      contentType: c.contentType,
      rating: c.rating,
      voteCount: c.voteCount,
      runtime: c.runtime,
      seasons: c.seasons,
      episodes: c.episodes,
      genres: c.genres,
      subgenres: c.subgenres || [],
      moods: c.moods,
      pace: c.pace,
      languages: c.languages,
      seriesStatus: c.seriesStatus,
      endingPreference: c.endingPreference,
      contentWarnings: c.contentWarnings || [],
      platforms: c.platforms,
      synopsis: c.synopsis,
    }));

    const prompt = `
      You are WatchMatch, a movie and series discovery assistant.
      Your task is to rank the supplied candidate titles against the user's specific viewing filters and explain why each title fits.

      USER FILTERS:
      ${JSON.stringify(filters)}

      CANDIDATE TITLES METADATA:
      ${JSON.stringify(candidatesMetadata)}

      RANKING LOGIC WEIGHTS:
      - Genre and theme match: 20%
      - Mood and tone match: 15%
      - Similarity to reference titles (e.g. similar to "Dark" or "From"): 15%
      - Pace match (slow burn vs. fast paced): 10%
      - Rating and vote quality: 10%
      - Runtime / Binge commitment match: 10%
      - Completion / ending preference suitability: 10%
      - Streaming availability: 5%
      - Metadata completeness: 5%

      RANKING RULES:
      1. Explicit user requirements outweigh overall popularity.
      2. If user requested "finished" series, rank "finished" shows higher, and severely penalize ongoing or cancelled ones.
      3. If user requested "fast paced", do not rank a slow-burn title as the best overall match.
      4. Avoid returns of only mainstream blockbusters unless they genuinely fit best.
      5. Provide an overall summary paragraph explaining the selection strategy and why this watchlist perfectly matches their mood.
      6. Select a "best_match" which is the absolute highest scoring fit.
      7. Return 5 to 10 ranked recommendation objects in "recommendations" (sorted descending by match_score).
      8. For each recommendation, provide:
         - match_score: out of 100
         - why_it_matches: exactly 3 concise, highly descriptive bullets customized to their prompt
         - possible_mismatch: a honest caveat or content warning (e.g., "Contains gory scenes" or "Slow-burn pace in first few episodes")
         - watch_commitment: a human-friendly string (e.g. "Movie · 1h 44m" or "3 seasons · 26 eps · ~22 hours")
         - recommended_for: a fun, catchy short label (e.g. "For Mind-Bending Fans", "The Perfect Quick Thrill", "A Satisfying Weekend Marathon")
      9. Return 3 personalized refinement suggestions in "refinement_suggestions" (e.g. "Should I make this darker or faster-paced?").

      DO NOT CLAIM OR INVENT DETAILS NOT PRESENT IN THE CANDIDATE METADATA.
      RETURN VALID JSON ONLY.

      EXACT RESPONSE FORMAT SCHEMA:
      {
        "summary": "A short, professional, scannable overview of why this list was selected for them.",
        "best_match": {
          "title_id": "string (the matching candidate id)",
          "match_score": number,
          "why_it_matches": ["bullet 1", "bullet 2", "bullet 3"],
          "possible_mismatch": "string",
          "watch_commitment": "string"
        },
        "recommendations": [
          {
            "title_id": "string",
            "match_score": number,
            "why_it_matches": ["bullet 1", "bullet 2", "bullet 3"],
            "possible_mismatch": "string",
            "watch_commitment": "string",
            "recommended_for": "string"
          }
        ],
        "refinement_suggestions": ["string", "string", "string"]
      }
    `;

    let rankedResponse: any;
    try {
      const response = await callGeminiWithRetry({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      }, 1, 1000);

      const resultText = response.text || '{}';
      rankedResponse = JSON.parse(resultText.trim());
    } catch (apiErr) {
      console.warn('[Candidate Ranking] Gemini API rate limited or quota exhausted, using local scorer fallback:', apiErr);
      rankedResponse = generateFallbackRecommendations('', filters, validatedCandidates);
    }

    // Resolve details and accurate poster/backdrop images for the recommendations
    const movieDetails: Record<string, Movie> = {};
    const allIds = [
      rankedResponse.best_match?.title_id,
      ...(rankedResponse.recommendations?.map((r: any) => r.title_id) || [])
    ].filter(Boolean);

    const moviesToResolve: Movie[] = [];
    for (const id of allIds) {
      let m = candidates.find(c => c.id === id);
      if (!m) {
        // If Gemini recommends a brand new title not in candidates, we dynamically create a skeleton and resolve its poster!
        const cleanTitle = id.replace(/^(tmdb_|custom_)/, '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        m = {
          id,
          title: cleanTitle,
          year: 2023,
          contentType: 'movie',
          rating: 8.0,
          voteCount: 100,
          runtime: 120,
          genres: [],
          moods: [],
          pace: 'medium',
          languages: ['English'],
          countries: ['United States'],
          synopsis: `Recommended fit for your request.`,
          posterUrl: '',
          backdropUrl: '',
          cast: [],
          platforms: ['Netflix', 'Prime Video']
        };
      }
      moviesToResolve.push(m);
    }

    const resolvedMovies = await resolveBatchMovieImages(moviesToResolve);
    for (const rm of resolvedMovies) {
      movieDetails[rm.id] = rm;
    }

    rankedResponse.movieDetails = movieDetails;

    res.json(rankedResponse);
  } catch (error) {
    console.error('Error in Candidate Ranking:', error);
    const fallback = generateFallbackRecommendations('', user_filters || {}, curatedMovies);
    res.json(fallback);
  }
});

// Endpoint: Multi-step pipeline (Extract Filters -> Retrieve TMDB/Local -> Rank)
app.post('/api/discover', async (req, res) => {
  const { user_message, existing_preferences } = req.body;

  if (!user_message) {
    return res.status(400).json({ error: 'user_message is required' });
  }

  try {
    // Step 1: Extract filters
    const filterPrompt = `
      You are WatchMatch, an AI movie and series discovery agent.
      Convert the user's viewing request into structured search filters.
      Analyze the request and update existing preferences.

      USER MESSAGE: "${user_message}"
      EXISTING PREFERENCES: ${JSON.stringify(existing_preferences || {})}

      EXACT JSON SCHEMA TO RETURN:
      {
        "intent_type": "recommendation",
        "content_type": [],
        "genres": [],
        "subgenres": [],
        "moods": [],
        "themes": [],
        "pace": "any",
        "language_preferences": [],
        "country_preferences": [],
        "release_year_min": null,
        "release_year_max": null,
        "minimum_rating": null,
        "minimum_vote_count": null,
        "runtime_min_minutes": null,
        "runtime_max_minutes": null,
        "max_total_watch_hours": null,
        "series_status": "any",
        "ending_preference": "any",
        "content_exclusions": [],
        "platform_preferences": [],
        "similar_to_titles": [],
        "similar_to_people": [],
        "viewing_context": "any",
        "region": "IN",
        "sort_preference": "best_match",
        "assumptions": [],
        "clarifying_question": null
      }
    `;

    let filters: SearchFilters;
    try {
      const filterResponse = await callGeminiWithRetry({
        model: 'gemini-3.6-flash',
        contents: filterPrompt,
        config: {
          responseMimeType: 'application/json',
        },
      }, 1, 1000);

      filters = JSON.parse((filterResponse.text || '{}').trim());
    } catch (filterErr: any) {
      if (filterErr?.message === 'GEMINI_RATE_LIMIT_EXHAUSTED' || String(filterErr).includes('429')) {
        console.log('[Discover Pipeline] Rate limit/quota reached on filter extraction, using local extractor.');
      } else {
        console.log('[Discover Pipeline] Filter extraction notice:', filterErr?.message || filterErr);
      }
      filters = extractLocalFilters(user_message, existing_preferences);
    }

    // If there is a clarifying question, return immediately
    if (filters.clarifying_question) {
      return res.json({ filters, recommendations: null });
    }

    // Step 2: Retrieve live candidate titles from TMDB, TVMaze, and live Google Search
    const liveCandidates = await fetchLiveCandidatesForQuery(user_message, filters);

    // Combine live candidates and curated fallback list
    let candidates: Movie[] = [...liveCandidates];

    curatedMovies.forEach(cm => {
      if (!candidates.some(c => c.title.toLowerCase() === cm.title.toLowerCase())) {
        candidates.push(cm);
      }
    });


    // Step 3: Preliminarily filter candidates to keep context window small & relevant
    let filtered = candidates.filter(movie => {
      // Exclusions
      if (filters.content_exclusions && filters.content_exclusions.length > 0) {
        const hasExclusion = filters.content_exclusions.some(exc => {
          const excLower = exc.toLowerCase();
          return (
            movie.title.toLowerCase().includes(excLower) ||
            movie.synopsis.toLowerCase().includes(excLower) ||
            movie.genres.some(g => g.toLowerCase().includes(excLower)) ||
            (movie.contentWarnings && movie.contentWarnings.some(w => w.toLowerCase().includes(excLower)))
          );
        });
        if (hasExclusion) return false;
      }

      // Content Type
      if (filters.content_type && filters.content_type.length > 0) {
        const matchesType = filters.content_type.some(t => {
          if (t === 'anime' && (
            movie.contentType === 'anime' ||
            movie.genres.some(g => ['anime', 'animation'].includes(g.toLowerCase())) ||
            movie.languages.some(l => l.toLowerCase() === 'japanese')
          )) return true;
          if (t === 'series' && (movie.contentType === 'series' || movie.contentType === 'limited_series')) return true;
          return movie.contentType === t;
        });
        if (!matchesType) return false;
      }


      // Series status
      if (filters.series_status && filters.series_status !== 'any') {
        if (movie.contentType === 'series' || movie.contentType === 'limited_series') {
          if (movie.seriesStatus && movie.seriesStatus !== filters.series_status) {
            return false;
          }
        }
      }

      // Languages
      if (filters.language_preferences && filters.language_preferences.length > 0) {
        const hasLanguage = filters.language_preferences.some(lang => 
          movie.languages.some(l => l.toLowerCase() === lang.toLowerCase())
        );
        if (!hasLanguage) return false;
      }

      return true;
    });

    if (filtered.length < 4) {
      filtered = candidates.slice(0, 10);
    }

    const candidatesMetadata = filtered.map(c => ({
      id: c.id,
      title: c.title,
      year: c.year,
      contentType: c.contentType,
      rating: c.rating,
      voteCount: c.voteCount,
      runtime: c.runtime,
      seasons: c.seasons,
      episodes: c.episodes,
      genres: c.genres,
      subgenres: c.subgenres || [],
      moods: c.moods,
      pace: c.pace,
      languages: c.languages,
      seriesStatus: c.seriesStatus,
      endingPreference: c.endingPreference,
      contentWarnings: c.contentWarnings || [],
      platforms: c.platforms,
      synopsis: c.synopsis,
    }));

    // Step 4: Rank candidates
    const rankingPrompt = `
      You are WatchMatch, a movie and series discovery assistant.
      Rank these candidates against the user's filters.

      USER FILTERS:
      ${JSON.stringify(filters)}

      CANDIDATES:
      ${JSON.stringify(candidatesMetadata)}

      RANKING RULES:
      - Select a "best_match" representing the absolute best fit.
      - Return 5 to 10 ranked recommendation objects in "recommendations" (sorted descending by match_score).
      - Provide a "summary" of the overall selection.
      - For each, provide match_score (out of 100), exactly 3 why_it_matches bullets, possible_mismatch, and watch_commitment string.
      - Keep explanations highly scannable, engaging, and professional. Do not invent any facts.

      EXACT SCHEMA:
      {
        "summary": "...",
        "best_match": {
          "title_id": "...",
          "match_score": 95,
          "why_it_matches": ["...", "...", "..."],
          "possible_mismatch": "...",
          "watch_commitment": "..."
        },
        "recommendations": [
          {
            "title_id": "...",
            "match_score": 90,
            "why_it_matches": ["...", "...", "..."],
            "possible_mismatch": "...",
            "watch_commitment": "...",
            "recommended_for": "..."
          }
        ],
        "refinement_suggestions": ["...", "...", "..."]
      }
    `;

    let recommendations: any;
    try {
      const rankingResponse = await callGeminiWithRetry({
        model: 'gemini-3.6-flash',
        contents: rankingPrompt,
        config: {
          responseMimeType: 'application/json',
        },
      }, 1, 1000);

      recommendations = JSON.parse((rankingResponse.text || '{}').trim());
    } catch (rankErr: any) {
      if (rankErr?.message === 'GEMINI_RATE_LIMIT_EXHAUSTED' || String(rankErr).includes('429')) {
        console.log('[Discover Pipeline] Rate limit/quota reached on ranking, using local candidate scorer fallback.');
      } else {
        console.log('[Discover Pipeline] Ranking notice:', rankErr?.message || rankErr);
      }
      recommendations = generateFallbackRecommendations(user_message, filters, filtered);
    }

    // Resolve details and accurate poster/backdrop images for the recommendations
    const movieDetails: Record<string, Movie> = {};
    const allIds = [
      recommendations.best_match?.title_id,
      ...(recommendations.recommendations?.map((r: any) => r.title_id) || [])
    ].filter(Boolean);

    const moviesToResolve: Movie[] = [];
    for (const id of allIds) {
      let m = candidates.find(c => c.id === id);
      if (!m) {
        // If Gemini recommends a brand new title not in candidates, we dynamically create a skeleton and resolve its poster!
        const cleanTitle = id.replace(/^(tmdb_|custom_)/, '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        m = {
          id,
          title: cleanTitle,
          year: 2023,
          contentType: 'movie',
          rating: 8.0,
          voteCount: 100,
          runtime: 120,
          genres: [],
          moods: [],
          pace: 'medium',
          languages: ['English'],
          countries: ['United States'],
          synopsis: `Recommended fit for your request.`,
          posterUrl: '',
          backdropUrl: '',
          cast: [],
          platforms: ['Netflix', 'Prime Video']
        };
      }
      moviesToResolve.push(m);
    }

    const resolvedMovies = await resolveBatchMovieImages(moviesToResolve);
    for (const rm of resolvedMovies) {
      movieDetails[rm.id] = rm;
    }

    recommendations.movieDetails = movieDetails;

    res.json({ filters, recommendations });
  } catch (error) {
    console.error('Error in discover pipeline:', error);
    const fallbackFilters = extractLocalFilters(user_message, existing_preferences);
    const fallbackRecs = generateFallbackRecommendations(user_message, fallbackFilters, curatedMovies);
    res.json({ filters: fallbackFilters, recommendations: fallbackRecs });
  }
});

// Setup Vite Dev server or Serve Static production build
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { curatedMovies } from './src/data/curatedMovies.js'; // Import our curated list
import { SearchFilters, Movie, RecommendationResponse } from './src/types.js';
import {
  isTmdbConfigured,
  discoverCandidates,
  enrichMovies,
  searchTitles,
  findTitle,
  similarTo,
  detectLanguagesInText,
} from './server/tmdb.js';
import { rankByRelevance, buildQueryProfile, EmbedFn, RankedCandidate } from './server/relevance.js';
import {
  resolveLlm, generateJson, embedderFor, listModels, testConnection, describe as describeLlm, serverDefault,
  PROVIDERS, LlmError, LlmConfig, JsonSchema, ClientLlmSettings,
} from './server/llm/index.js';

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT) || 3000;

// Gemini client used only by the legacy Google-grounded search fallback (no TMDB key).
// Filter extraction and ranking go through the provider layer in server/llm/.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

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
    'romatic': 'romantic',
    'romcom': 'romantic comedy',
    'rom-com': 'romantic comedy',
    'animated': 'animation',
    'cartoon': 'animation',
    'mind bending': 'mind-bending',
    'mindbending': 'mind-bending',
    'feel good': 'feel-good',
    'light hearted': 'light-hearted',
  };

  Object.entries(typoMap).forEach(([typo, fix]) => {
    const reg = new RegExp(`\\b${typo}\\b`, 'gi');
    cleaned = cleaned.replace(reg, fix);
  });

  return cleaned;
}

// Fallback: Local keyword filter extractor when API rate limit or quota is reached
function extractKeywordFilters(userMessage: string, existingPreferences: any): SearchFilters {
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

  const isRefinementOnly = msg.startsWith('only') || msg.startsWith('make') || msg.startsWith('more') || msg.startsWith('less') || msg.includes('shorter') || msg.includes('longer') || msg.includes('netflix') || msg.includes('prime') || msg.includes('apple') || msg.includes('hulu');
  const prev = isRefinementOnly && existingPreferences ? existingPreferences : {};

  // Parse platform preferences
  const platform_preferences: string[] = prev.platform_preferences ? [...prev.platform_preferences] : [];

  if (msg.includes('netflix')) {
    if (!platform_preferences.includes('Netflix')) platform_preferences.push('Netflix');
  }
  if (msg.includes('prime') || msg.includes('amazon')) {
    if (!platform_preferences.includes('Prime Video')) platform_preferences.push('Prime Video');
  }
  if (msg.includes('hotstar') || msg.includes('jio')) {
    if (!platform_preferences.includes('JioHotstar')) platform_preferences.push('JioHotstar');
  }
  if (msg.includes('apple')) {
    if (!platform_preferences.includes('Apple TV')) platform_preferences.push('Apple TV');
  }
  if (msg.includes('hulu')) {
    if (!platform_preferences.includes('Hulu')) platform_preferences.push('Hulu');
  }
  if (msg.includes('disney')) {
    if (!platform_preferences.includes('Disney+')) platform_preferences.push('Disney+');
  }

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
    platform_preferences,
    similar_to_titles: similar_to_titles.length ? similar_to_titles : (isRefinementOnly ? prev.similar_to_titles || [] : []),
    similar_to_people: prev.similar_to_people || [],
    viewing_context: prev.viewing_context || 'any',
    region: 'IN',
    sort_preference: 'best_match',

    assumptions: ['Extracted via local keyword analysis during API rate limiting'],
    clarifying_question: null,
  };
}

const THEME_STOP_WORDS = new Set([
  'i', 'me', 'my', 'we', 'a', 'an', 'the', 'and', 'or', 'but', 'with', 'without', 'something', 'anything', 'some', 'want',
  'wanna', 'watch', 'see', 'looking', 'look', 'for', 'feel', 'feeling', 'like', 'mood', 'in', 'to', 'of', 'on', 'about',
  'that', 'this', 'is', 'are', 'be', 'good', 'great', 'best', 'movie', 'movies', 'film', 'films', 'show', 'shows', 'series',
  'tv', 'please', 'recommend', 'suggest', 'give', 'find', 'me', 'tonight', 'today', 'really', 'very', 'kind', 'type',
  'sort', 'can', 'you', 'have', 'has', 'not', 'no', 'too', 'more', 'less', 'less', 'from', 'set', 'where', 'which', 'who',
  'hours', 'hour', 'minutes', 'mins', 'min', 'under', 'over', 'less', 'than', 'after', 'before', 'old', 'new', 'recent',
  'latest', 'classic', 'rated', 'highly', 'top', 'finished', 'completed', 'ongoing', 'limited', 'netflix', 'prime', 'video',
  'hotstar', 'jiohotstar', 'apple', 'disney', 'zee5', 'sonyliv', 'amazon', 'hulu', 'language', 'dubbed', 'subtitles',
  'only', 'make', 'shorter', 'longer', 'else', 'instead', 'just', 'one', 'ones', 'them', 'those', 'these', 'same',
  'story', 'stories', 'night', 'kids', 'children', 'family', 'watching', 'starring', 'featuring', 'directed',
]);

// Local (no-LLM) filter extraction. Builds on the keyword extractor with things that used to be
// ignored: any language TMDB knows, decades/years, runtime limits, rating floors, "like <title>",
// and leftover descriptive words as TMDB keyword themes ("heist", "time travel", "zombie").
async function extractLocalFilters(userMessage: string, existingPreferences: any): Promise<SearchFilters> {
  const filters = extractKeywordFilters(userMessage, existingPreferences);
  const msg = normalizeQueryText(userMessage);
  const currentYear = new Date().getFullYear();

  // Languages (any language, not just Hindi/Korean/English)
  const detectedLanguages = await detectLanguagesInText(msg);
  if (/\b(bollywood|hindi|indian)\b/.test(msg) && !detectedLanguages.includes('Hindi')) detectedLanguages.push('Hindi');
  if (detectedLanguages.length) {
    filters.language_preferences = [...new Set([...filters.language_preferences, ...detectedLanguages])];
    // "indian" without Hindi explicitly means any Indian language, so let the country do the work
    if (/\bindian\b/.test(msg) && !/\b(hindi|bollywood)\b/.test(msg)) {
      filters.language_preferences = filters.language_preferences.filter(l => l !== 'Hindi');
    }
  }
  if (/\b(japanese|japan)\b/.test(msg) && !filters.country_preferences.includes('Japan')) filters.country_preferences.push('Japan');

  // Content types
  if (/\b(documentar(y|ies)|docuseries)\b/.test(msg) && !filters.content_type.includes('documentary')) filters.content_type.push('documentary');
  if (/\b(limited series|mini-?series)\b/.test(msg)) filters.content_type = ['limited_series'];

  // Decades and years: "90s", "1990s", "from 2015", "after 2010", "before 2000", "recent", "classic"
  const decade = msg.match(/\b(19|20)?(\d)0'?s\b/);
  if (decade) {
    const century = decade[1] || (Number(decade[2]) <= 2 ? '20' : '19');
    const start = Number(`${century}${decade[2]}0`);
    filters.release_year_min = start;
    filters.release_year_max = start + 9;
  }
  const after = msg.match(/\b(?:after|since|from|post)\s+((?:19|20)\d{2})\b/);
  if (after) filters.release_year_min = Number(after[1]);
  const before = msg.match(/\b(?:before|pre|until)\s+((?:19|20)\d{2})\b/);
  if (before) filters.release_year_max = Number(before[1]);
  if (/\b(recent|new|latest|this year|fresh)\b/.test(msg) && !filters.release_year_min) filters.release_year_min = currentYear - 3;
  if (/\b(classic|old school|vintage|old)\b/.test(msg) && !filters.release_year_max) filters.release_year_max = 1999;

  // Runtime: "under 2 hours", "less than 90 min", "short"
  const hours = msg.match(/\b(?:under|less than|below|max|within)\s+(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  const mins = msg.match(/\b(?:under|less than|below|max|within)\s+(\d+)\s*(?:m|min|mins|minutes)\b/);
  if (hours) filters.runtime_max_minutes = Math.round(Number(hours[1]) * 60);
  else if (mins) filters.runtime_max_minutes = Number(mins[1]);
  else if (/\bshort\b/.test(msg)) filters.runtime_max_minutes = 100;

  // Rating: "8+", "rated above 7.5", "highly rated", "best"
  const ratingMatch = msg.match(/\b(?:above|over|at least|rated)\s+(\d(?:\.\d)?)\b|\b(\d(?:\.\d)?)\s*\+/);
  if (ratingMatch) filters.minimum_rating = Number(ratingMatch[1] || ratingMatch[2]);
  else if (/\b(highly rated|critically acclaimed|acclaimed|masterpiece|top rated|best)\b/.test(msg)) filters.minimum_rating = 7.5;
  if (/\b(hidden gems?|underrated|lesser known)\b/.test(msg)) {
    filters.minimum_vote_count = 20;
    filters.sort_preference = 'rating';
  }

  // Series status
  if (/\b(finished|completed|ended|complete)\b/.test(msg)) filters.series_status = 'finished';
  if (/\b(ongoing|still running|airing)\b/.test(msg)) filters.series_status = 'ongoing';

  // "like Dark", "similar to Parasite", "shows like Breaking Bad" — any title, not a hardcoded list.
  const likeMatch = userMessage.match(/\b(?:like|similar to|same vibe as|in the vein of|such as)\s+([^,.!?;]+?)(?=\s+(?:but|and|with|without|on|in|from|that|under)\b|[,.!?;]|$)/i);
  if (likeMatch) {
    const seed = likeMatch[1].trim().replace(/^(the movie|the show|the series)\s+/i, '');
    if (seed.length > 1 && !filters.similar_to_titles.some(t => t.toLowerCase() === seed.toLowerCase())) {
      filters.similar_to_titles.push(seed);
    }
  }

  // Any TMDB genre word, not just the handful the keyword extractor knows
  const genreWordToName: Record<string, string> = {
    animation: 'Animation', family: 'Family', fantasy: 'Fantasy', adventure: 'Adventure', war: 'War',
    western: 'Western', history: 'History', historical: 'History', 'period drama': 'History', musical: 'Music',
    crime: 'Crime', mystery: 'Mystery', documentary: 'Documentary', action: 'Action', horror: 'Horror',
  };
  for (const [word, name] of Object.entries(genreWordToName)) {
    if (new RegExp(`\\b${word}\\b`).test(msg) && !filters.genres.includes(name)) filters.genres.push(name);
  }

  // Viewing context
  if (/\b(kids|children|family night|with (my )?family|whole family)\b/.test(msg)) {
    filters.viewing_context = 'family';
    if (!filters.genres.includes('Family')) filters.genres.push('Family');
  } else if (/\b(date night|with my (girlfriend|boyfriend|partner|wife|husband))\b/.test(msg)) {
    filters.viewing_context = 'date_night';
  }

  // People: "movies with Shah Rukh Khan", "directed by Christopher Nolan"
  const personMatch = userMessage.match(/\b(?:with|starring|featuring|by|directed by|from director)\s+((?:[A-Z][a-zA-Z.'-]+)(?:\s+[A-Z][a-zA-Z.'-]+){1,2})/);
  if (personMatch && !filters.similar_to_titles.some(t => t === personMatch[1])) {
    filters.similar_to_people = [...new Set([...filters.similar_to_people, personMatch[1]])];
    filters.similar_to_titles = filters.similar_to_titles.filter(t => t !== personMatch[1]);
  }

  // Exclusions: "no romance", "without gore", "not violent"
  const exclusions = [...msg.matchAll(/\b(?:no|without|not|avoid|skip)\s+([a-z-]+(?:\s+[a-z-]+)?)/g)].map(m => m[1].trim());
  if (exclusions.length) filters.content_exclusions = [...new Set([...filters.content_exclusions, ...exclusions])];
  filters.genres = filters.genres.filter(g => !filters.content_exclusions.some(e => e.toLowerCase() === g.toLowerCase()));

  // Leftover descriptive words become TMDB keyword themes. TMDB drops any that don't resolve.
  const seedWords = new Set([...filters.similar_to_titles, ...filters.similar_to_people].join(' ').toLowerCase().split(/\s+/));
  const exclusionWords = new Set(exclusions.join(' ').split(/\s+/));
  const knownWords = new Set([
    ...filters.genres.map(g => g.toLowerCase()),
    ...filters.language_preferences.map(l => l.toLowerCase()),
    'korean', 'indian', 'japanese', 'bollywood', 'anime', 'romantic', 'dark', 'funny', 'sad', 'painful',
  ]);
  const words = msg.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w =>
    w.length > 2 && !/^\d/.test(w) && !THEME_STOP_WORDS.has(w) && !seedWords.has(w) && !exclusionWords.has(w) && !knownWords.has(w)
  );
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) bigrams.push(`${words[i]} ${words[i + 1]}`);
  filters.themes = [...new Set([...filters.themes, ...bigrams, ...words])].slice(0, 10);

  if (filters.language_preferences.length || filters.similar_to_titles.length) {
    filters.assumptions = [...filters.assumptions, 'Expanded with local parsing for languages, years, runtime and themes'];
  }

  // Follow-up ("only movies", "under 2 hours"): the client only sends existing preferences for
  // refinements, so keep everything from the previous search that this message didn't set.
  if (existingPreferences && Object.keys(existingPreferences).length) {
    const prev = normalizeFilters(existingPreferences, filters.region);
    const merged: any = { ...filters };
    for (const [key, prevValue] of Object.entries(prev)) {
      const cur = (filters as any)[key];
      const unset = cur === null || cur === undefined || cur === 'any' || cur === 'best_match' || (Array.isArray(cur) && cur.length === 0);
      if (unset) merged[key] = prevValue;
    }
    merged.assumptions = ['Refined your previous search'];
    merged.clarifying_question = null;
    return merged as SearchFilters;
  }
  return filters;
}


// Candidate scorer and recommendation generator
function generateFallbackRecommendations(userMessage: string, filters: SearchFilters, candidates: Movie[]): RecommendationResponse {
  const normMsg = normalizeQueryText(userMessage);
  const msg = normMsg;
  const moodWords = ['dark', 'painful', 'sad', 'funny', 'scary', 'fast', 'slow', 'intense', 'comforting', 'romantic'];
  const platformStopWords = ['netflix', 'prime', 'apple', 'hulu', 'hotstar', 'disney', 'available', 'titles', 'shows', 'show', 'movies', 'movie', 'on', 'only', 'for', 'with', 'and', 'the'];
  const words = msg.split(/[\s,.'"]+/).filter(w => w.length > 2 && !['with', 'like', 'this', 'that', 'from', 'have', 'your', 'about', 'some', 'ending', ...platformStopWords].includes(w));


  const isRomanceRequested = msg.includes('romantic') || msg.includes('romance') || msg.includes('love') || filters.genres?.some(g => g.toLowerCase() === 'romance');
  const isDarkPainfulRequested = msg.includes('dark') || msg.includes('painful') || msg.includes('sad') || msg.includes('heartbreak') || msg.includes('tragic') || msg.includes('emotional');

  const requestedThemes = new Set([...(filters.themes || []), ...(filters.subgenres || [])].map(t => t.toLowerCase()));

  const scored = candidates.map((m, index) => {
    let score = 55;
    // Discovery returns the most relevant titles first; keep some of that signal.
    score += Math.max(0, 12 - Math.floor(index / 4));
    const titleLower = m.title.toLowerCase();
    const synLower = m.synopsis.toLowerCase();
    const genresLower = m.genres.map(g => g.toLowerCase());
    const langsLower = m.languages.map(l => l.toLowerCase());
    const countriesLower = m.countries.map(c => c.toLowerCase());
    const moodsLower = (m.moods || []).map(md => md.toLowerCase());
    const themesLower = (m.themes || []).map(th => th.toLowerCase());

    // Heavy penalty for meta talk shows, afterparties, or low-rated specials
    const isMetaTalkShow = genresLower.some(g => ['talk', 'talk-show', 'game-show', 'short'].includes(g)) ||
                           titleLower.includes('afterparty') ||
                           titleLower.includes('behind the scenes') ||
                           titleLower.includes('in conversation') ||
                           titleLower.includes('recap') ||
                           (m.rating && m.rating < 5.5);
    if (isMetaTalkShow) {
      score -= 60; // Never select meta talk shows like "The Netflix Afterparty"!
    }

    // Platform alignment boost
    if (filters.platform_preferences?.length) {
      const matchesPlatform = filters.platform_preferences.some(p => 
        (m.platforms || []).some(mp => mp.toLowerCase().includes(p.toLowerCase()))
      );
      if (matchesPlatform) {
        score += 30;
      }
    }

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

    // TMDB keyword overlap (e.g. requested "time travel" and the title is tagged "time travel")
    const themeHits = themesLower.filter(t => requestedThemes.has(t)).length;
    score += Math.min(18, themeHits * 6);

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
        `${best.contentType === 'movie' ? 'Film' : 'Series'} rated ${best.rating}/10 by ${(best.voteCount || 0).toLocaleString()} TMDB/IMDb voters`,
        best.platforms?.length ? `Streaming on ${best.platforms.slice(0, 2).join(', ')}` : `${best.year || ''} ${best.languages?.[0] || ''} ${best.contentType === 'movie' ? 'film' : 'series'}`.trim()
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
          `Rated ${m.rating}/10 (${(m.voteCount || 0).toLocaleString()} votes)`,
          m.platforms?.length ? `Streaming on ${m.platforms.slice(0, 2).join(', ')}` : `${m.year || ''} ${m.languages?.[0] || ''} ${m.contentType === 'movie' ? 'film' : 'series'}`.trim()
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



// Resolve real posters/backdrops from TMDB. TMDB titles also get full details here (runtime,
// seasons, cast, trailer, keywords, real streaming providers for the region). Titles from other
// sources (curated list, OMDb, TVMaze) are matched to TMDB by title + year for their artwork.
async function resolveBatchMovieImages(movies: Movie[], region = 'IN'): Promise<Movie[]> {
  if (!isTmdbConfigured()) return movies;
  const enriched = await enrichMovies(movies, region);
  return Promise.all(enriched.map(async m => {
    if (m.id.startsWith('tmdb_')) return m;
    const match = await findTitle(m.title, m.year || undefined, m.contentType);
    if (!match) return m;
    return {
      ...m,
      posterUrl: match.posterUrl || m.posterUrl,
      backdropUrl: match.backdropUrl || match.posterUrl || m.backdropUrl,
    };
  }));
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

// Helper: TMDB title search (used by the legacy multi-source path)
async function fetchFromTMDB(query: string): Promise<Movie[]> {
  return searchTitles(query);
}

// Candidate discovery. With a TMDB key this searches by attributes (genre, mood keywords,
// language, country, years, runtime, streaming provider) via /discover, which is what makes
// vague "what I feel like" requests work. Without TMDB it falls back to the legacy
// title-search sources (OMDb / TVMaze / Gemini grounding).
async function fetchLiveCandidatesForQuery(userMessage: string, filters: SearchFilters): Promise<Movie[]> {
  if (isTmdbConfigured()) {
    const { candidates, debug } = await discoverCandidates(filters, normalizeQueryText(userMessage));
    console.log(`[Discover] TMDB candidates: ${candidates.length} | ${JSON.stringify(debug)}`);

    // Short queries may just be a title ("interstellar", "dark"): include direct title hits too.
    if (userMessage.trim().split(/\s+/).length <= 4) {
      const direct = (await searchTitles(userMessage)).filter(m => m.posterUrl && m.voteCount > 20).slice(0, 5);
      for (const m of direct.reverse()) {
        if (!candidates.some(c => c.id === m.id)) candidates.unshift(m);
      }
    }

    // Too narrow? Relax the soft constraints (themes, years, rating) but keep the hard ones
    // (language, type, platform, exclusions) so we never drift off-request.
    if (candidates.length < 12) {
      const relaxed = await discoverCandidates({
        ...filters, themes: [], subgenres: [], moods: [], minimum_rating: null,
        release_year_min: null, release_year_max: null, minimum_vote_count: null,
      });
      for (const m of relaxed.candidates) {
        if (!candidates.some(c => c.id === m.id)) candidates.push(m);
      }
    }
    if (candidates.length > 0) return candidates;
    console.warn('[Discover] TMDB returned nothing (network or key issue) — using legacy sources.');
  }
  return legacyFetchLiveCandidates(userMessage, filters);
}

// Legacy title-search discovery (used only when TMDB is unavailable)
async function legacyFetchLiveCandidates(userMessage: string, filters: SearchFilters): Promise<Movie[]> {
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
  const platformWords = ['Netflix', 'Prime', 'Video', 'Amazon', 'Apple', 'Hulu', 'Disney', 'Jio', 'Hotstar', 'Show', 'Titles', 'Available', 'Only', 'Filter', 'Scout', 'Search'];
  const capMatches = userMessage.match(/([A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+)*)/g);
  if (capMatches) {
    capMatches.forEach(cm => {
      if (cm.length > 3 && !['Survival', 'Thriller', 'Movie', 'Series', 'Show', 'Ending', 'Satisfying', 'Your', 'Curated', ...platformWords].includes(cm)) {
        searchQueries.push(cm);
      }
    });
  }

  // If searchQueries is empty or platform preference was requested, supply top acclaimed platform seeds
  if (searchQueries.length === 0 || filters.platform_preferences?.length) {
    if (msg.includes('netflix') || filters.platform_preferences?.includes('Netflix')) {
      searchQueries.push('Stranger Things', 'Dark', 'Squid Game', 'The Crown', 'Ozark', 'Mindhunter', 'Black Mirror', 'Wednesday', 'Breaking Bad', 'Normal People');
    } else {
      searchQueries.push('Inception', 'Dark', 'Squid Game', 'Stranger Things', 'Interstellar');
    }
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
    // Exclude shorts, talk shows, afterparty recaps, or low-rated meta shows
    const isMetaOrTalkShow = m.genres.some(g => ['Documentary', 'Short', 'Game-Show', 'Talk', 'Talk-Show'].includes(g)) ||
                             m.title.toLowerCase().includes('afterparty') ||
                             m.title.toLowerCase().includes('in conversation') ||
                             m.title.toLowerCase().includes('behind the scenes') ||
                             m.title.toLowerCase().includes('the challenge') ||
                             (m.rating && m.rating < 5.5);
    if (!isMetaOrTalkShow && !candidates.some(c => c.title.toLowerCase() === m.title.toLowerCase())) {
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
      model: GEMINI_MODEL,
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

  if (isTmdbConfigured()) {
    const hits = (await searchTitles(query, 2))
      .filter(m => m.posterUrl)
      .sort((a, b) => b.voteCount - a.voteCount)
      .slice(0, 12);
    if (hits.length) {
      const resolved = await resolveBatchMovieImages(hits);
      return res.json({ results: resolved });
    }
  }

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
  const { id, title, genres = [], contentType, languages = [], countries = [] } = req.body;
  if (!title) return res.json({ results: [] });

  if (isTmdbConfigured()) {
    const recs = (await similarTo(id, title, contentType)).filter(m => m.posterUrl).slice(0, 6);
    if (recs.length) {
      const resolved = await resolveBatchMovieImages(recs);
      return res.json({ results: resolved });
    }
  }

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



// Endpoint: real TMDB artwork for the bundled curated titles (their stored URLs are placeholders)
app.get('/api/curated-art', async (_req, res) => {
  if (!isTmdbConfigured()) return res.json({ art: {} });
  const art: Record<string, { posterUrl: string; backdropUrl: string }> = {};
  await Promise.all(curatedMovies.map(async m => {
    const match = await findTitle(m.title, m.year, m.contentType);
    if (match?.posterUrl) art[m.id] = { posterUrl: match.posterUrl, backdropUrl: match.backdropUrl || match.posterUrl };
  }));
  res.set('Cache-Control', 'public, max-age=86400');
  res.json({ art });
});

// Endpoint: official TMDB artwork for arbitrary titles (home collections, profile seeds, and
// refreshing movies saved in the browser before posters came from TMDB).
// Body: { items: [{ title, year?, contentType? }] } → { art: { "<title>|<year>": { posterUrl, backdropUrl } } }
app.post('/api/posters', async (req, res) => {
  const items: any[] = Array.isArray(req.body?.items) ? req.body.items.slice(0, 40) : [];
  if (!isTmdbConfigured() || !items.length) return res.json({ art: {} });
  const art: Record<string, { posterUrl: string; backdropUrl: string }> = {};
  await Promise.all(items.map(async it => {
    const title = typeof it?.title === 'string' ? it.title.trim().slice(0, 200) : '';
    if (!title) return;
    const year = Number(it.year) || undefined;
    const match = await findTitle(title, year, it.contentType);
    if (match?.posterUrl) art[`${title}|${year || ''}`] = { posterUrl: match.posterUrl, backdropUrl: match.backdropUrl || match.posterUrl };
  }));
  res.json({ art });
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
    const { config: llm, skipped } = llmFor(req);
    if (!llm) throw new LlmError(`No AI available (${skipped})`, 'unavailable');
    const parsed = await generateJson(llm, { name: 'persona', prompt, schema: PERSONA_SCHEMA, maxTokens: 4000 });
    parsed.generatedAt = new Date().toISOString();
    res.json({ persona: parsed });
  } catch (err: any) {
    logLlmError('Persona', err);
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

// Structured-output schemas shared by every provider (OpenAI/NVIDIA strict json_schema, Claude
// structured outputs, Gemini responseJsonSchema). Every object lists all properties as required
// and sets additionalProperties: false; "unknown" is expressed as null.
const S = {
  str: { type: 'string' },
  strList: { type: 'array', items: { type: 'string' } },
  num: { type: 'number' },
  nullableNum: { anyOf: [{ type: 'number' }, { type: 'null' }] },
  nullableStr: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  oneOf: (values: string[]) => ({ type: 'string', enum: values }),
};
const strictObject = (properties: Record<string, any>): JsonSchema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const FILTER_SCHEMA = strictObject({
  intent_type: S.oneOf(['recommendation', 'search']),
  content_type: { type: 'array', items: S.oneOf(['movie', 'series', 'anime', 'documentary', 'limited_series']) },
  genres: S.strList,
  subgenres: S.strList,
  moods: S.strList,
  themes: S.strList,
  pace: S.oneOf(['slow', 'medium', 'fast', 'medium_to_fast', 'slow_to_medium', 'any']),
  language_preferences: S.strList,
  country_preferences: S.strList,
  release_year_min: S.nullableNum,
  release_year_max: S.nullableNum,
  minimum_rating: S.nullableNum,
  minimum_vote_count: S.nullableNum,
  runtime_min_minutes: S.nullableNum,
  runtime_max_minutes: S.nullableNum,
  max_total_watch_hours: S.nullableNum,
  series_status: S.oneOf(['finished', 'ongoing', 'cancelled', 'limited_series', 'any']),
  ending_preference: S.oneOf(['happy', 'tragic', 'satisfying', 'open_ended', 'bittersweet', 'any']),
  content_exclusions: S.strList,
  platform_preferences: S.strList,
  similar_to_titles: S.strList,
  similar_to_people: S.strList,
  viewing_context: S.oneOf(['solo', 'family', 'date_night', 'friends', 'late_night', 'background_viewing', 'any']),
  region: S.str,
  sort_preference: S.oneOf(['best_match', 'rating', 'popularity', 'freshness']),
  assumptions: S.strList,
  clarifying_question: S.nullableStr,
});

// Compact on purpose: output length dominates latency (NVIDIA free tier: 33s for full cards vs
// ~7s for this), and card facts are filled in from TMDB data so the model can't invent them.
const RANKING_SCHEMA = strictObject({
  summary: S.str,
  ranked: {
    type: 'array',
    items: strictObject({ id: S.str, score: S.num, reason: S.str, caveat: S.str }),
  },
  refinement_suggestions: S.strList,
});

const PERSONA_SCHEMA = strictObject({
  archetype: S.str,
  tagline: S.str,
  tasteDNA: strictObject({ mindBending: S.num, pacing: S.num, darkRealism: S.num, emotionalDepth: S.num, spectacle: S.num }),
  signatureTropes: S.strList,
  aiSummary: S.str,
  favoriteGenres: S.strList,
  recommendedSeeds: S.strList,
});

// Which AI (if any) serves this request: the user's own key from the settings panel, or the
// server's free default. Never throws; an unusable config just means local ranking.
function llmFor(req: express.Request) {
  return resolveLlm(req.body?.llm as ClientLlmSettings | undefined, req.ip || 'unknown');
}

function logLlmError(stage: string, err: any) {
  const kind = err instanceof LlmError ? err.kind : 'unavailable';
  console.warn(`[${stage}] AI call failed (${kind}): ${err?.message || err}`);
}

// Shared filter-extraction prompt (used by /api/extract-filters and /api/discover)
function buildFilterPrompt(userMessage: string, existingPreferences: any): string {
  return `
      You are WatchMatch, an AI movie and series discovery agent.
      Your job is to understand a user's viewing request (often a vague mood or feeling) and convert it into
      structured search filters that will be run against TMDB's discover API.

      USER MESSAGE: "${userMessage}"
      EXISTING PREFERENCES: ${JSON.stringify(existingPreferences || {})}

      RULES FOR FILTER EXTRACTION:
      - EXISTING PREFERENCES are the filters from the user's previous search. If the new message refines it
        ("only movies", "shorter", "on Netflix", "less violent", "more like the second one"), keep them and apply the change.
        If the new message is an unrelated fresh request, ignore them and start from scratch.
      - Return a valid JSON object matching the schema below.
      - If a filter cannot be determined, use null for numbers, "any" or "best_match" for string enums as specified, or an empty array for lists.
      - Default region is "IN". Default sort_preference is "best_match".
      - "genres" must only use these names: Action, Adventure, Animation, Comedy, Crime, Documentary, Drama, Family,
        Fantasy, History, Horror, Music, Mystery, Romance, Sci-Fi, Thriller, War, Western. Use at most 2-3.
      - "themes" is the most important field for moods. Translate the feeling into 3-8 short, concrete TMDB-style
        keywords, e.g. "time travel", "heist", "coming of age", "dystopia", "found family", "revenge", "small town",
        "serial killer", "slice of life", "feel-good", "tragedy", "survival", "psychological thriller", "road trip".
      - "language_preferences" uses English language names (e.g. "Korean", "Hindi", "Tamil", "Malayalam", "Japanese", "Spanish").
        "Indian" without a language means country_preferences ["India"] and no language.
      - "platform_preferences" uses names like Netflix, Prime Video, JioHotstar, Apple TV+, Zee5, SonyLIV.
      - If the user names a title they liked ("like Dark", "after watching Parasite"), put it in similar_to_titles.
      - If they name actors or directors, put them in similar_to_people.
      - Be extremely logical. If the user specifies "under 2 hours", set "runtime_max_minutes" to 120 and "max_total_watch_hours" to 2.
      - Decades: "90s" means release_year_min 1990 and release_year_max 1999. "Recent" means the last 3 years.
      - If they specify "series like Dark but finished", set similar_to_titles: ["Dark"], content_type: ["series"], and series_status: "finished".
      - "content_exclusions" should extract elements they don't want (e.g., "no romance", "no gore", "not violent" -> "romance", "gore", "violence").
      - Put any logical conclusions or deductions you made in "assumptions".
      - Only ask a "clarifying_question" if the request has no usable signal at all. A mood alone is enough to search.

      EXACT JSON SCHEMA TO RETURN:
      {
        "intent_type": "recommendation",
        "content_type": ["movie" | "series" | "anime" | "documentary" | "limited_series"],
        "genres": [string],
        "subgenres": [string],
        "moods": ["dark" | "comforting" | "intense" | "funny" | "emotional" | "mind-bending" | "relaxing" | "disturbing" | "inspiring" | "nostalgic" | "romantic" | "scary" | "sad" | "feel-good"],
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
}

// Fill any fields the LLM (or the filter panel) left out so downstream code can rely on them.
function normalizeFilters(raw: any, fallbackRegion = 'IN'): SearchFilters {
  const arr = (v: any) => (Array.isArray(v) ? v.filter((x: any) => typeof x === 'string' && x.trim()) : []);
  return {
    intent_type: raw?.intent_type || 'recommendation',
    content_type: arr(raw?.content_type) as SearchFilters['content_type'],
    genres: arr(raw?.genres),
    subgenres: arr(raw?.subgenres),
    moods: arr(raw?.moods),
    themes: arr(raw?.themes),
    pace: raw?.pace || 'any',
    language_preferences: arr(raw?.language_preferences),
    country_preferences: arr(raw?.country_preferences),
    release_year_min: raw?.release_year_min ?? null,
    release_year_max: raw?.release_year_max ?? null,
    minimum_rating: raw?.minimum_rating ?? null,
    minimum_vote_count: raw?.minimum_vote_count ?? null,
    runtime_min_minutes: raw?.runtime_min_minutes ?? null,
    runtime_max_minutes: raw?.runtime_max_minutes ?? null,
    max_total_watch_hours: raw?.max_total_watch_hours ?? null,
    series_status: raw?.series_status || 'any',
    ending_preference: raw?.ending_preference || 'any',
    content_exclusions: arr(raw?.content_exclusions),
    platform_preferences: arr(raw?.platform_preferences),
    similar_to_titles: arr(raw?.similar_to_titles),
    similar_to_people: arr(raw?.similar_to_people),
    viewing_context: raw?.viewing_context || 'any',
    region: raw?.region || fallbackRegion,
    sort_preference: raw?.sort_preference || 'best_match',
    assumptions: arr(raw?.assumptions),
    clarifying_question: raw?.clarifying_question || null,
  };
}

async function extractFilters(userMessage: string, existingPreferences: any, llm: LlmConfig | null): Promise<SearchFilters> {
  if (llm) {
    try {
      const raw = await generateJson(llm, { name: 'search_filters', prompt: buildFilterPrompt(userMessage, existingPreferences), schema: FILTER_SCHEMA, maxTokens: 4000 });
      return normalizeFilters(raw);
    } catch (err) {
      logLlmError('Filters', err);
    }
  }
  return extractLocalFilters(userMessage, existingPreferences);
}

function applyHardFilters(movies: Movie[], filters: SearchFilters): Movie[] {
  return movies.filter(movie => {
    if (filters.content_exclusions?.length) {
      const hasExclusion = filters.content_exclusions.some(exc => {
        const excLower = exc.toLowerCase();
        return (
          movie.genres.some(g => g.toLowerCase().includes(excLower)) ||
          (movie.themes || []).some(t => t.toLowerCase().includes(excLower)) ||
          (movie.contentWarnings || []).some(w => w.toLowerCase().includes(excLower))
        );
      });
      if (hasExclusion) return false;
    }

    if (filters.content_type?.length) {
      const matchesType = filters.content_type.some(t => {
        if (t === 'anime') return movie.contentType === 'anime' || (movie.genres.some(g => g.toLowerCase() === 'animation') && movie.languages.some(l => l.toLowerCase() === 'japanese'));
        if (t === 'series') return movie.contentType === 'series' || movie.contentType === 'limited_series';
        return movie.contentType === t;
      });
      if (!matchesType) return false;
    }

    if (filters.series_status && filters.series_status !== 'any' && movie.seriesStatus && movie.contentType !== 'movie') {
      const ok = filters.series_status === 'finished'
        ? ['finished', 'limited_series'].includes(movie.seriesStatus)
        : movie.seriesStatus === filters.series_status;
      if (!ok) return false;
    }

    if (filters.language_preferences?.length) {
      const hasLanguage = filters.language_preferences.some(lang => movie.languages.some(l => l.toLowerCase() === lang.toLowerCase()));
      if (!hasLanguage) return false;
    }

    // Runtime is only known after enrichment (0 = unknown), so don't drop unknowns.
    if (filters.runtime_max_minutes && movie.contentType === 'movie' && movie.runtime && movie.runtime > filters.runtime_max_minutes) return false;
    if (filters.minimum_rating && movie.rating && movie.rating < filters.minimum_rating) return false;
    // Direct title hits and seeds bypass TMDB's date filters, so check years here too.
    if (filters.release_year_min && movie.year && movie.year < filters.release_year_min) return false;
    if (filters.release_year_max && movie.year && movie.year > filters.release_year_max) return false;

    return true;
  });
}

// What the client sends about the user's history. Titles are what matter: ids differ between the
// curated list, older saved items and TMDB.
interface TasteItem { id: string; title: string; genres?: string[] }
interface TasteInput { watched?: TasteItem[]; liked?: TasteItem[]; disliked?: TasteItem[] }

function sanitizeTaste(raw: any): TasteInput {
  const list = (v: any): TasteItem[] => (Array.isArray(v) ? v : [])
    .filter((x: any) => x && typeof x.title === 'string')
    .slice(0, 60)
    .map((x: any) => ({ id: String(x.id || ''), title: x.title, genres: Array.isArray(x.genres) ? x.genres.slice(0, 6) : [] }));
  return { watched: list(raw?.watched), liked: list(raw?.liked), disliked: list(raw?.disliked) };
}

// Shared pipeline: live candidates -> taste exclusions -> hard filters -> relevance cut ->
// TMDB enrichment -> relevance re-sort -> LLM (or local) ranking -> id validation.
async function recommendForFilters(
  userMessage: string,
  filters: SearchFilters,
  opts: { extraCandidates?: Movie[]; taste?: TasteInput; llm?: LlmConfig | null; llmSkipped?: string } = {},
): Promise<RecommendationResponse> {
  const started = Date.now();
  const region = (filters.region || 'IN').toUpperCase();
  const taste = opts.taste || {};
  const timings: Record<string, number> = {};
  let mark = Date.now();
  const lap = (name: string) => { const now = Date.now(); timings[name] = now - mark; mark = now; };
  const candidates: Movie[] = await fetchLiveCandidatesForQuery(userMessage, filters);
  const liveCount = candidates.length;
  lap('discover');

  const addUnique = (list: Movie[]) => {
    for (const c of list) {
      if (c?.title && !candidates.some(e => e.id === c.id || e.title.toLowerCase() === c.title.toLowerCase())) candidates.push(c);
    }
  };

  // Taste seeds: when the request doesn't name a reference title, titles the user liked are the
  // next best signal. They still have to survive the hard filters and the relevance cut below.
  if (isTmdbConfigured() && !filters.similar_to_titles.length && taste.liked?.length) {
    const seeds = taste.liked.slice(-2);
    const seeded = await Promise.all(seeds.map(l => similarTo(l.id, l.title)));
    addUnique(seeded.flatMap(list => list.filter(m => m.posterUrl).slice(0, 8)));
  }
  addUnique(opts.extraCandidates || []);

  // The bundled curated list is a last resort, not a permanent part of every result set.
  if (candidates.length < 10) addUnique(curatedMovies);

  // Never recommend something the user has watched, disliked or dismissed.
  const seen = [...(taste.watched || []), ...(taste.disliked || [])];
  const seenIds = new Set(seen.map(s => s.id));
  const seenTitles = new Set(seen.map(s => s.title.toLowerCase()));
  const unseen = candidates.filter(c => !seenIds.has(c.id) && !seenTitles.has(c.title.toLowerCase()));

  let filtered = applyHardFilters(unseen, filters);
  if (filtered.length < 4) filtered = unseen.slice(0, 20);

  const llm = opts.llm || null;
  const embed: EmbedFn | undefined = embedderFor(llm);
  const likedGenres = (taste.liked || []).map(l => l.genres || []);

  // Cut to the 40 most relevant (not the first 40 that arrived), then enrich those.
  lap('seeds');
  const preRanked = await rankByRelevance(filtered, userMessage, filters, embed, likedGenres);
  lap('relevance');
  const shortlist = preRanked.slice(0, 40).map(r => r.movie);
  const enriched = applyHardFilters(await resolveBatchMovieImages(shortlist, region), filters)
    .filter(c => !seenTitles.has(c.title.toLowerCase()));
  const basePool = enriched.length >= 4 ? enriched : shortlist;

  // Re-sort with enrichment data (TMDB keywords are only known after details are fetched).
  lap('enrich');
  const poolRanked = await rankByRelevance(basePool, userMessage, filters, embed, likedGenres);
  lap('rerank');
  const pool = poolRanked.map(r => r.movie);

  const candidatesMetadata = pool.slice(0, 25).map(c => ({
    id: c.id,
    title: c.title,
    year: c.year,
    contentType: c.contentType,
    rating: c.rating,
    voteCount: c.voteCount,
    runtime: c.runtime || undefined,
    seasons: c.seasons,
    episodes: c.episodes,
    seriesStatus: c.seriesStatus,
    genres: c.genres,
    keywords: (c.themes || []).slice(0, 8),
    languages: c.languages,
    countries: c.countries,
    platforms: c.platforms,
    synopsis: c.synopsis.slice(0, 220),
  }));

  const tasteLines = [
    taste.liked?.length ? `The user LIKED: ${taste.liked.slice(-15).map(l => l.title).join(', ')}` : '',
    taste.disliked?.length ? `The user DISLIKED: ${taste.disliked.slice(-15).map(l => l.title).join(', ')}` : '',
  ].filter(Boolean).join('\n      ');

  const prompt = `
      You are WatchMatch, a movie and series discovery assistant.
      Rank the supplied candidate titles against the user's request and explain why each fits.

      USER REQUEST: "${userMessage}"
      USER FILTERS:
      ${JSON.stringify(filters)}
      ${tasteLines ? `\n      USER TASTE (use as a tiebreaker, never over the request itself):\n      ${tasteLines}\n` : ''}
      CANDIDATE TITLES (real TMDB data, pre-sorted by estimated relevance; "platforms" are subscription services in ${region}, empty = not streaming there):
      ${JSON.stringify(candidatesMetadata)}

      RANKING RULES:
      1. The user's mood/feeling and explicit requirements outweigh popularity. Use synopsis and keywords to judge tone.
      2. If the user asked for "finished" series, prefer finished shows; if "fast paced", don't rank a slow burn first.
      3. Mix well-known picks with lesser-known gems when they genuinely fit. Leave out candidates that don't fit.
      4. Return the best 7 to 10 in "ranked", best first. "id" MUST be copied exactly from a candidate "id".
      5. "score" 0-100 and honest: 90+ only for a near-perfect fit, below 60 for a loose fit.
      6. "reason": at most 15 words, tied to the user's own words. "caveat": at most 10 words, or "" if none.
      7. "summary": one sentence (max 25 words). "refinement_suggestions": 3 short things the user could type next.
      8. Only state facts present in the candidate data.
    `;

  let ranked: RecommendationResponse | null = null;
  let rankedBy = 'local';
  let invented = 0;
  if (llm) {
    try {
      const out = await generateJson(llm, { name: 'ranked_recommendations', prompt, schema: RANKING_SCHEMA, maxTokens: 1500 });
      const items: any[] = Array.isArray(out?.ranked) ? out.ranked : [];
      const byIdRank = new Map(poolRanked.map(r => [r.movie.id, r] as const));
      const seenIds = new Set<string>();
      const ordered: RankedCandidate[] = [];
      const notes = new Map<string, { score: number; reason: string; caveat: string }>();
      for (const it of items) {
        const r = byIdRank.get(it?.id);
        if (!r) { invented++; continue; }
        if (seenIds.has(r.movie.id)) continue;
        seenIds.add(r.movie.id);
        ordered.push(r);
        notes.set(r.movie.id, { score: Number(it.score) || 0, reason: String(it.reason || ''), caveat: String(it.caveat || '') });
      }
      if (ordered.length >= 3) {
        ranked = buildLocalRecommendations(userMessage, filters, ordered, notes);
        if (out.summary) ranked.summary = String(out.summary);
        if (Array.isArray(out.refinement_suggestions) && out.refinement_suggestions.length) ranked.refinement_suggestions = out.refinement_suggestions.slice(0, 3);
        rankedBy = describeLlm(llm);
      } else {
        console.warn(`[Ranking] AI returned only ${ordered.length} usable picks (${invented} unknown ids); using local ranking`);
      }
    } catch (err) {
      logLlmError('Ranking', err);
    }
  }
  if (!ranked) ranked = buildLocalRecommendations(userMessage, filters, poolRanked);
  lap('llmRank');

  const byId = new Map<string, Movie>(pool.map(m => [m.id, m]));
  const best = ranked.best_match;
  const recs = ranked.recommendations;

  const chosen = [best, ...recs].map(r => byId.get(r.title_id)).filter((m): m is Movie => !!m);
  const resolved = await resolveBatchMovieImages(chosen, region);
  const movieDetails: Record<string, Movie> = {};
  for (const m of resolved) movieDetails[m.id] = m;

  return {
    summary: ranked.summary || '',
    best_match: best,
    recommendations: recs,
    refinement_suggestions: ranked.refinement_suggestions || [],
    movieDetails,
    diagnostics: {
      source: isTmdbConfigured() ? 'tmdb' : 'legacy',
      rankedBy,
      llmSkipped: opts.llmSkipped,
      semantic: !!embed,
      liveCandidates: liveCount,
      afterTasteExclusion: unseen.length,
      afterHardFilters: filtered.length,
      pool: pool.length,
      inventedIdsDropped: invented,
      timings,
      ms: Date.now() - started,
    },
  };
}

// Local ranking used when Gemini is unavailable: trust the relevance order (keywords, genres,
// semantic similarity, quality) and explain each pick with facts from its TMDB data.
function buildLocalRecommendations(
  userMessage: string,
  filters: SearchFilters,
  ranked: RankedCandidate[],
  notes?: Map<string, { score: number; reason: string; caveat: string }>,
): RecommendationResponse {
  const q = buildQueryProfile(userMessage, filters);
  const top = ranked.slice(0, notes ? 10 : 9);
  const hi = top[0]?.relevance || 1;
  const lo = top[top.length - 1]?.relevance || 0;

  const formatRuntime = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`);
  const commitment = (m: Movie) => m.contentType === 'movie'
    ? (m.runtime ? `Movie · ${formatRuntime(m.runtime)}` : 'Movie')
    : [m.seasons ? `${m.seasons} season${m.seasons > 1 ? 's' : ''}` : '', m.episodes ? `${m.episodes} eps` : ''].filter(Boolean).join(' · ') || 'Series';

  const card = (m: Movie, relevance: number, i: number) => {
    const matched = (m.themes || []).filter(k => [...q.terms.keys()].some(t => k.toLowerCase().includes(t))).slice(0, 3);
    const typeLabel = m.contentType === 'movie' ? 'film' : m.contentType === 'anime' ? 'anime' : m.contentType === 'documentary' ? 'documentary' : 'series';
    const note = notes?.get(m.id);
    const why = [
      note?.reason || (matched.length ? `Tagged ${matched.join(', ')}` : `${m.genres.slice(0, 3).join(', ') || 'Fits your request'}`),
      `${m.languages[0] || ''} ${typeLabel} from ${m.year || 'n/a'} · rated ${m.rating}/10 by ${(m.voteCount || 0).toLocaleString()} viewers`.trim(),
      m.platforms.length ? `Streaming on ${m.platforms.slice(0, 2).join(', ')}` : 'Not on a subscription service in India right now',
    ];
    const caveats = [
      m.seriesStatus === 'ongoing' ? 'Still ongoing, so no ending yet' : '',
      m.contentType === 'movie' && m.runtime > 150 ? `Long watch at ${formatRuntime(m.runtime)}` : '',
      m.languages[0] && m.languages[0] !== 'English' ? `In ${m.languages[0]} (subtitles)` : '',
      m.voteCount < 100 ? 'Few ratings so far' : '',
    ].filter(Boolean);
    // Spread scores 70-95 by relative relevance so the numbers mean something.
    const localScore = Math.round(70 + 25 * (hi > lo ? (relevance - lo) / (hi - lo) : 1)) - (i === 0 ? 0 : 1);
    return {
      title_id: m.id,
      match_score: note ? Math.max(0, Math.min(100, Math.round(note.score))) : Math.max(60, Math.min(97, localScore)),
      why_it_matches: why,
      possible_mismatch: note?.caveat || caveats[0] || '',
      watch_commitment: commitment(m),
      recommended_for: m.genres[0] ? `For ${m.genres[0]} fans` : 'Worth a look',
    };
  };

  const cards = top.map((r, i) => card(r.movie, r.relevance, i));
  const summaryBits = [
    filters.moods.length ? filters.moods.join(', ') : '',
    filters.genres.length ? filters.genres.join(' / ') : '',
    filters.language_preferences.length ? `in ${filters.language_preferences.join(' or ')}` : '',
    filters.similar_to_titles.length ? `like ${filters.similar_to_titles.join(', ')}` : '',
  ].filter(Boolean).join(' · ');

  const suggestions = [
    !filters.content_type.length ? 'Only movies' : '',
    !filters.runtime_max_minutes ? 'Under 2 hours' : '',
    !filters.platform_preferences.length ? 'Only on Netflix' : '',
    !filters.release_year_min ? 'Only recent releases' : '',
    'Something lighter',
  ].filter(Boolean).slice(0, 3);

  return {
    summary: `Picked from TMDB matches for ${summaryBits || `"${userMessage}"`}, ordered by how closely each title's keywords, genres and story fit.`,
    best_match: cards[0],
    recommendations: cards.slice(1),
    refinement_suggestions: suggestions,
  };
}

// Self-check: average match score of the top picks, penalised when we returned too few.
function resultQuality(r: RecommendationResponse): number {
  const scores = [r.best_match, ...r.recommendations].slice(0, 4).map(x => Number(x?.match_score) || 0);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const count = 1 + r.recommendations.length;
  return avg - Math.max(0, 6 - count) * 5;
}

// One critique-and-retry pass: show the LLM what its filters produced and let it fix them
// (over-constrained filters, wrong language, themes that didn't capture the mood).
async function reviseFilters(userMessage: string, filters: SearchFilters, result: RecommendationResponse, llm: LlmConfig): Promise<SearchFilters | null> {
  const picks = [result.best_match, ...result.recommendations].slice(0, 8).map(r => {
    const m = result.movieDetails?.[r.title_id];
    return `${m?.title || r.title_id} (${m?.year || '?'}, ${m?.languages?.[0] || '?'}) — score ${r.match_score}; mismatch: ${r.possible_mismatch || 'none'}`;
  });
  const prompt = `
      You are reviewing a movie search that returned weak matches.

      USER REQUEST: "${userMessage}"
      FILTERS USED: ${JSON.stringify(filters)}
      RESULTS (${picks.length}):
      ${picks.join('\n      ')}

      Diagnose why the results are weak (too few results means filters were too strict; off-mood results
      mean the themes/genres didn't capture the feeling). Return corrected filters in the same schema.
      Keep every explicit requirement from the user (language, type, platform, runtime). Loosen or replace
      only what the user did not explicitly ask for. Themes must be short TMDB-style keywords.
    `;
  try {
    const raw = await generateJson(llm, { name: 'search_filters', prompt, schema: FILTER_SCHEMA, maxTokens: 4000 });
    const revised = normalizeFilters(raw, filters.region);
    revised.clarifying_question = null;
    return revised;
  } catch (err) {
    logLlmError('Self-check', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// AI settings endpoints (used by the frontend settings panel). Keys sent here are used for the
// one request and never stored or logged; the server's own default key is never returned.
// ---------------------------------------------------------------------------

app.get('/api/llm/config', (_req, res) => {
  const def = serverDefault();
  res.json({
    free: def
      ? { available: true, provider: def.provider, providerLabel: PROVIDERS[def.provider].label, model: def.model, semantic: !!def.embedModel }
      : { available: false },
    providers: Object.values(PROVIDERS).map(p => ({
      id: p.id, label: p.label, defaultModel: p.defaultModel, keyUrl: p.keyUrl, keyHint: p.keyHint,
      needsBaseUrl: !!p.needsBaseUrl, semantic: !!p.embedModel,
    })),
  });
});

const modelListCache = new Map<string, { at: number; models: string[] }>();

app.post('/api/llm/models', async (req, res) => {
  const { config, skipped, error } = llmFor(req);
  if (!config) return res.status(400).json({ error: error || `AI unavailable (${skipped})` });
  const cacheKey = config.isServerDefault ? `default|${config.provider}` : '';
  const cached = cacheKey ? modelListCache.get(cacheKey) : undefined;
  if (cached && Date.now() - cached.at < 3_600_000) return res.json({ models: cached.models, current: config.model });
  try {
    const models = await listModels(config);
    if (cacheKey) modelListCache.set(cacheKey, { at: Date.now(), models });
    res.json({ models, current: config.model });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Could not list models' });
  }
});

app.post('/api/llm/test', async (req, res) => {
  const { config, skipped, error } = llmFor(req);
  if (!config) return res.status(400).json({ ok: false, error: error || `AI unavailable (${skipped})` });
  try {
    const result = await testConnection(config);
    res.json({ ...result, provider: config.provider, model: config.model, semantic: !!embedderFor(config) });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err?.message || 'Connection failed' });
  }
});

// Mode 1: Filter Extraction Endpoint
app.post('/api/extract-filters', async (req, res) => {
  const { user_message, existing_preferences } = req.body;
  if (!user_message) {
    return res.status(400).json({ error: 'user_message is required' });
  }
  const filters = await extractFilters(user_message, existing_preferences, llmFor(req).config);
  res.json({ filters, clarifying_question: filters.clarifying_question || null });
});

// Mode 2: Candidate Ranking Endpoint (structured filter panel)
app.post('/api/rank-candidates', async (req, res) => {
  const { user_filters, candidate_titles, taste } = req.body;
  if (!user_filters) {
    return res.status(400).json({ error: 'user_filters is required' });
  }

  const filters = normalizeFilters(user_filters);
  const context = [
    ...filters.moods,
    ...filters.genres,
    ...filters.themes,
    ...filters.similar_to_titles.map(t => `like ${t}`),
  ].join(', ') || 'popular, well-rated titles';

  try {
    const { config: llm, skipped } = llmFor(req);
    const result = await recommendForFilters(context, filters, {
      extraCandidates: Array.isArray(candidate_titles) ? candidate_titles : [],
      taste: sanitizeTaste(taste),
      llm,
      llmSkipped: skipped,
    });
    res.json(result);
  } catch (error) {
    console.error('Error in Candidate Ranking:', error);
    res.json(generateFallbackRecommendations('', filters, curatedMovies));
  }
});

// Endpoint: Multi-step pipeline (Extract Filters -> Discover on TMDB -> Enrich -> Rank -> Self-check)
app.post('/api/discover', async (req, res) => {
  const { user_message, existing_preferences, taste: rawTaste } = req.body;
  if (!user_message) {
    return res.status(400).json({ error: 'user_message is required' });
  }
  const taste = sanitizeTaste(rawTaste);
  const { config: llm, skipped: llmSkipped } = llmFor(req);

  try {
    const t0 = Date.now();
    let filters = await extractFilters(user_message, existing_preferences, llm);
    const filterMs = Date.now() - t0;
    if (filters.clarifying_question) {
      return res.json({ filters, recommendations: null });
    }
    let recommendations = await recommendForFilters(user_message, filters, { taste, llm, llmSkipped });

    // Only an LLM produces calibrated scores, so the retry only runs when one ranked the results.
    const firstQuality = resultQuality(recommendations);
    if (llm && recommendations.diagnostics?.rankedBy !== 'local' && firstQuality < 65) {
      const revised = await reviseFilters(user_message, filters, recommendations, llm);
      if (revised) {
        const second = await recommendForFilters(user_message, revised, { taste, llm, llmSkipped });
        const secondQuality = resultQuality(second);
        console.log(`[Self-check] quality ${firstQuality.toFixed(0)} -> ${secondQuality.toFixed(0)}`);
        if (secondQuality > firstQuality) {
          filters = revised;
          recommendations = second;
        }
        recommendations.diagnostics = { ...recommendations.diagnostics, selfCheck: { firstQuality, secondQuality } };
      }
    }

    recommendations.diagnostics = { ...recommendations.diagnostics, filterMs };
    console.log(`[Discover] "${user_message}" via ${recommendations.diagnostics?.rankedBy} in ${Date.now() - t0}ms | filters ${filterMs}ms | ${JSON.stringify(recommendations.diagnostics?.timings)}`);
    res.json({ filters, recommendations });
  } catch (error) {
    console.error('Error in discover pipeline:', error);
    const fallbackFilters = await extractLocalFilters(user_message, existing_preferences);
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

if (!process.env.VERCEL) {
  startServer();
}

export default app;

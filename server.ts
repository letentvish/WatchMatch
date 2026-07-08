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

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

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

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
      },
    });

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

  } catch (error) {
    console.warn('[Poster Scout] Batch resolution failed/exhausted, using fallback placeholder:', error);
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

// Helper: Normalize TMDB content to our Movie format if they provide a TMDB key
async function fetchFromTMDB(query: string): Promise<Movie[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&api_key=${apiKey}&language=en-US&page=1&include_adult=false`
    );
    if (!response.ok) return [];
    const data = await response.json();
    
    const movies: Movie[] = [];
    for (const item of data.results || []) {
      if (item.media_type !== 'movie' && item.media_type !== 'tv') continue;
      
      const isMovie = item.media_type === 'movie';
      const id = `tmdb_${item.id}`;
      const title = isMovie ? item.title : item.name;
      const year = new Date(isMovie ? item.release_date : item.first_air_date).getFullYear() || 2020;
      
      movies.push({
        id,
        title,
        year,
        contentType: isMovie ? 'movie' : 'series',
        rating: Math.round((item.vote_average || 7.0) * 10) / 10,
        voteCount: item.vote_count || 100,
        runtime: isMovie ? 120 : 45, // Defaults
        genres: [], // Will populate or let Gemini infer
        moods: [],
        pace: 'medium',
        languages: [item.original_language === 'hi' ? 'Hindi' : 'English'],
        countries: [item.origin_country?.[0] || 'United States'],
        synopsis: item.overview || '',
        posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&q=80',
        backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1200&q=80',
        cast: [],
        platforms: ['Netflix', 'Prime Video'] // default mock
      });
    }
    return movies;
  } catch (error) {
    console.error('Error fetching from TMDB:', error);
    return [];
  }
}

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

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const resultText = response.text || '{}';
    const parsedFilters = JSON.parse(resultText.trim());

    res.json({ filters: parsedFilters, clarifying_question: parsedFilters.clarifying_question });
  } catch (error) {
    console.error('Error in Filter Extraction:', error);
    res.status(500).json({ error: 'Failed to extract search filters' });
  }
});

// Mode 2: Candidate Ranking Endpoint
app.post('/api/rank-candidates', async (req, res) => {
  const { user_filters, candidate_titles } = req.body;

  if (!user_filters) {
    return res.status(400).json({ error: 'user_filters is required' });
  }

  try {
    // 1. Gather all candidate movies
    // We combine our pre-populated curatedMovies with any titles retrieved from API
    let candidates: Movie[] = [...curatedMovies];

    // If external candidates are passed, we add them (avoiding duplicates)
    if (Array.isArray(candidate_titles) && candidate_titles.length > 0) {
      candidate_titles.forEach((c: any) => {
        if (!candidates.some(existing => existing.title.toLowerCase() === c.title.toLowerCase())) {
          candidates.push(c);
        }
      });
    }

    // 2. Candidate Validation & Preliminary Filtering
    const filters = user_filters as SearchFilters;
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
          if (t === 'anime' && movie.contentType === 'anime') return true;
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

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const resultText = response.text || '{}';
    const rankedResponse = JSON.parse(resultText.trim());

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
    res.status(500).json({ error: 'Failed to rank candidates' });
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

    const filterResponse = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: filterPrompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const filters = JSON.parse((filterResponse.text || '{}').trim());

    // If there is a clarifying question, return immediately
    if (filters.clarifying_question) {
      return res.json({ filters, recommendations: null });
    }

    // Step 2: Retrieve candidate titles
    // We try to query TMDB if a key exists using keywords extracted from themes/similar_to_titles/genres
    let apiCandidates: Movie[] = [];
    const searchQuery = [...(filters.similar_to_titles || []), ...(filters.themes || []), ...(filters.genres || [])].join(' ');
    if (searchQuery && process.env.TMDB_API_KEY) {
      apiCandidates = await fetchFromTMDB(searchQuery);
    }

    // Combine local and API candidates
    let candidates: Movie[] = [...curatedMovies];
    apiCandidates.forEach(ac => {
      if (!candidates.some(c => c.title.toLowerCase() === ac.title.toLowerCase())) {
        candidates.push(ac);
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
          if (t === 'anime' && movie.contentType === 'anime') return true;
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

    const rankingResponse = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: rankingPrompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const recommendations = JSON.parse((rankingResponse.text || '{}').trim());

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
    res.status(500).json({ error: 'Failed discovery request' });
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

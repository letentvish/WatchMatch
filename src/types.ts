export type ContentType = 'movie' | 'series' | 'anime' | 'documentary' | 'limited_series';

export interface Movie {
  id: string; // matches title_id
  title: string;
  year: number;
  contentType: ContentType;
  rating: number;
  voteCount: number;
  runtime: number; // in minutes for movies, or typical episode runtime
  seasons?: number; // for series
  episodes?: number; // for series
  genres: string[];
  subgenres?: string[];
  moods: string[];
  themes?: string[];
  pace: 'slow_burn' | 'medium' | 'fast';
  languages: string[];
  countries: string[];
  seriesStatus?: 'finished' | 'ongoing' | 'cancelled' | 'limited_series';
  endingPreference?: 'happy' | 'tragic' | 'satisfying' | 'open_ended';
  contentWarnings?: string[];
  platforms: string[]; // e.g. Netflix, Prime Video, JioHotstar, Apple TV
  synopsis: string;
  posterUrl: string;
  cast: string[];
  trailerUrl?: string; // YouTube embedding / search link
  backdropUrl?: string;
  moodScale?: {
    darkness: number; // 1-5
    pace: number; // 1-5
    mindBending: number; // 1-5
    violence: number; // 1-5
  };
}

export interface SearchFilters {
  intent_type: 'recommendation' | 'search';
  content_type: ContentType[];
  genres: string[];
  subgenres: string[];
  moods: string[];
  themes: string[];
  pace: 'slow' | 'medium' | 'fast' | 'medium_to_fast' | 'slow_to_medium' | 'any';
  language_preferences: string[];
  country_preferences: string[];
  release_year_min: number | null;
  release_year_max: number | null;
  minimum_rating: number | null;
  minimum_vote_count: number | null;
  runtime_min_minutes: number | null;
  runtime_max_minutes: number | null;
  max_total_watch_hours: number | null;
  series_status: 'finished' | 'ongoing' | 'cancelled' | 'limited_series' | 'any';
  ending_preference: 'happy' | 'tragic' | 'satisfying' | 'open_ended' | 'any';
  content_exclusions: string[];
  platform_preferences: string[];
  similar_to_titles: string[];
  similar_to_people: string[];
  viewing_context: 'solo' | 'family' | 'date_night' | 'friends' | 'late_night' | 'background_viewing' | 'any';
  region: string; // "IN" by default
  sort_preference: 'best_match' | 'rating' | 'popularity' | 'freshness';
  assumptions: string[];
  clarifying_question: string | null;
}

export interface RecommendationCardInfo {
  title_id: string;
  match_score: number;
  why_it_matches: string[];
  possible_mismatch: string;
  watch_commitment: string;
  recommended_for?: string;
}

export interface RecommendationResponse {
  summary: string;
  best_match: RecommendationCardInfo;
  recommendations: RecommendationCardInfo[];
  refinement_suggestions: string[];
  movieDetails?: Record<string, Movie>;
}

export interface CinephilePersona {
  archetype: string;
  tagline: string;
  tasteDNA: {
    mindBending: number; // 0-100
    pacing: number; // 0-100
    darkRealism: number; // 0-100
    emotionalDepth: number; // 0-100
    spectacle: number; // 0-100
  };
  signatureTropes: string[];
  aiSummary: string;
  favoriteGenres: string[];
  recommendedSeeds: string[];
  generatedAt: string;
}

export interface TasteProfile {
  watchlist: string[]; // movie IDs
  watched: string[]; // movie IDs for already watched titles
  liked: string[]; // movie IDs
  disliked: string[]; // movie IDs
  notInterested: string[]; // movie IDs
  history: string[]; // movie IDs
  ratings: Record<string, number>; // movie ID -> rating 1-5
  dislikedTraits: string[];
  preferredTraits: string[];
  savedMoviesDict?: Record<string, Movie>;
  persona?: CinephilePersona;
}

export interface Message {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
  filters?: SearchFilters;
  recommendations?: RecommendationResponse;
  isLoading?: boolean;
}


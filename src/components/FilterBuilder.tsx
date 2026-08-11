import React, { useState } from 'react';
import { Sliders, Check, RefreshCw, Sparkles, AlertCircle } from 'lucide-react';
import { SearchFilters, ContentType } from '../types';

interface FilterBuilderProps {
  initialFilters?: SearchFilters;
  onApplyFilters: (filters: SearchFilters) => void;
  isLoading: boolean;
}

export default function FilterBuilder({ initialFilters, onApplyFilters, isLoading }: FilterBuilderProps) {
  const defaultFilters: SearchFilters = {
    intent_type: 'recommendation',
    content_type: [],
    genres: [],
    subgenres: [],
    moods: [],
    themes: [],
    pace: 'any',
    language_preferences: [],
    country_preferences: [],
    release_year_min: null,
    release_year_max: null,
    minimum_rating: null,
    minimum_vote_count: null,
    runtime_min_minutes: null,
    runtime_max_minutes: null,
    max_total_watch_hours: null,
    series_status: 'any',
    ending_preference: 'any',
    content_exclusions: [],
    platform_preferences: [],
    similar_to_titles: [],
    similar_to_people: [],
    viewing_context: 'any',
    region: 'IN',
    sort_preference: 'best_match',
    assumptions: [],
    clarifying_question: null,
  };

  const [filters, setFilters] = useState<SearchFilters>(initialFilters || defaultFilters);

  const contentTypes: { value: ContentType; label: string }[] = [
    { value: 'movie', label: 'Movie' },
    { value: 'series', label: 'Series' },
    { value: 'anime', label: 'Anime' },
    { value: 'documentary', label: 'Documentary' },
    { value: 'limited_series', label: 'Limited Series' },
  ];

  const genresList = ['Mystery', 'Science Fiction', 'Thriller', 'Crime', 'Horror', 'Action', 'Drama', 'Fantasy', 'Comedy', 'Adventure', 'History'];
  const moodsList = ['dark', 'comforting', 'intense', 'funny', 'emotional', 'mind-bending', 'relaxing', 'disturbing', 'inspiring', 'nostalgic'];
  
  const platformsList = ['Netflix', 'Prime Video', 'JioHotstar', 'Apple TV', 'Zee5', 'SonyLIV'];
  const languagesList = ['English', 'Hindi', 'Korean', 'Japanese', 'Spanish'];

  const handleToggleContentType = (type: ContentType) => {
    setFilters(prev => {
      const isSelected = prev.content_type.includes(type);
      return {
        ...prev,
        content_type: isSelected 
          ? prev.content_type.filter(t => t !== type) 
          : [...prev.content_type, type]
      };
    });
  };

  const handleToggleGenre = (genre: string) => {
    setFilters(prev => {
      const isSelected = prev.genres.includes(genre);
      return {
        ...prev,
        genres: isSelected 
          ? prev.genres.filter(g => g !== genre) 
          : [...prev.genres, genre]
      };
    });
  };

  const handleToggleMood = (mood: string) => {
    setFilters(prev => {
      const isSelected = prev.moods.includes(mood);
      return {
        ...prev,
        moods: isSelected 
          ? prev.moods.filter(m => m !== mood) 
          : [...prev.moods, mood]
      };
    });
  };

  const handleTogglePlatform = (platform: string) => {
    setFilters(prev => {
      const isSelected = prev.platform_preferences.includes(platform);
      return {
        ...prev,
        platform_preferences: isSelected 
          ? prev.platform_preferences.filter(p => p !== platform) 
          : [...prev.platform_preferences, platform]
      };
    });
  };

  const handleToggleLanguage = (lang: string) => {
    setFilters(prev => {
      const isSelected = prev.language_preferences.includes(lang);
      return {
        ...prev,
        language_preferences: isSelected 
          ? prev.language_preferences.filter(l => l !== lang) 
          : [...prev.language_preferences, lang]
      };
    });
  };

  const handleToggleExclusion = (exclusion: string) => {
    setFilters(prev => {
      const isSelected = prev.content_exclusions.includes(exclusion);
      return {
        ...prev,
        content_exclusions: isSelected 
          ? prev.content_exclusions.filter(e => e !== exclusion) 
          : [...prev.content_exclusions, exclusion]
      };
    });
  };

  const handleCommitment = (type: 'short' | 'medium' | 'long' | 'clear') => {
    setFilters(prev => {
      if (type === 'clear') {
        return { ...prev, runtime_max_minutes: null, max_total_watch_hours: null };
      }
      if (type === 'short') {
        return { ...prev, runtime_max_minutes: 90, max_total_watch_hours: 2 };
      }
      if (type === 'medium') {
        return { ...prev, runtime_max_minutes: 150, max_total_watch_hours: 15 };
      }
      // Long
      return { ...prev, runtime_max_minutes: null, max_total_watch_hours: 50 };
    });
  };

  const handleReset = () => {
    setFilters(defaultFilters);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoading) {
      onApplyFilters(filters);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-6">
        <div className="flex items-center space-x-3">
          <Sliders className="w-6 h-6 text-wm-accent" />
          <h2 className="text-2xl font-extrabold text-white tracking-tight">Advanced Filter Console</h2>
        </div>
        <button
          id="btn-reset-filters"
          onClick={handleReset}
          className="flex items-center space-x-1.5 text-xs text-gray-400 hover:text-white bg-wm-card hover:bg-wm-card-hover px-3.5 py-2 rounded-lg font-mono transition border border-gray-800"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reset All</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8" id="filter-builder-form">
        {/* 1. Format / Content Type */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold font-mono tracking-wider text-gray-400 uppercase">Format Preference</h3>
          <div className="flex flex-wrap gap-2">
            {contentTypes.map((type) => {
              const active = filters.content_type.includes(type.value);
              return (
                <button
                  id={`filter-format-${type.value}`}
                  type="button"
                  key={type.value}
                  onClick={() => handleToggleContentType(type.value)}
                  className={`px-4 py-2.5 rounded-lg text-sm font-semibold border transition-all duration-200 flex items-center space-x-1.5 ${
                    active 
                      ? 'bg-wm-accent text-white border-wm-accent shadow-md' 
                      : 'bg-wm-card border-gray-800 text-gray-300 hover:text-white hover:bg-wm-card-hover'
                  }`}
                >
                  {active && <Check className="w-4 h-4" />}
                  <span>{type.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Mood Scale and Tone */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold font-mono tracking-wider text-gray-400 uppercase">Mood & Tone Vibe</h3>
          <div className="flex flex-wrap gap-2">
            {moodsList.map((mood) => {
              const active = filters.moods.includes(mood);
              return (
                <button
                  id={`filter-mood-${mood}`}
                  type="button"
                  key={mood}
                  onClick={() => handleToggleMood(mood)}
                  className={`px-4 py-2.5 rounded-lg text-sm font-semibold border transition-all duration-200 flex items-center space-x-1.5 capitalize ${
                    active 
                      ? 'bg-wm-accent text-white border-wm-accent shadow-md' 
                      : 'bg-wm-card border-gray-800 text-gray-300 hover:text-white hover:bg-wm-card-hover'
                  }`}
                >
                  {active && <Check className="w-4 h-4" />}
                  <span>{mood}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Pace Choice */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold font-mono tracking-wider text-gray-400 uppercase">Narrative Pacing</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {['any', 'slow', 'medium', 'fast'].map((p) => {
              const active = filters.pace === p;
              return (
                <button
                  id={`filter-pace-${p}`}
                  type="button"
                  key={p}
                  onClick={() => setFilters(prev => ({ ...prev, pace: p as any }))}
                  className={`py-3 rounded-lg text-sm font-semibold border transition-all text-center capitalize ${
                    active 
                      ? 'bg-wm-accent text-white border-wm-accent shadow-md' 
                      : 'bg-wm-card border-gray-800 text-gray-300 hover:text-white hover:bg-wm-card-hover'
                  }`}
                >
                  {p === 'any' ? 'Any Pace' : p === 'slow' ? 'Slow Burn' : p === 'medium' ? 'Balanced' : 'Fast-Paced'}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Watch Commitment */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold font-mono tracking-wider text-gray-400 uppercase">Watch Commitment Size</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              id="filter-commitment-short"
              type="button"
              onClick={() => handleCommitment('short')}
              className={`p-4 rounded-lg border text-left transition-all ${
                filters.runtime_max_minutes === 90 
                  ? 'bg-wm-card border-wm-accent text-white shadow-lg' 
                  : 'bg-wm-card border-gray-800 hover:border-gray-700 hover:bg-wm-card-hover'
              }`}
            >
              <div className="font-bold text-sm text-white flex items-center justify-between">
                <span>Under 90 Minutes</span>
                {filters.runtime_max_minutes === 90 && <Check className="w-4 h-4 text-wm-accent" />}
              </div>
              <p className="text-gray-400 text-xs mt-1">Perfect for a quick, impactful movie night with no fluff.</p>
            </button>
            <button
              id="filter-commitment-medium"
              type="button"
              onClick={() => handleCommitment('medium')}
              className={`p-4 rounded-lg border text-left transition-all ${
                filters.max_total_watch_hours === 15 && filters.runtime_max_minutes !== 90
                  ? 'bg-wm-card border-wm-accent text-white shadow-lg' 
                  : 'bg-wm-card border-gray-800 hover:border-gray-700 hover:bg-wm-card-hover'
              }`}
            >
              <div className="font-bold text-sm text-white flex items-center justify-between">
                <span>Weekend Binge (&lt; 15 hrs)</span>
                {filters.max_total_watch_hours === 15 && filters.runtime_max_minutes !== 90 && <Check className="w-4 h-4 text-wm-accent" />}
              </div>
              <p className="text-gray-400 text-xs mt-1">Perfect size for limited series, finished storyboards.</p>
            </button>
            <button
              id="filter-commitment-long"
              type="button"
              onClick={() => handleCommitment('long')}
              className={`p-4 rounded-lg border text-left transition-all ${
                filters.max_total_watch_hours === 50
                  ? 'bg-wm-card border-wm-accent text-white shadow-lg' 
                  : 'bg-wm-card border-gray-800 hover:border-gray-700 hover:bg-wm-card-hover'
              }`}
            >
              <div className="font-bold text-sm text-white flex items-center justify-between">
                <span>Long Binge (Multi-Season)</span>
                {filters.max_total_watch_hours === 50 && <Check className="w-4 h-4 text-wm-accent" />}
              </div>
              <p className="text-gray-400 text-xs mt-1">Immersive stories, many seasons to lose yourself in.</p>
            </button>
          </div>
        </div>

        {/* 5. Genres */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold font-mono tracking-wider text-gray-400 uppercase">Genres of Interest</h3>
          <div className="flex flex-wrap gap-2">
            {genresList.map((g) => {
              const active = filters.genres.includes(g);
              return (
                <button
                  id={`filter-genre-${g.toLowerCase()}`}
                  type="button"
                  key={g}
                  onClick={() => handleToggleGenre(g)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition ${
                    active 
                      ? 'bg-wm-accent text-white border-wm-accent' 
                      : 'bg-wm-card border-gray-800 text-gray-300 hover:text-white hover:bg-wm-card-hover'
                  }`}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </div>

        {/* 6. Content Controls (Avoid) */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold font-mono tracking-wider text-gray-400 uppercase">Content Exclusions (Avoid)</h3>
          <div className="flex flex-wrap gap-2">
            {['Romance', 'Excessive Gore', 'Extreme Violence', 'Jump Scares', 'Sad Ending', 'Cliffhangers'].map((exc) => {
              const active = filters.content_exclusions.includes(exc.toLowerCase());
              return (
                <button
                  id={`filter-avoid-${exc.toLowerCase().replace(' ', '-')}`}
                  type="button"
                  key={exc}
                  onClick={() => handleToggleExclusion(exc.toLowerCase())}
                  className={`px-3.5 py-2 rounded-lg text-xs font-mono font-bold border transition ${
                    active 
                      ? 'bg-red-950 text-red-300 border-red-700' 
                      : 'bg-wm-card border-gray-800 text-gray-400 hover:text-red-400 hover:border-red-900'
                  }`}
                >
                  <span>Avoid {exc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 7. Streaming Platforms */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold font-mono tracking-wider text-gray-400 uppercase">Available Platforms</h3>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            {platformsList.map((plat) => {
              const active = filters.platform_preferences.includes(plat);
              return (
                <button
                  id={`filter-platform-${plat.toLowerCase()}`}
                  type="button"
                  key={plat}
                  onClick={() => handleTogglePlatform(plat)}
                  className={`py-2.5 rounded-lg text-xs font-bold border transition text-center ${
                    active 
                      ? 'bg-white text-wm-bg border-white font-black' 
                      : 'bg-wm-card border-gray-800 text-gray-400 hover:text-white hover:bg-wm-card-hover'
                  }`}
                >
                  {plat}
                </button>
              );
            })}
          </div>
        </div>

        {/* 8. Languages */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold font-mono tracking-wider text-gray-400 uppercase">Languages</h3>
          <div className="flex flex-wrap gap-2">
            {languagesList.map((lang) => {
              const active = filters.language_preferences.includes(lang);
              return (
                <button
                  id={`filter-lang-${lang.toLowerCase()}`}
                  type="button"
                  key={lang}
                  onClick={() => handleToggleLanguage(lang)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition ${
                    active 
                      ? 'bg-wm-accent text-white border-wm-accent' 
                      : 'bg-wm-card border-gray-800 text-gray-300 hover:text-white hover:bg-wm-card-hover'
                  }`}
                >
                  {lang}
                </button>
              );
            })}
          </div>
        </div>

        {/* Submit */}
        <div className="pt-6 border-t border-gray-800 flex justify-end">
          <button
            id="filter-scout-submit"
            type="submit"
            disabled={isLoading}
            className="w-full md:w-auto px-8 py-4 bg-wm-accent hover:bg-red-700 text-white font-bold rounded-lg transition shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 text-base"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Search with Structured Filters</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

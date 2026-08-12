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
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-12 py-10 space-y-8" id="filter-builder-view">
      {/* Header */}
      <div className="glass-panel border border-white/15 p-6 md:p-8 rounded-3xl flex items-center justify-between shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-gradient-to-br from-red-600 to-rose-600 rounded-2xl text-white shadow-[0_0_20px_-3px_rgba(229,9,20,0.6)]">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight font-heading">Advanced Filter Console</h2>
            <p className="text-gray-300 text-xs sm:text-sm font-sans mt-0.5">Customize format, pacing, mood vibes, and exclusions for hyper-focused scouting.</p>
          </div>
        </div>

        <button
          id="btn-reset-filters"
          type="button"
          onClick={handleReset}
          className="flex items-center space-x-2 text-xs text-gray-300 hover:text-red-400 glass-card border border-white/15 hover:border-red-500/40 px-4 py-3 rounded-xl font-bold transition duration-200 shrink-0 cursor-pointer font-mono"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reset All</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start" id="filter-builder-form">
        {/* LEFT 8 COLUMNS: Filter Controls */}
        <div className="lg:col-span-8 space-y-8">

        {/* 1. Format / Content Type */}
        <div className="glass-card border border-white/10 p-6 rounded-3xl space-y-4 shadow-xl">
          <h3 className="text-xs font-bold font-mono tracking-wider text-red-400 uppercase flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span>Format Preference</span>
          </h3>
          <div className="flex flex-wrap gap-2.5">
            {contentTypes.map((type) => {
              const active = filters.content_type.includes(type.value);
              return (
                <button
                  id={`filter-format-${type.value}`}
                  type="button"
                  key={type.value}
                  onClick={() => handleToggleContentType(type.value)}
                  className={`px-5 py-3 rounded-2xl text-xs font-extrabold border transition-all duration-200 flex items-center space-x-2 cursor-pointer font-sans ${
                    active 
                      ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white border-red-500 shadow-[0_0_20px_-3px_rgba(229,9,20,0.5)]' 
                      : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:border-white/20'
                  }`}
                >
                  {active && <Check className="w-4 h-4 text-white" />}
                  <span>{type.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Mood Scale and Tone */}
        <div className="glass-card border border-white/10 p-6 rounded-3xl space-y-4 shadow-xl">
          <h3 className="text-xs font-bold font-mono tracking-wider text-red-400 uppercase flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span>Mood & Tone Vibe</span>
          </h3>
          <div className="flex flex-wrap gap-2.5">
            {moodsList.map((mood) => {
              const active = filters.moods.includes(mood);
              return (
                <button
                  id={`filter-mood-${mood}`}
                  type="button"
                  key={mood}
                  onClick={() => handleToggleMood(mood)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all duration-200 flex items-center space-x-1.5 capitalize cursor-pointer font-sans ${
                    active 
                      ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white border-red-500 shadow-md' 
                      : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:border-white/20'
                  }`}
                >
                  {active && <Check className="w-3.5 h-3.5 text-white" />}
                  <span>{mood}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Pace Choice */}
        <div className="glass-card border border-white/10 p-6 rounded-3xl space-y-4 shadow-xl">
          <h3 className="text-xs font-bold font-mono tracking-wider text-red-400 uppercase flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span>Narrative Pacing</span>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {['any', 'slow', 'medium', 'fast'].map((p) => {
              const active = filters.pace === p;
              return (
                <button
                  id={`filter-pace-${p}`}
                  type="button"
                  key={p}
                  onClick={() => setFilters(prev => ({ ...prev, pace: p as any }))}
                  className={`py-3.5 rounded-2xl text-xs font-extrabold border transition-all text-center capitalize cursor-pointer font-sans ${
                    active 
                      ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white border-red-500 shadow-md' 
                      : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:border-white/20'
                  }`}
                >
                  {p === 'any' ? 'Any Pace' : p === 'slow' ? 'Slow Burn' : p === 'medium' ? 'Balanced' : 'Fast-Paced'}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Watch Commitment */}
        <div className="glass-card border border-white/10 p-6 rounded-3xl space-y-4 shadow-xl">
          <h3 className="text-xs font-bold font-mono tracking-wider text-red-400 uppercase flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span>Watch Commitment Size</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-sans">
            <button
              id="filter-commitment-short"
              type="button"
              onClick={() => handleCommitment('short')}
              className={`p-5 rounded-2xl border text-left transition-all cursor-pointer ${
                filters.runtime_max_minutes === 90 
                  ? 'bg-red-500/15 border-red-500 text-white shadow-[0_0_20px_-5px_rgba(229,9,20,0.5)]' 
                  : 'bg-white/5 border-white/10 hover:border-white/20'
              }`}
            >
              <div className="font-extrabold text-sm text-white flex items-center justify-between font-heading">
                <span>Under 90 Minutes</span>
                {filters.runtime_max_minutes === 90 && <Check className="w-4 h-4 text-red-500" />}
              </div>
              <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">Perfect for a quick, impactful movie night with zero filler.</p>
            </button>

            <button
              id="filter-commitment-medium"
              type="button"
              onClick={() => handleCommitment('medium')}
              className={`p-5 rounded-2xl border text-left transition-all cursor-pointer ${
                filters.max_total_watch_hours === 15 && filters.runtime_max_minutes !== 90
                  ? 'bg-red-500/15 border-red-500 text-white shadow-[0_0_20px_-5px_rgba(229,9,20,0.5)]' 
                  : 'bg-white/5 border-white/10 hover:border-white/20'
              }`}
            >
              <div className="font-extrabold text-sm text-white flex items-center justify-between font-heading">
                <span>Weekend Binge (&lt; 15 hrs)</span>
                {filters.max_total_watch_hours === 15 && filters.runtime_max_minutes !== 90 && <Check className="w-4 h-4 text-red-500" />}
              </div>
              <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">Ideal size for limited series and complete story arcs.</p>
            </button>

            <button
              id="filter-commitment-long"
              type="button"
              onClick={() => handleCommitment('long')}
              className={`p-5 rounded-2xl border text-left transition-all cursor-pointer ${
                filters.max_total_watch_hours === 50
                  ? 'bg-red-500/15 border-red-500 text-white shadow-[0_0_20px_-5px_rgba(229,9,20,0.5)]' 
                  : 'bg-white/5 border-white/10 hover:border-white/20'
              }`}
            >
              <div className="font-extrabold text-sm text-white flex items-center justify-between font-heading">
                <span>Long Binge (Multi-Season)</span>
                {filters.max_total_watch_hours === 50 && <Check className="w-4 h-4 text-red-500" />}
              </div>
              <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">Deep immersive worlds with multiple rich seasons.</p>
            </button>
          </div>
        </div>

        {/* 5. Genres */}
        <div className="glass-card border border-white/10 p-6 rounded-3xl space-y-4 shadow-xl">
          <h3 className="text-xs font-bold font-mono tracking-wider text-red-400 uppercase flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span>Genres of Interest</span>
          </h3>
          <div className="flex flex-wrap gap-2.5">
            {genresList.map((g) => {
              const active = filters.genres.includes(g);
              return (
                <button
                  id={`filter-genre-${g.toLowerCase()}`}
                  type="button"
                  key={g}
                  onClick={() => handleToggleGenre(g)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition cursor-pointer font-mono uppercase ${
                    active 
                      ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white border-red-500 shadow-md' 
                      : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:border-white/20'
                  }`}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </div>

        {/* 6. Content Controls (Avoid) */}
        <div className="glass-card border border-white/10 p-6 rounded-3xl space-y-4 shadow-xl">
          <h3 className="text-xs font-bold font-mono tracking-wider text-red-400 uppercase flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span>Content Exclusions (Avoid)</span>
          </h3>
          <div className="flex flex-wrap gap-2.5">
            {['Romance', 'Excessive Gore', 'Extreme Violence', 'Jump Scares', 'Sad Ending', 'Cliffhangers'].map((exc) => {
              const active = filters.content_exclusions.includes(exc.toLowerCase());
              return (
                <button
                  id={`filter-avoid-${exc.toLowerCase().replace(' ', '-')}`}
                  type="button"
                  key={exc}
                  onClick={() => handleToggleExclusion(exc.toLowerCase())}
                  className={`px-4 py-2.5 rounded-xl text-xs font-mono font-extrabold border transition cursor-pointer ${
                    active 
                      ? 'bg-red-500/25 text-red-200 border-red-500 shadow' 
                      : 'bg-white/5 border-white/10 text-gray-400 hover:text-red-300 hover:border-red-500/40'
                  }`}
                >
                  <span>Avoid {exc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 7. Streaming Platforms */}
        <div className="glass-card border border-white/10 p-6 rounded-3xl space-y-4 shadow-xl">
          <h3 className="text-xs font-bold font-mono tracking-wider text-red-400 uppercase flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span>Available Platforms</span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {platformsList.map((plat) => {
              const active = filters.platform_preferences.includes(plat);
              return (
                <button
                  id={`filter-platform-${plat.toLowerCase()}`}
                  type="button"
                  key={plat}
                  onClick={() => handleTogglePlatform(plat)}
                  className={`py-3 rounded-xl text-xs font-extrabold border transition text-center cursor-pointer font-sans ${
                    active 
                      ? 'bg-white text-black border-white shadow-lg' 
                      : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:border-white/20'
                  }`}
                >
                  {plat}
                </button>
              );
            })}
          </div>
        </div>

        {/* 8. Languages */}
        <div className="glass-card border border-white/10 p-6 rounded-3xl space-y-4 shadow-xl">
          <h3 className="text-xs font-bold font-mono tracking-wider text-red-400 uppercase flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span>Languages</span>
          </h3>
          <div className="flex flex-wrap gap-2.5">
            {languagesList.map((lang) => {
              const active = filters.language_preferences.includes(lang);
              return (
                <button
                  id={`filter-lang-${lang.toLowerCase()}`}
                  type="button"
                  key={lang}
                  onClick={() => handleToggleLanguage(lang)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition cursor-pointer font-sans ${
                    active 
                      ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white border-red-500 shadow-md' 
                      : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:border-white/20'
                  }`}
                >
                  {lang}
                </button>
              );
            })}
          </div>
        </div>
        </div>

        {/* RIGHT 4 COLUMNS: Sticky Active Filter Summary & Submit Panel */}


        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
          <div className="glass-panel border border-white/15 p-6 md:p-8 rounded-3xl space-y-6 shadow-2xl backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="text-sm font-black text-white font-heading uppercase tracking-wider flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-red-500" />
                <span>Console Summary</span>
              </h3>
              <span className="bg-red-500/20 text-red-300 border border-red-500/30 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold">
                Active
              </span>
            </div>

            <div className="space-y-4 text-xs font-sans">
              <div>
                <span className="text-gray-400 font-mono text-[10px] uppercase font-bold block mb-1">Selected Formats</span>
                <span className="text-white font-extrabold text-sm block">
                  {filters.content_type.length > 0 ? filters.content_type.map(formatContentType).join(', ') : 'All Formats (Any)'}
                </span>
              </div>

              <div>
                <span className="text-gray-400 font-mono text-[10px] uppercase font-bold block mb-1">Selected Moods</span>
                <span className="text-white font-extrabold text-sm block capitalize">
                  {filters.moods.length > 0 ? filters.moods.join(', ') : 'Any Mood'}
                </span>
              </div>

              <div>
                <span className="text-gray-400 font-mono text-[10px] uppercase font-bold block mb-1">Pacing & Commitment</span>
                <span className="text-white font-extrabold text-sm block capitalize">
                  {filters.pace} pace · {filters.runtime_max_minutes ? `Under ${filters.runtime_max_minutes} mins` : 'Any duration'}
                </span>
              </div>

              {filters.content_exclusions.length > 0 && (
                <div>
                  <span className="text-red-400 font-mono text-[10px] uppercase font-bold block mb-1">Content Exclusions</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {filters.content_exclusions.map((e, idx) => (
                      <span key={idx} className="bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase">
                        Avoid {e}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              id="filter-scout-submit"
              type="submit"
              disabled={isLoading}
              className="w-full px-8 py-4.5 bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 hover:scale-[1.02] text-white font-extrabold rounded-2xl transition duration-200 shadow-[0_0_35px_-5px_rgba(229,9,20,0.6)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2.5 text-base cursor-pointer"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>Execute Filter Scout</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}



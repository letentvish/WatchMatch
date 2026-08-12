import React, { useState } from 'react';
import { User, Heart, Trash2, Sliders, Flame, Trash, Bookmark, RefreshCw, Star, Info, CheckCircle2, Filter, Sparkles, Brain, Compass, Award, Zap, Film } from 'lucide-react';
import { TasteProfile, Movie, CinephilePersona } from '../types';
import { curatedMovies } from '../data/curatedMovies';
import { getCleanImageUrl, handleImageLoadError } from '../utils/imageHelper';

interface ProfileViewProps {
  tasteProfile: TasteProfile;
  onRemoveFromWatchlist: (movieId: string) => void;
  onRemoveFromLikes: (movieId: string) => void;
  onRemoveFromDislikes: (movieId: string) => void;
  onRemoveFromWatched?: (movieId: string) => void;
  onToggleWatched?: (movieId: string) => void;
  onResetTasteProfile: () => void;
  onMovieClick: (movie: Movie) => void;
  onGeneratePersona?: () => Promise<void> | void;
  onSaveMovie?: (movie: Movie) => void;
}

export default function ProfileView({
  tasteProfile,
  onRemoveFromWatchlist,
  onRemoveFromLikes,
  onRemoveFromDislikes,
  onRemoveFromWatched,
  onToggleWatched,
  onResetTasteProfile,
  onMovieClick,
  onGeneratePersona,
  onSaveMovie,
}: ProfileViewProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'unwatched' | 'watched'>('all');
  const [isGeneratingPersona, setIsGeneratingPersona] = useState(false);
  const [seedOffset, setSeedOffset] = useState<number>(0);


  // Helper to resolve movie by ID from saved dictionary or curated list
  const getMovieById = (id: string): Movie | undefined => {
    return tasteProfile.savedMoviesDict?.[id] || curatedMovies.find(m => m.id === id);
  };

  // Load complete movie details for watchlist, watched, liked, disliked
  const watchedIds = tasteProfile.watched || [];
  const watchlistMovies = (tasteProfile.watchlist || []).map(id => getMovieById(id)).filter(Boolean) as Movie[];
  const watchedMovies = watchedIds.map(id => getMovieById(id)).filter(Boolean) as Movie[];
  const unwatchedWatchlistMovies = watchlistMovies.filter(m => !watchedIds.includes(m.id));
  const likedMovies = (tasteProfile.liked || []).map(id => getMovieById(id)).filter(Boolean) as Movie[];
  const dislikedMovies = (tasteProfile.disliked || []).map(id => getMovieById(id)).filter(Boolean) as Movie[];

  const handlePersonaClick = async () => {
    if (!onGeneratePersona) return;
    setIsGeneratingPersona(true);
    try {
      await onGeneratePersona();
    } finally {
      setIsGeneratingPersona(false);
    }
  };

  const persona: CinephilePersona | undefined = tasteProfile.persona;


  // Compute favorite genres from liked movies
  const genresCount: Record<string, number> = {};
  likedMovies.forEach(m => {
    m.genres.forEach(g => {
      genresCount[g] = (genresCount[g] || 0) + 1;
    });
  });
  const favoriteGenres = Object.entries(genresCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(x => x[0]);

  // Compute favorite moods from liked movies
  const moodsCount: Record<string, number> = {};
  likedMovies.forEach(m => {
    m.moods.forEach(md => {
      moodsCount[md] = (moodsCount[md] || 0) + 1;
    });
  });
  const favoriteMoods = Object.entries(moodsCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(x => x[0]);

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-12 py-8 space-y-10" id="taste-profile-view">
      {/* Main 2-Column Grid Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT 8 COLUMNS: CineTaste Passport & Library */}
        <div className="lg:col-span-8 space-y-10">
          {/* 1. Header Profile Summary */}
          <div className="glass-panel border border-white/15 p-6 md:p-8 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl relative overflow-hidden">
            <div className="flex items-center space-x-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-600 to-rose-600 text-white flex items-center justify-center flex-shrink-0 shadow-[0_0_30px_-5px_rgba(229,9,20,0.6)] border border-white/20">
                <User className="w-8 h-8 fill-white" />
              </div>
              <div className="text-center md:text-left space-y-1">
                <div className="flex items-center justify-center md:justify-start space-x-2">
                  <h2 className="text-2xl font-black text-white font-heading">Your CineTaste Passport</h2>
                  <span className="bg-red-500/20 text-red-400 border border-red-500/40 text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold uppercase">
                    Active Profile
                  </span>
                </div>
                <p className="text-gray-300 text-xs sm:text-sm font-sans leading-relaxed">
                  WatchMatch continuously learns from your likes, dislikes, and viewing history to craft hyper-personalized recommendations.
                </p>
              </div>
            </div>

            <button
              id="btn-clear-profile"
              onClick={onResetTasteProfile}
              className="flex items-center space-x-2 text-xs text-gray-300 hover:text-red-400 glass-card border border-white/15 hover:border-red-500/40 px-4 py-3 rounded-xl font-bold transition duration-200 shrink-0 cursor-pointer font-mono"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Clear Taste History</span>
            </button>
          </div>


      {/* 2. AI CINEPHILE PERSONA IDENTITY CARD */}
      <div className="glass-panel border border-white/15 rounded-3xl p-6 md:p-8 space-y-6 shadow-[0_0_80px_-15px_rgba(229,9,20,0.3)] relative overflow-hidden backdrop-blur-2xl">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-red-600/15 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div className="flex items-center space-x-3.5">
            <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-500 shadow-md">
              <Brain className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] bg-gradient-to-r from-red-600 to-rose-600 text-white font-mono font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow">
                  AI Cinephile Persona
                </span>
                {persona && (
                  <span className="text-[10px] text-gray-400 font-mono">
                    Updated {new Date(persona.generatedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <h3 className="text-2xl font-black text-white tracking-tight mt-1 font-heading">
                {persona ? persona.archetype : 'Your Cinephile Identity'}
              </h3>
            </div>
          </div>

          <button
            onClick={handlePersonaClick}
            disabled={isGeneratingPersona}
            className="flex items-center space-x-2 bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 hover:scale-[1.02] text-white font-extrabold text-xs px-6 py-3 rounded-2xl shadow-[0_0_25px_-5px_rgba(229,9,20,0.5)] transition duration-200 disabled:opacity-50 shrink-0 cursor-pointer"
          >
            <Sparkles className={`w-4 h-4 ${isGeneratingPersona ? 'animate-spin' : ''}`} />
            <span>{isGeneratingPersona ? 'Synthesizing Taste Persona...' : persona ? 'Refresh AI Persona' : 'Generate AI Persona'}</span>
          </button>
        </div>

        {persona ? (
          <div className="space-y-6">
            {/* Tagline */}
            <p className="text-amber-300 font-medium text-sm sm:text-base italic border-l-2 border-amber-500 pl-4 py-0.5 font-sans bg-amber-500/5 rounded-r-xl">
              "{persona.tagline}"
            </p>

            {/* Taste DNA Metrics Bars */}
            <div className="space-y-4 bg-black/40 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
              <h4 className="text-xs font-bold text-gray-300 uppercase font-mono tracking-wider flex items-center space-x-2">
                <Zap className="w-4 h-4 text-red-500" />
                <span>Cinematic Taste DNA Breakdown</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 pt-1 font-sans">
                {[
                  { label: 'Mind-Bending & Complexity', val: persona.tasteDNA?.mindBending || 75, color: 'from-indigo-600 to-purple-600' },
                  { label: 'Pacing & Intensity', val: persona.tasteDNA?.pacing || 70, color: 'from-amber-500 to-orange-500' },
                  { label: 'Gritty / Dark Realism', val: persona.tasteDNA?.darkRealism || 65, color: 'from-red-600 to-rose-600' },
                  { label: 'Emotional & Character Depth', val: persona.tasteDNA?.emotionalDepth || 80, color: 'from-emerald-500 to-teal-500' },
                  { label: 'Visual Spectacle', val: persona.tasteDNA?.spectacle || 70, color: 'from-cyan-500 to-blue-500' },
                ].map(item => (
                  <div key={item.label} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-gray-300">{item.label}</span>
                      <span className="text-gray-400 font-mono font-bold">{item.val}%</span>
                    </div>
                    <div className="w-full bg-white/10 h-2.5 rounded-full overflow-hidden p-0.5 border border-white/10">
                      <div
                        className={`bg-gradient-to-r ${item.color} h-full rounded-full transition-all duration-700 shadow`}
                        style={{ width: `${item.val}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Signature Tropes */}
            {persona.signatureTropes?.length > 0 && (
              <div className="space-y-2.5">
                <span className="text-xs font-bold font-mono text-gray-400 uppercase tracking-wider block">Signature Narrative Tropes</span>
                <div className="flex flex-wrap gap-2">
                  {persona.signatureTropes.map(trope => (
                    <span key={trope} className="bg-white/5 border border-white/10 text-gray-200 text-xs font-medium px-3.5 py-1.5 rounded-xl flex items-center space-x-1.5 backdrop-blur-md">
                      <Award className="w-3.5 h-3.5 text-amber-400" />
                      <span>{trope}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* AI Summary */}
            <div className="glass-card border border-white/10 rounded-2xl p-6 space-y-2 text-sm text-gray-300 leading-relaxed font-sans">
              <span className="text-xs font-bold font-mono text-red-400 uppercase tracking-wider block">AI Cinephile Personality Analysis</span>
              <p className="whitespace-pre-line leading-relaxed">{persona.aiSummary}</p>
            </div>

            {/* Persona Recommended Seeds */}
            {(() => {
              const rawSeeds = persona.recommendedSeeds || [];
              
              // Unwatched curated movies pool matching favorite genres or high ratings
              const unwatchedCuratedPool = curatedMovies.filter(m => !watchedIds.includes(m.id));

              // All possible seed candidates
              const allSeedTitles = [
                ...rawSeeds.filter(seedTitle => {
                  const found = curatedMovies.find(m => m.title.toLowerCase() === seedTitle.toLowerCase() || m.id.toLowerCase() === seedTitle.toLowerCase());
                  return !found || !watchedIds.includes(found.id);
                }),
                ...unwatchedCuratedPool.map(m => m.title)
              ];

              // Remove duplicates
              const uniqueSeedTitles = Array.from(new Set(allSeedTitles));
              if (uniqueSeedTitles.length === 0) return null;

              // Slice 5 seeds based on seedOffset
              const slicedIndex = seedOffset % Math.max(1, uniqueSeedTitles.length);
              const displaySeeds = uniqueSeedTitles
                .slice(slicedIndex, slicedIndex + 5)
                .concat(uniqueSeedTitles.slice(0, Math.max(0, 5 - (uniqueSeedTitles.length - slicedIndex))))
                .slice(0, 5);

              return (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-mono text-gray-400 uppercase tracking-wider flex items-center space-x-2">
                      <Compass className="w-4 h-4 text-red-500" />
                      <span>Tailored Unwatched Seeds For Your Persona</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => setSeedOffset(prev => prev + 5)}
                      className="flex items-center space-x-1.5 text-xs text-red-400 hover:text-white glass-card border border-white/10 hover:border-red-500/40 px-3 py-1.5 rounded-xl font-mono font-bold transition duration-200 cursor-pointer shadow"
                      title="Generate new recommendation seeds"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Refresh Seeds</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2.5">
                    {displaySeeds.map(seedTitle => {
                      const matchedMovie = curatedMovies.find(m => m.title.toLowerCase() === seedTitle.toLowerCase() || m.id.toLowerCase() === seedTitle.toLowerCase()) || {
                        id: `seed_${seedTitle.toLowerCase().replace(/\s+/g, '_')}`,
                        title: seedTitle,
                        year: 2022,
                        contentType: 'movie' as const,
                        rating: 8.5,
                        voteCount: 150000,
                        runtime: 125,
                        genres: favoriteGenres.length ? favoriteGenres : ['Drama', 'Thriller'],
                        moods: ['mind-bending', 'engaging'],
                        pace: 'medium' as const,
                        languages: ['English'],
                        countries: ['United States'],
                        synopsis: `Recommended cinephile title matching your AI Cinephile Persona archetype: ${persona.archetype}.`,
                        posterUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&q=80',
                        backdropUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1200&q=80',
                        platforms: ['Netflix', 'Prime Video', 'Apple TV+']
                      };

                      return (
                        <button
                          key={seedTitle}
                          type="button"
                          onClick={() => onMovieClick(matchedMovie)}
                          className="bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/50 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition duration-200 cursor-pointer flex items-center space-x-2 group shadow-md"
                          title={`Click to view details for ${seedTitle}`}
                        >
                          <Film className="w-3.5 h-3.5 text-red-400 group-hover:scale-110 transition duration-200" />
                          <span>{seedTitle}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

          </div>
        ) : (
          <div className="text-center py-8 bg-black/40 border border-dashed border-white/15 rounded-2xl space-y-4">
            <Brain className="w-12 h-12 text-gray-500 mx-auto" />
            <div className="space-y-1">
              <h4 className="text-white font-extrabold text-base font-heading">Generate your custom Cinephile Persona Card</h4>
              <p className="text-gray-400 text-xs sm:text-sm max-w-md mx-auto leading-relaxed font-sans">
                WatchMatch AI will analyze your watch history, liked genres, and viewing habits to synthesize your custom Cinephile Passport.
              </p>
            </div>
            <button
              onClick={handlePersonaClick}
              disabled={isGeneratingPersona}
              className="bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 hover:scale-[1.02] text-white font-extrabold text-xs px-6 py-3 rounded-2xl transition duration-200 cursor-pointer shadow-[0_0_25px_-5px_rgba(229,9,20,0.5)]"
            >
              {isGeneratingPersona ? 'Analyzing Your Taste...' : 'Build AI Persona Card'}
            </button>
          </div>
        )}
      </div>

      {/* 3. Analytical Preferences Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Fav Genres */}
        <div className="glass-card border border-white/10 p-6 rounded-2xl space-y-3">
          <div className="flex items-center space-x-2">
            <Flame className="w-5 h-5 text-red-500" />
            <h3 className="font-extrabold text-white text-base font-heading">Top Preferred Genres</h3>
          </div>
          {favoriteGenres.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {favoriteGenres.map(g => (
                <span key={g} className="bg-red-500/15 border border-red-500/30 text-red-300 font-mono font-bold text-xs px-4 py-1.5 rounded-xl uppercase">
                  {g}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-xs font-sans">Like titles during movie scouting to discover your favorite genres.</p>
          )}
        </div>

        {/* Fav Moods */}
        <div className="glass-card border border-white/10 p-6 rounded-2xl space-y-3">
          <div className="flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-amber-500" />
            <h3 className="font-extrabold text-white text-base font-heading">Favorite Story Vibes</h3>
          </div>
          {favoriteMoods.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {favoriteMoods.map(m => (
                <span key={m} className="bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono font-bold text-xs px-4 py-1.5 rounded-xl uppercase">
                  {m}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-xs font-sans">Interact with recommendations to map your atmospheric vibes.</p>
          )}
        </div>
      </div>

      {/* 4. WATCH STATUS FILTER TOGGLE CONTROL */}
      <div className="glass-panel border border-white/10 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500">
            <Filter className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-white text-sm font-heading">Library Watch Filter</h3>
            <p className="text-xs text-gray-400 font-sans">Filter your saved films by viewing status</p>
          </div>
        </div>

        <div className="flex items-center bg-black/40 p-1.5 rounded-xl border border-white/10 gap-1 w-full sm:w-auto justify-center backdrop-blur-md">
          <button
            id="filter-btn-all"
            onClick={() => setStatusFilter('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition duration-200 ${
              statusFilter === 'all'
                ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            All Saved ({watchlistMovies.length + watchedMovies.length})
          </button>
          <button
            id="filter-btn-unwatched"
            onClick={() => setStatusFilter('unwatched')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition duration-200 flex items-center space-x-1.5 ${
              statusFilter === 'unwatched'
                ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Unwatched ({unwatchedWatchlistMovies.length})</span>
          </button>
          <button
            id="filter-btn-watched"
            onClick={() => setStatusFilter('watched')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition duration-200 flex items-center space-x-1.5 ${
              statusFilter === 'watched'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Watched ({watchedMovies.length})</span>
          </button>
        </div>
      </div>

      {/* 5. WATCHED HISTORY SECTOR */}
      {(statusFilter === 'all' || statusFilter === 'watched') && (
        <div className="space-y-4" id="watched-history-sector">
          <div className="flex items-center space-x-2 border-b border-white/10 pb-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <h3 className="font-extrabold text-lg text-white font-heading">Already Watched History</h3>
            <span className="text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono px-3 py-0.5 rounded-full font-bold">
              {watchedMovies.length} Marked
            </span>
          </div>

          {watchedMovies.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {watchedMovies.map(movie => (
                <div 
                  key={movie.id} 
                  className="glass-card border border-white/10 hover:border-emerald-500/40 rounded-2xl p-4 flex items-center justify-between gap-4 transition duration-200 group shadow-lg"
                >
                  <div 
                    onClick={() => onMovieClick(movie)}
                    className="flex items-center space-x-3.5 cursor-pointer flex-1 min-w-0"
                  >
                    <img 
                      src={getCleanImageUrl(movie.posterUrl, 'poster')} 
                      alt={movie.title}
                      referrerPolicy="no-referrer"
                      className="w-12 h-16 object-cover rounded-xl flex-shrink-0 border border-white/15 group-hover:scale-105 transition"
                      onError={(e) => handleImageLoadError(e, movie.backdropUrl)}
                    />
                    <div className="min-w-0">
                      <span className="font-extrabold text-white text-sm block group-hover:text-emerald-400 truncate transition font-heading flex items-center space-x-1">
                        <span>{movie.title}</span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline flex-shrink-0" />
                      </span>
                      <span className="text-gray-400 text-xs font-mono block mt-0.5">
                        {movie.year} · ★{movie.rating} · <span className="capitalize text-gray-300">{movie.contentType}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1">
                    {onToggleWatched && (
                      <button
                        onClick={() => onToggleWatched(movie.id)}
                        className="text-emerald-400 hover:text-red-400 p-2 hover:bg-white/10 rounded-xl transition text-xs font-bold font-mono"
                        title="Unmark as watched"
                      >
                        Unmark
                      </button>
                    )}
                    {onRemoveFromWatched && (
                      <button
                        onClick={() => onRemoveFromWatched(movie.id)}
                        className="text-gray-400 hover:text-red-400 p-2 hover:bg-white/10 rounded-xl transition"
                        title="Remove from history"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 bg-black/40 border border-dashed border-white/10 rounded-2xl space-y-2">
              <CheckCircle2 className="w-8 h-8 text-gray-600 mx-auto" />
              <p className="text-gray-400 text-xs font-sans">No titles marked watched yet. Mark movies watched from search results or details modal!</p>
            </div>
          )}
        </div>
      )}

      {/* 6. WATCHLIST SECTOR */}
      {(statusFilter === 'all' || statusFilter === 'unwatched') && (
        <div className="space-y-4" id="watchlist-sector">
          <div className="flex items-center space-x-2 border-b border-white/10 pb-3">
            <Bookmark className="w-5 h-5 text-red-500" />
            <h3 className="font-extrabold text-lg text-white font-heading">
              {statusFilter === 'unwatched' ? 'Unwatched Watchlist' : 'Your Curated Watchlist'}
            </h3>
            <span className="text-xs bg-white/5 border border-white/10 text-gray-300 font-mono px-3 py-0.5 rounded-full font-bold">
              {statusFilter === 'unwatched' ? unwatchedWatchlistMovies.length : watchlistMovies.length} Titles
            </span>
          </div>

          {(statusFilter === 'unwatched' ? unwatchedWatchlistMovies : watchlistMovies).length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(statusFilter === 'unwatched' ? unwatchedWatchlistMovies : watchlistMovies).map(movie => {
                const isWatched = watchedIds.includes(movie.id);

                return (
                  <div 
                    key={movie.id} 
                    className="glass-card border border-white/10 hover:border-red-500/40 rounded-2xl p-4 flex items-center justify-between gap-4 transition duration-200 group shadow-lg"
                  >
                    <div 
                      onClick={() => onMovieClick(movie)}
                      className="flex items-center space-x-3.5 cursor-pointer flex-1 min-w-0"
                    >
                      <img 
                        src={getCleanImageUrl(movie.posterUrl, 'poster')} 
                        alt={movie.title}
                        referrerPolicy="no-referrer"
                        className="w-12 h-16 object-cover rounded-xl flex-shrink-0 border border-white/15 group-hover:scale-105 transition"
                        onError={(e) => handleImageLoadError(e, movie.backdropUrl)}
                      />
                      <div className="min-w-0">
                        <span className="font-extrabold text-white text-sm block group-hover:text-red-400 truncate transition font-heading flex items-center space-x-1">
                          <span>{movie.title}</span>
                          {isWatched && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline flex-shrink-0" />}
                        </span>
                        <span className="text-gray-400 text-xs font-mono block mt-0.5">
                          {movie.year} · ★{movie.rating} · <span className="capitalize text-gray-300">{movie.contentType}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      {onToggleWatched && (
                        <button
                          onClick={() => onToggleWatched(movie.id)}
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl transition duration-200 border ${
                            isWatched
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-white/5 text-gray-300 border-white/10 hover:text-white hover:border-white/20'
                          }`}
                          title={isWatched ? 'Mark unwatched' : 'Mark watched'}
                        >
                          {isWatched ? 'Watched' : 'Mark Watched'}
                        </button>
                      )}

                      <button
                        onClick={() => onRemoveFromWatchlist(movie.id)}
                        className="text-gray-400 hover:text-red-400 p-2 hover:bg-white/10 rounded-xl transition"
                        title="Remove from watchlist"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10 bg-black/40 border border-dashed border-white/10 rounded-2xl space-y-2">
              <Bookmark className="w-8 h-8 text-gray-600 mx-auto" />
              <p className="text-gray-400 text-xs font-sans">
                {statusFilter === 'unwatched'
                  ? 'All items on your watchlist have been watched!'
                  : 'Your watchlist is currently empty. Add titles during discovery!'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 7. LIKED TITLES SECTOR */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2 border-b border-white/10 pb-3">
          <Heart className="w-5 h-5 text-red-500 fill-red-500/20" />
          <h3 className="font-extrabold text-lg text-white font-heading">Liked Recommendations</h3>
          <span className="text-xs bg-white/5 border border-white/10 text-gray-300 font-mono px-3 py-0.5 rounded-full font-bold">
            {likedMovies.length} Titles
          </span>
        </div>

        {likedMovies.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {likedMovies.map(movie => (
              <div 
                key={movie.id} 
                className="glass-card border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-lg hover:border-red-500/30 transition duration-200 group"
              >
                <div 
                  onClick={() => onMovieClick(movie)}
                  className="flex items-center space-x-3.5 cursor-pointer flex-1 min-w-0"
                >
                  <img 
                    src={getCleanImageUrl(movie.posterUrl, 'poster')} 
                    alt={movie.title}
                    referrerPolicy="no-referrer"
                    className="w-12 h-16 object-cover rounded-xl flex-shrink-0 border border-white/15 group-hover:scale-105 transition"
                    onError={(e) => handleImageLoadError(e, movie.backdropUrl)}
                  />
                  <div className="min-w-0">
                    <span className="font-extrabold text-white text-sm block truncate font-heading group-hover:text-red-400 transition">
                      {movie.title}
                    </span>
                    <span className="text-gray-400 text-xs font-mono block mt-0.5">
                      {movie.year} · ★{movie.rating}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onRemoveFromLikes(movie.id)}
                  className="text-gray-400 hover:text-red-400 p-2 hover:bg-white/10 rounded-xl transition"
                  title="Unlike"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 bg-black/40 border border-dashed border-white/10 rounded-2xl">
            <p className="text-gray-400 text-xs font-sans">Like titles during movie scouting to build your preference DNA.</p>
          </div>
        )}
      </div>

      {/* 8. DISLIKED SECTOR */}
      {dislikedMovies.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center space-x-2 border-b border-white/10 pb-3">
            <Trash className="w-5 h-5 text-gray-400" />
            <h3 className="font-extrabold text-lg text-white font-heading">Dismissed / Not Interested</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dislikedMovies.map(movie => (
              <div 
                key={movie.id} 
                className="glass-card border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-4 shadow"
              >
                <div className="flex items-center space-x-3.5 flex-1 min-w-0">
                  <div className="min-w-0">
                    <span className="font-semibold text-gray-300 text-sm block truncate font-sans">
                      {movie.title}
                    </span>
                    <span className="text-gray-400 text-xs font-mono block mt-0.5">
                      {movie.year} · Dismissed
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onRemoveFromDislikes(movie.id)}
                  className="text-gray-400 hover:text-white p-2 hover:bg-white/10 rounded-xl transition"
                  title="Remove from blocklist"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
        </div>





        {/* RIGHT 4 COLUMNS: Sticky CineTaste Analytics & Insights Sidebar */}
        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
          {/* Top Loved Genres */}
          <div className="glass-panel border border-white/15 p-6 rounded-3xl space-y-4 shadow-2xl backdrop-blur-2xl">
            <h3 className="text-sm font-black text-white font-heading uppercase tracking-wider flex items-center space-x-2">
              <Award className="w-4 h-4 text-amber-400" />
              <span>Top Loved Genres</span>
            </h3>

            {favoriteGenres.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {favoriteGenres.map((g, idx) => (
                  <span 
                    key={idx} 
                    className="bg-gradient-to-r from-red-600 to-rose-600 text-white font-extrabold text-xs px-3.5 py-1.5 rounded-xl uppercase tracking-wider shadow-md"
                  >
                    {g}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 font-sans">Like movie cards during search to populate your top genres.</p>
            )}
          </div>

          {/* Favorite Mood Vibes */}
          <div className="glass-panel border border-white/15 p-6 rounded-3xl space-y-4 shadow-2xl backdrop-blur-2xl">
            <h3 className="text-sm font-black text-white font-heading uppercase tracking-wider flex items-center space-x-2">
              <Zap className="w-4 h-4 text-rose-400" />
              <span>Preferred Mood Vibes</span>
            </h3>

            {favoriteMoods.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {favoriteMoods.map((m, idx) => (
                  <span 
                    key={idx} 
                    className="bg-white/10 text-gray-200 border border-white/15 font-bold text-xs px-3 py-1.5 rounded-xl capitalize shadow"
                  >
                    {m}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 font-sans">Your preferred story vibes will automatically summarize here.</p>
            )}
          </div>

          {/* Library Breakdown Stats */}
          <div className="glass-panel border border-white/15 p-6 rounded-3xl space-y-4 shadow-2xl backdrop-blur-2xl">
            <h3 className="text-sm font-black text-white font-heading uppercase tracking-wider flex items-center space-x-2">
              <Film className="w-4 h-4 text-red-500" />
              <span>Passport Metrics</span>
            </h3>

            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center p-3 rounded-2xl bg-white/5 border border-white/10">
                <span className="text-gray-300">Total Saved Watchlist</span>
                <span className="font-bold text-white text-sm">{watchlistMovies.length}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-2xl bg-white/5 border border-white/10">
                <span className="text-gray-300">Completed Movies</span>
                <span className="font-bold text-emerald-400 text-sm">{watchedMovies.length}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-2xl bg-white/5 border border-white/10">
                <span className="text-gray-300">Liked Titles</span>
                <span className="font-bold text-rose-400 text-sm">{likedMovies.length}</span>
              </div>
            </div>
          </div>

        </div> {/* END RIGHT 4 COLUMNS */}

      </div> {/* END 2-COLUMN GRID STAGE */}
    </div>
  );
}



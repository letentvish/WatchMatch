import React from 'react';
import { Sparkles, Play, Plus, Check, CheckCircle2, Trash, AlertTriangle, EyeOff, Film, HelpCircle, Flame, Star, Hourglass, Loader2 } from 'lucide-react';
import { RecommendationResponse, Movie } from '../types';
import { curatedMovies } from '../data/curatedMovies';
import { getCleanImageUrl, handleImageLoadError } from '../utils/imageHelper';

interface ResultsViewProps {
  recommendations: RecommendationResponse;
  onMovieClick: (movie: Movie) => void;
  onAddToWatchlist: (movie: Movie) => void;
  onNotInterested: (movieId: string) => void;
  watchlistIds: string[];
  watchedIds?: string[];
  onToggleWatched?: (movieId: string) => void;
  onRefine: (refinementText: string) => void;
  isLoading?: boolean;
  pendingQuery?: string | null;
}

// Helper to format raw content types into human-readable labels
const formatContentType = (type?: string): string => {
  if (!type) return 'Title';
  switch (type.toLowerCase()) {
    case 'limited_series': return 'Limited Series';
    case 'series': return 'TV Series';
    case 'movie': return 'Movie';
    case 'anime': return 'Anime';
    case 'documentary': return 'Documentary';
    default: return type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ');
  }
};

export default function ResultsView({
  recommendations,
  onMovieClick,
  onAddToWatchlist,
  onNotInterested,
  watchlistIds,
  watchedIds = [],
  onToggleWatched,
  onRefine,
  isLoading = false,
  pendingQuery = null,
}: ResultsViewProps) {
  // Helper to find full movie details from curated list, or return a basic structure if custom TMDB result
  const getMovieDetails = (titleId: string): Movie | null => {
    if (recommendations.movieDetails && recommendations.movieDetails[titleId]) {
      return recommendations.movieDetails[titleId];
    }
    const local = curatedMovies.find(m => m.id === titleId);
    if (local) return local;
    return null;
  };

  const renderMoodScale = (scale: any) => {
    // Normalize mood scales to percentages (0 - 100%)
    const darknessVal = scale?.darkness ? Math.min(100, Math.round(scale.darkness * 20)) : 88;
    const paceVal = scale?.pace ? Math.min(100, Math.round(scale.pace * 20)) : 42;
    const mindBendingVal = scale?.mindBending ? Math.min(100, Math.round(scale.mindBending * 20)) : 91;
    const violenceVal = scale?.violence ? Math.min(100, Math.round(scale.violence * 20)) : 65;

    return (
      <div className="space-y-3.5 pt-4 border-t border-white/10 mt-5 font-sans">
        {/* Darkness */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-semibold text-gray-300">
            <span>Darkness</span>
            <span className="font-mono font-bold text-gray-200">{darknessVal}%</span>
          </div>
          <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-red-600 to-rose-500 rounded-full shadow-[0_0_12px_rgba(229,9,20,0.8)]"
              style={{ width: `${darknessVal}%` }}
            ></div>
          </div>
        </div>

        {/* Pacing with Slow-burn Indicator */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-semibold text-gray-300">
            <span>Pacing</span>
            <div className="flex items-center space-x-2 font-mono text-xs">
              <span className="text-red-400 text-[11px] font-bold">▼ {paceVal <= 45 ? 'Slow-burn' : paceVal <= 70 ? 'Medium' : 'Fast'}</span>
              <span className="font-bold text-gray-200">{paceVal}%</span>
            </div>
          </div>
          <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-red-600 to-rose-500 rounded-full shadow-[0_0_12px_rgba(229,9,20,0.8)]"
              style={{ width: `${paceVal}%` }}
            ></div>
          </div>
        </div>

        {/* Mind-Bending */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-semibold text-gray-300">
            <span>Mind-Bending</span>
            <span className="font-mono font-bold text-gray-200">{mindBendingVal}%</span>
          </div>
          <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-red-600 to-rose-500 rounded-full shadow-[0_0_12px_rgba(229,9,20,0.8)]"
              style={{ width: `${mindBendingVal}%` }}
            ></div>
          </div>
        </div>

        {/* Violence */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-semibold text-gray-300">
            <span>Violence</span>
            <span className="font-mono font-bold text-gray-200">{violenceVal}%</span>
          </div>
          <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-red-600 to-rose-500 rounded-full shadow-[0_0_12px_rgba(229,9,20,0.8)]"
              style={{ width: `${violenceVal}%` }}
            ></div>
          </div>
        </div>

        {/* Scale Numbers (0, 50, 100) */}
        <div className="flex justify-between text-[10px] font-mono font-bold text-gray-500 pt-1 px-0.5">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
      </div>
    );
  };

  const bestMatchMovie = getMovieDetails(recommendations.best_match.title_id);
  const otherRecs = recommendations.recommendations || [];

  return (
    <div className="max-w-[1550px] mx-auto px-4 sm:px-6 lg:px-12 py-8 space-y-8">
      {/* In-progress refinement: visible status, and the current results are dimmed until the new ones arrive */}
      {isLoading && (
        <div role="status" aria-live="polite" className="sticky top-20 z-40 flex items-center gap-3 bg-wm-card/95 border border-red-500/40 rounded-2xl px-5 py-3 shadow-2xl backdrop-blur">
          <Loader2 className="w-5 h-5 text-red-500 animate-spin flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">Refining{pendingQuery ? `: “${pendingQuery}”` : '…'}</p>
            <p className="text-xs text-gray-400">Searching TMDB and ranking new matches. This can take up to 20 seconds on the free AI.</p>
          </div>
        </div>
      )}
      <div className={`space-y-8 transition-opacity ${isLoading ? 'opacity-40 pointer-events-none select-none' : ''}`} aria-busy={isLoading}>
      {/* Header matching exact screen */}
      <div className="space-y-1">
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight font-heading">
          Your Match Results
        </h1>
        <p className="text-gray-400 text-sm font-sans">
          Based on your preferences
        </p>
      </div>

      {/* Main 2-Column Grid Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT 8 COLUMNS: Main Recommendations Stage */}
        <div className="lg:col-span-8 space-y-10">

      {/* 1. BEST MATCH HERO CARD */}
      {bestMatchMovie && (
        <div className="space-y-4" id="best-match-hero-container">
          <div className="relative overflow-hidden glass-panel border border-white/12 rounded-3xl shadow-[0_0_80px_-15px_rgba(229,9,20,0.35)] flex flex-col md:flex-row group transition duration-300 hover:border-red-500/40 backdrop-blur-2xl p-6 sm:p-7 gap-6">
            
            {/* Left: Poster Section with glowing outline */}
            <div className="relative w-full md:w-2/5 h-80 md:h-auto min-h-[380px] rounded-2xl overflow-hidden bg-black/60 border border-white/10 shadow-2xl flex-shrink-0">
              <img 
                src={getCleanImageUrl(bestMatchMovie.posterUrl, 'poster')} 
                alt={bestMatchMovie.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover transition duration-700 group-hover:scale-105 filter brightness-95"
                onError={(e) => handleImageLoadError(e, bestMatchMovie.backdropUrl)}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
              
              {/* Watched Badge overlay */}
              {watchedIds.includes(bestMatchMovie.id) && (
                <div className="absolute top-4 left-4">
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-extrabold text-[10px] px-3 py-1 rounded-full uppercase tracking-wider shadow flex items-center space-x-1 backdrop-blur-md">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Watched</span>
                  </span>
                </div>
              )}
            </div>

            {/* Right: Content Section */}
            <div className="flex-1 flex flex-col justify-between space-y-4">
              <div className="space-y-3.5">
                
                {/* Header Row: BEST OVERALL MATCH + Circular Radial Match Badge */}
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <span className="text-[10px] font-mono font-extrabold text-red-500 uppercase tracking-widest block mb-1">
                      BEST OVERALL MATCH
                    </span>
                    <h3 
                      className="text-2xl sm:text-3xl font-black text-white hover:text-red-400 cursor-pointer transition font-heading leading-tight"
                      onClick={() => onMovieClick(bestMatchMovie)}
                      id="best-match-title"
                    >
                      {bestMatchMovie.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-gray-400 text-xs font-mono mt-1.5 font-medium">
                      <span>{bestMatchMovie.year}</span>
                      <span>·</span>
                      <span>{bestMatchMovie.seasons ? `${bestMatchMovie.seasons} ${bestMatchMovie.seasons === 1 ? 'Season' : 'Seasons'}` : `${bestMatchMovie.runtime || 120}m`}</span>
                      <span>·</span>
                      <span className="uppercase">{formatContentType(bestMatchMovie.contentType)}</span>
                      <span>·</span>
                      <span className="text-amber-400 font-bold">★ {bestMatchMovie.rating}</span>
                    </div>
                  </div>

                  {/* Circular Radial Match Score Badge */}
                  <div className="relative w-20 h-20 flex-shrink-0 flex items-center justify-center rounded-full bg-red-950/40 border-2 border-red-500 shadow-[0_0_25px_rgba(229,9,20,0.6)]">
                    <div className="text-center leading-none">
                      <span className="text-lg font-black text-white block font-heading">
                        {recommendations.best_match.match_score}%
                      </span>
                      <span className="text-[9px] font-mono font-extrabold text-red-400 uppercase tracking-wider block mt-0.5">
                        MATCH
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-gray-300 text-xs sm:text-sm leading-relaxed font-sans line-clamp-3">
                  {bestMatchMovie.synopsis}
                </p>

                {/* Why it fits your prompt */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs font-bold font-sans text-gray-200 block">
                    Why it fits your prompt:
                  </span>
                  <ul className="space-y-1 text-xs text-gray-300 font-sans">
                    {recommendations.best_match.why_it_matches.map((bullet, idx) => (
                      <li key={idx} className="flex items-start space-x-2">
                        <span className="text-red-500 font-bold leading-none mt-1">&bull;</span>
                        <span className="leading-relaxed">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Possible Mismatch Warnings Banner */}
                {recommendations.best_match.possible_mismatch && (
                  <div className="flex items-center space-x-2 text-amber-300 bg-amber-950/30 border border-amber-500/40 px-3.5 py-2 rounded-xl text-xs backdrop-blur-md">
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <span className="font-sans"><strong>Possible Mismatch:</strong> {recommendations.best_match.possible_mismatch}</span>
                  </div>
                )}

                {/* Mood Scale (4 horizontal glowing bars) */}
                {renderMoodScale(bestMatchMovie.moodScale)}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2.5 pt-3 border-t border-white/10">
                <button
                  id="best-match-trailer-btn"
                  onClick={() => onMovieClick(bestMatchMovie)}
                  className="flex-1 min-w-[120px] bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-extrabold text-xs px-4 py-3 rounded-xl flex items-center justify-center space-x-2 transition duration-200 shadow-[0_0_20px_rgba(229,9,20,0.5)] cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>View Details</span>
                </button>

                <button
                  id="best-match-watchlist-btn"
                  onClick={() => onAddToWatchlist(bestMatchMovie)}
                  className={`flex-1 min-w-[120px] font-bold text-xs px-4 py-3 rounded-xl flex items-center justify-center space-x-2 transition duration-200 border cursor-pointer ${
                    watchlistIds.includes(bestMatchMovie.id)
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-white/5 hover:bg-white/10 text-white border-white/15'
                  }`}
                >
                  {watchlistIds.includes(bestMatchMovie.id) ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>In Watchlist</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Watchlist</span>
                    </>
                  )}
                </button>

                {onToggleWatched && (
                  <button
                    id="best-match-watched-btn"
                    onClick={() => onToggleWatched(bestMatchMovie.id)}
                    className={`font-bold text-xs px-3.5 py-3 rounded-xl flex items-center justify-center space-x-1.5 transition duration-200 border cursor-pointer ${
                      watchedIds.includes(bestMatchMovie.id)
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
                    }`}
                    title={watchedIds.includes(bestMatchMovie.id) ? 'Mark as unwatched' : 'Mark as watched'}
                  >
                    <CheckCircle2 className={`w-3.5 h-3.5 ${watchedIds.includes(bestMatchMovie.id) ? 'text-emerald-400 fill-emerald-400/20' : ''}`} />
                    <span>{watchedIds.includes(bestMatchMovie.id) ? 'Watched' : 'Watched'}</span>
                  </button>
                )}

                <button
                  id="best-match-dismiss-btn"
                  onClick={() => onNotInterested(bestMatchMovie.id)}
                  className="text-gray-400 hover:text-red-400 bg-white/5 border border-white/10 hover:border-red-500/40 p-3 rounded-xl transition duration-200 cursor-pointer"
                  title="Not interested"
                >
                  <EyeOff className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. CATEGORIZED RECOMMENDATIONS LIST */}
      {otherRecs.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-gradient-to-br from-red-600 to-rose-600 rounded-xl text-white shadow-[0_0_20px_-3px_rgba(229,9,20,0.6)]">
              <Film className="w-5 h-5" />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight font-heading">Other Scout Recommendations</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {otherRecs.map((rec, index) => {
              const movie = getMovieDetails(rec.title_id);
              if (!movie) return null;
              
              const isInWatchlist = watchlistIds.includes(movie.id);
              const isWatched = watchedIds.includes(movie.id);

              return (
                <div 
                  id={`rec-card-${index}`}
                  key={movie.id} 
                  className="glass-card rounded-3xl border border-white/10 overflow-hidden shadow-2xl flex flex-col justify-between group hover:-translate-y-1 transition duration-300 hover:border-red-500/40 hover:shadow-[0_12px_40px_-10px_rgba(229,9,20,0.3)]"
                >
                  {/* Backdrop Header */}
                  <div className="relative h-52 overflow-hidden bg-black/60">
                    <img 
                      src={getCleanImageUrl(movie.backdropUrl || movie.posterUrl, 'backdrop')} 
                      alt={movie.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition duration-500 group-hover:scale-105 filter brightness-90"
                      onError={(e) => handleImageLoadError(e, movie.posterUrl)}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#070709] via-[#070709]/50 to-transparent"></div>
                    
                    {/* Floating labels */}
                    <div className="absolute top-3.5 left-3.5 flex flex-col space-y-1.5 z-10">
                      <span className="bg-gradient-to-r from-red-600 to-rose-500 text-white font-extrabold text-[10px] px-3 py-1 rounded-full uppercase tracking-wider shadow-md">
                        {rec.match_score}% Match
                      </span>
                      {rec.recommended_for && (
                        <span className="bg-white/90 text-black font-mono text-[9px] px-2.5 py-0.5 rounded-md font-extrabold uppercase shadow">
                          {rec.recommended_for}
                        </span>
                      )}
                      {isWatched && (
                        <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-extrabold text-[9px] px-2.5 py-0.5 rounded-full uppercase tracking-wider backdrop-blur-md flex items-center space-x-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Watched</span>
                        </span>
                      )}
                    </div>

                    <div className="absolute bottom-3 left-4 right-4 z-10">
                      <h4 
                        className="text-xl font-extrabold text-white hover:text-red-400 cursor-pointer transition-colors font-heading leading-tight"
                        onClick={() => onMovieClick(movie)}
                      >
                        {movie.title}
                      </h4>
                      <div className="flex items-center space-x-2.5 text-gray-300 text-xs font-mono font-medium mt-1">
                        <span>{movie.year}</span>
                        <span>•</span>
                        <span className="text-amber-400 flex items-center"><Star className="w-3.5 h-3.5 fill-amber-400 mr-1" />{movie.rating}</span>
                        <span>•</span>
                        <span className="capitalize text-gray-200">{formatContentType(movie.contentType)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-5 space-y-4 flex-1 flex flex-col justify-between font-sans">
                    <div className="space-y-3">
                      {/* Short Why It Matches list */}
                      <div className="space-y-2 bg-black/40 p-4 rounded-2xl border border-white/10 backdrop-blur-md">
                        {rec.why_it_matches.slice(0, 3).map((w, idx) => (
                          <div key={idx} className="text-gray-300 text-xs flex items-start space-x-2">
                            <span className="text-red-500 font-bold mt-0.5">&bull;</span>
                            <span className="line-clamp-2 leading-relaxed">{w}</span>
                          </div>
                        ))}
                      </div>

                      {/* Warning */}
                      {rec.possible_mismatch && (
                        <div className="text-[11px] text-amber-300 flex items-center space-x-2 bg-amber-500/10 px-3.5 py-2.5 rounded-xl border border-amber-500/30">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                          <span className="line-clamp-2"><strong>Note:</strong> {rec.possible_mismatch}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-2 mt-4">
                      <button
                        onClick={() => onMovieClick(movie)}
                        className="text-xs text-red-400 hover:text-red-300 font-mono font-bold uppercase tracking-wider flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-red-500/40 transition cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-red-500 text-red-500" />
                        <span>Details</span>
                      </button>

                      <div className="flex items-center space-x-2">
                        {onToggleWatched && (
                          <button
                            onClick={() => onToggleWatched(movie.id)}
                            className={`p-2.5 rounded-xl border transition cursor-pointer ${
                              isWatched 
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                                : 'bg-white/5 text-gray-400 border-white/10 hover:text-white hover:border-white/20'
                            }`}
                            title={isWatched ? 'Mark as unwatched' : 'Mark as watched'}
                          >
                            <CheckCircle2 className={`w-4 h-4 ${isWatched ? 'text-emerald-400' : ''}`} />
                          </button>
                        )}

                        <button
                          onClick={() => onAddToWatchlist(movie)}
                          className={`p-2.5 rounded-xl border transition cursor-pointer ${
                            isInWatchlist 
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                              : 'bg-white/5 text-gray-400 border-white/10 hover:text-white hover:border-white/20'
                          }`}
                          title={isInWatchlist ? 'In watchlist' : 'Add to watchlist'}
                        >
                          {isInWatchlist ? <Check className="w-4 h-4 text-emerald-400" /> : <Plus className="w-4 h-4" />}
                        </button>

                        <button
                          onClick={() => onNotInterested(movie.id)}
                          className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-red-400 hover:border-red-500/40 transition cursor-pointer"
                          title="Not interested"
                        >
                          <EyeOff className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. CONVERSATIONAL REFINEMENT PANEL */}
      {recommendations.refinement_suggestions && recommendations.refinement_suggestions.length > 0 && (
        <div className="space-y-4 pt-6 border-t border-white/10">
          <div className="flex items-center space-x-2">
            <HelpCircle className="w-4 h-4 text-red-500" />
            <h3 className="text-xs font-extrabold font-mono tracking-wider text-gray-300 uppercase">
              Refine your shortlist
            </h3>
          </div>
          
          <div className="flex flex-wrap gap-3">
            {recommendations.refinement_suggestions.map((s, idx) => (
              <button
                id={`refinement-btn-${idx}`}
                key={idx}
                onClick={() => onRefine(s)}
                disabled={isLoading}
                className="glass-card text-gray-300 hover:text-white border border-white/15 hover:border-red-500/50 hover:bg-red-500/10 px-5 py-3 rounded-2xl text-xs md:text-sm font-semibold transition cursor-pointer text-left leading-relaxed flex items-center space-x-2 shadow-lg"
              >
                <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0"></span>
                <span>{s}</span>
              </button>
            ))}
          </div>
        </div>
      )}

        </div> {/* END LEFT 8 COLUMNS */}

        {/* RIGHT 4 COLUMNS: Sticky Live Cinephile Intelligence Sidebar */}
        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
          
          {/* 1. YOUR VIBE DNA Card */}
          <div className="glass-panel border border-white/12 p-6 rounded-3xl space-y-4 shadow-2xl backdrop-blur-2xl">
            <h3 className="text-xs font-mono font-extrabold text-gray-300 uppercase tracking-widest">
              YOUR VIBE DNA
            </h3>

            <div className="flex flex-wrap gap-2 pt-1">
              {[
                ...(bestMatchMovie?.genres || ['Sci-Fi', 'Mystery']),
                ...(bestMatchMovie?.moods || ['Dark', 'Atmospheric', 'Intelligent', 'Dystopian'])
              ].slice(0, 6).map((vibe, i) => (
                <span 
                  key={i} 
                  className="bg-white/5 border border-white/15 text-gray-300 hover:text-white px-3.5 py-1.5 rounded-full text-xs font-semibold capitalize transition shadow-sm"
                >
                  {vibe}
                </span>
              ))}
            </div>
          </div>

          {/* 2. MATCH CONFIDENCE Speedometer Arc Gauge */}
          <div className="glass-panel border border-white/12 p-6 rounded-3xl space-y-3 shadow-2xl backdrop-blur-2xl text-center">
            <h3 className="text-xs font-mono font-extrabold text-gray-300 uppercase tracking-widest text-left">
              MATCH CONFIDENCE
            </h3>

            {/* Arc Speedometer SVG */}
            <div className="relative flex flex-col items-center justify-center pt-2 pb-1">
              <svg className="w-48 h-28 overflow-visible" viewBox="0 0 100 55">
                {/* Background Dim Arc */}
                <path
                  d="M 10 50 A 40 40 0 0 1 90 50"
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.1)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="2 3"
                />
                {/* Active Red Glowing Arc */}
                <path
                  d="M 10 50 A 40 40 0 0 1 90 50"
                  fill="none"
                  stroke="url(#speedometerGrad)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="125"
                  strokeDashoffset={`${125 - (125 * (recommendations.best_match.match_score / 100))}`}
                  className="transition-all duration-1000 ease-out"
                  filter="drop-shadow(0px 0px 8px rgba(229, 9, 20, 0.8))"
                />
                <defs>
                  <linearGradient id="speedometerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="60%" stopColor="#f43f5e" />
                    <stop offset="100%" stopColor="#e50914" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Centered Confidence readout */}
              <div className="-mt-14 text-center">
                <span className="text-3xl font-black text-white font-heading block">
                  {recommendations.best_match.match_score}%
                </span>
                <div className="flex items-center justify-center space-x-1 text-xs text-gray-300 font-medium">
                  <span className="text-red-400 font-bold">High</span>
                  <span>😊</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. REFINEMENT 2-Column Grid */}
          <div className="glass-panel border border-white/12 p-6 rounded-3xl space-y-4 shadow-2xl backdrop-blur-2xl">
            <h3 className="text-xs font-mono font-extrabold text-gray-300 uppercase tracking-widest">
              REFINEMENT
            </h3>

            <div className="grid grid-cols-2 gap-2.5">
              {[
                "More Sci-Fi",
                "Faster Pacing",
                "Less Violence",
                "More Mystery",
                "TV Shows",
                "Movies",
              ].map((refinement, idx) => (
                <button
                  key={idx}
                  onClick={() => onRefine(refinement)}
                  disabled={isLoading}
                  className="bg-white/5 hover:bg-red-950/40 border border-white/10 hover:border-red-500/50 py-2.5 px-3 rounded-xl text-xs text-gray-300 hover:text-white font-semibold transition duration-200 cursor-pointer text-center truncate shadow-sm"
                >
                  {refinement}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Library Status */}
          <div className="glass-panel border border-white/12 p-6 rounded-3xl space-y-4 shadow-2xl backdrop-blur-2xl">
            <h3 className="text-xs font-mono font-extrabold text-gray-300 uppercase tracking-widest flex items-center space-x-2">
              <Film className="w-4 h-4 text-rose-400" />
              <span>Library Overview</span>
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="glass-card p-3 rounded-2xl border border-white/10 text-center">
                <span className="text-2xl font-black text-white font-heading block">{watchlistIds.length}</span>
                <span className="text-[10px] font-mono font-bold text-gray-400 uppercase">Watchlist</span>
              </div>
              <div className="glass-card p-3 rounded-2xl border border-white/10 text-center">
                <span className="text-2xl font-black text-emerald-400 font-heading block">{watchedIds.length}</span>
                <span className="text-[10px] font-mono font-bold text-gray-400 uppercase">Watched</span>
              </div>
            </div>
          </div>

        </div> {/* END RIGHT 4 COLUMNS */}

      </div> {/* END 2-COLUMN GRID STAGE */}
      </div>
    </div>
  );
}



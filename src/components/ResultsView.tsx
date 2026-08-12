import React from 'react';
import { Sparkles, Play, Plus, Check, CheckCircle2, Trash, AlertTriangle, EyeOff, Film, HelpCircle, Flame, Star, Hourglass } from 'lucide-react';
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
    if (!scale) return null;
    const scales = [
      { key: 'darkness', label: 'Darkness', color: 'bg-indigo-500' },
      { key: 'pace', label: 'Pacing', color: 'bg-rose-500' },
      { key: 'mindBending', label: 'Mind-Bending', color: 'bg-purple-500' },
      { key: 'violence', label: 'Violence', color: 'bg-amber-500' },
    ];

    return (
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 pt-3 border-t border-white/10 mt-4">
        {scales.map(s => {
          const val = scale[s.key] || 1;
          return (
            <div key={s.key} className="space-y-1">
              <div className="flex justify-between text-[10px] font-bold font-mono text-gray-400 uppercase">
                <span>{s.label}</span>
                <span>{val}/5</span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden flex border border-white/10">
                <div 
                  className={`h-full ${s.color} rounded-full transition-all duration-500`} 
                  style={{ width: `${(val / 5) * 100}%` }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const bestMatchMovie = getMovieDetails(recommendations.best_match.title_id);
  const otherRecs = recommendations.recommendations || [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-12">
      {/* Top Summary Banner */}
      {recommendations.summary && (
        <div className="glass-panel border border-white/15 p-6 rounded-3xl shadow-2xl flex items-start space-x-4 backdrop-blur-2xl">
          <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 flex-shrink-0 shadow-md">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <div className="space-y-1 flex-1">
            <div className="flex items-center space-x-2">
              <h3 className="font-extrabold text-white text-lg font-heading">Personal Movie Scout Analysis</h3>
              <span className="bg-red-500/20 text-red-400 border border-red-500/30 font-mono text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase">
                Multi-Source Scout
              </span>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed font-sans">{recommendations.summary}</p>
          </div>
        </div>
      )}

      {/* 1. BEST MATCH HERO CARD */}
      {bestMatchMovie && (
        <div className="space-y-4" id="best-match-hero-container">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-gradient-to-br from-red-600 to-rose-600 rounded-xl text-white shadow-[0_0_20px_-3px_rgba(229,9,20,0.6)]">
              <Flame className="w-5 h-5" />
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight font-heading">Best Overall Match</h2>
          </div>

          <div className="relative overflow-hidden glass-panel border border-white/15 rounded-3xl shadow-[0_0_80px_-15px_rgba(229,9,20,0.35)] flex flex-col md:flex-row group transition duration-300 hover:border-red-500/40 backdrop-blur-2xl">
            {/* Poster / Backdrop Section */}
            <div className="relative w-full md:w-2/5 h-80 md:h-auto min-h-[360px] overflow-hidden bg-black/60">
              <img 
                src={getCleanImageUrl(bestMatchMovie.posterUrl, 'poster')} 
                alt={bestMatchMovie.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover transition duration-700 group-hover:scale-105 filter brightness-95"
                onError={(e) => handleImageLoadError(e, bestMatchMovie.backdropUrl)}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#070709] via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:to-[#070709]/90"></div>
              
              {/* Overlay Badges */}
              <div className="absolute top-4 left-4 flex flex-col space-y-2">
                <span className="bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 text-white font-extrabold text-xs px-4 py-1.5 rounded-full uppercase tracking-wider shadow-lg glow-accent">
                  {recommendations.best_match.match_score}% Match
                </span>
                <span className="bg-black/80 backdrop-blur-md text-gray-200 border border-white/15 font-mono text-[10px] px-3 py-1 rounded-full font-bold shadow">
                  {recommendations.best_match.watch_commitment}
                </span>
                {watchedIds.includes(bestMatchMovie.id) && (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-extrabold text-[10px] px-3 py-1 rounded-full uppercase tracking-wider shadow flex items-center space-x-1 backdrop-blur-md">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Watched</span>
                  </span>
                )}
              </div>
            </div>

            {/* Content Section */}
            <div className="p-6 md:p-8 flex-1 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 
                      className="text-2xl md:text-3xl font-extrabold text-white hover:text-red-400 cursor-pointer transition font-heading"
                      onClick={() => onMovieClick(bestMatchMovie)}
                      id="best-match-title"
                    >
                      {bestMatchMovie.title}
                    </h3>
                    <div className="flex items-center space-x-2.5 text-gray-300 text-xs font-mono font-bold mt-2">
                      <span>{bestMatchMovie.year}</span>
                      <span>•</span>
                      <span className="text-amber-400 flex items-center bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-lg">
                        <Star className="w-3.5 h-3.5 fill-amber-400 mr-1" />{bestMatchMovie.rating}
                      </span>
                      <span>•</span>
                      <span className="uppercase text-[10px] bg-white/5 border border-white/10 px-2.5 py-0.5 rounded-lg text-gray-200">
                        {formatContentType(bestMatchMovie.contentType)}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-gray-300 text-sm leading-relaxed line-clamp-3 font-sans">
                  {bestMatchMovie.synopsis}
                </p>

                {/* Genres */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {bestMatchMovie.genres.map(g => (
                    <span key={g} className="text-[10px] font-extrabold font-mono bg-white/5 border border-white/10 text-gray-300 px-3 py-1 rounded-xl uppercase tracking-wider">
                      {g}
                    </span>
                  ))}
                </div>

                {/* Match Explanations */}
                <div className="bg-black/40 border border-white/10 rounded-2xl p-5 space-y-2.5 mt-4 backdrop-blur-md">
                  <span className="text-xs font-bold font-mono text-red-400 uppercase tracking-wider block flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Why it fits your prompt:</span>
                  </span>
                  <ul className="space-y-2">
                    {recommendations.best_match.why_it_matches.map((bullet, idx) => (
                      <li key={idx} className="text-gray-300 text-xs flex items-start space-x-2.5">
                        <span className="text-red-500 flex-shrink-0 font-bold mt-0.5">&bull;</span>
                        <span className="leading-relaxed font-sans">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Possible Mismatch Warnings */}
                {recommendations.best_match.possible_mismatch && (
                  <div className="flex items-center space-x-2.5 text-amber-300 bg-amber-500/10 border border-amber-500/30 px-4 py-3 rounded-2xl text-xs backdrop-blur-md">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
                    <span className="font-sans"><strong>Note:</strong> {recommendations.best_match.possible_mismatch}</span>
                  </div>
                )}

                {/* Mood Scale */}
                {renderMoodScale(bestMatchMovie.moodScale)}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 pt-4 border-t border-white/10">
                <button
                  id="best-match-trailer-btn"
                  onClick={() => onMovieClick(bestMatchMovie)}
                  className="flex-1 min-w-[130px] bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-extrabold text-xs px-4 py-3.5 rounded-xl flex items-center justify-center space-x-2 transition duration-200 shadow-[0_0_25px_-5px_rgba(229,9,20,0.5)] group cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white group-hover:scale-110 transition" />
                  <span>View Details</span>
                </button>

                <button
                  id="best-match-watchlist-btn"
                  onClick={() => onAddToWatchlist(bestMatchMovie)}
                  className={`flex-1 min-w-[130px] font-bold text-xs px-4 py-3.5 rounded-xl flex items-center justify-center space-x-2 transition duration-200 border cursor-pointer ${
                    watchlistIds.includes(bestMatchMovie.id)
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-white/5 hover:bg-white/10 text-white border-white/15'
                  }`}
                >
                  {watchlistIds.includes(bestMatchMovie.id) ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>In Watchlist</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Add Watchlist</span>
                    </>
                  )}
                </button>

                {onToggleWatched && (
                  <button
                    id="best-match-watched-btn"
                    onClick={() => onToggleWatched(bestMatchMovie.id)}
                    className={`flex-1 min-w-[130px] font-bold text-xs px-4 py-3.5 rounded-xl flex items-center justify-center space-x-2 transition duration-200 border cursor-pointer ${
                      watchedIds.includes(bestMatchMovie.id)
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
                    }`}
                    title={watchedIds.includes(bestMatchMovie.id) ? 'Mark as unwatched' : 'Mark as watched'}
                  >
                    <CheckCircle2 className={`w-4 h-4 ${watchedIds.includes(bestMatchMovie.id) ? 'text-emerald-400 fill-emerald-400/20' : ''}`} />
                    <span>{watchedIds.includes(bestMatchMovie.id) ? 'Watched' : 'Mark Watched'}</span>
                  </button>
                )}

                <button
                  id="best-match-dismiss-btn"
                  onClick={() => onNotInterested(bestMatchMovie.id)}
                  className="text-gray-400 hover:text-red-400 bg-white/5 border border-white/10 hover:border-red-500/40 p-3.5 rounded-xl transition duration-200 cursor-pointer"
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
                className="glass-card text-gray-300 hover:text-white border border-white/15 hover:border-red-500/50 hover:bg-red-500/10 px-5 py-3 rounded-2xl text-xs md:text-sm font-semibold transition cursor-pointer text-left leading-relaxed flex items-center space-x-2 shadow-lg"
              >
                <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0"></span>
                <span>{s}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


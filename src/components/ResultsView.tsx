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
    
    // If it's an external candidate passed in, we look for its information (or fallback)
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
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 pt-2 border-t border-slate-800/80 mt-4">
        {scales.map(s => {
          const val = scale[s.key] || 1;
          return (
            <div key={s.key} className="space-y-1">
              <div className="flex justify-between text-[11px] font-bold font-mono text-slate-400 uppercase">
                <span>{s.label}</span>
                <span>{val}/5</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                <div 
                  className={`h-full ${s.color} rounded-full`} 
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
        <div className="bg-wm-card border border-gray-800 p-6 rounded-xl shadow-xl flex items-start space-x-4">
          <Sparkles className="w-6 h-6 text-wm-accent flex-shrink-0 mt-0.5 animate-pulse" />
          <div className="space-y-1">
            <h3 className="font-bold text-white text-base">Your Personal Movie Scout's Assessment</h3>
            <p className="text-gray-300 text-sm leading-relaxed">{recommendations.summary}</p>
          </div>
        </div>
      )}

      {/* 1. BEST MATCH HERO CARD */}
      {bestMatchMovie && (
        <div className="space-y-4" id="best-match-hero-container">
          <div className="flex items-center space-x-2">
            <Flame className="w-5 h-5 text-wm-accent" />
            <h2 className="text-xl font-bold text-white tracking-tight">Best Overall Match</h2>
          </div>

          <div className="relative overflow-hidden bg-wm-card border border-gray-800 rounded-2xl shadow-2xl flex flex-col md:flex-row group">
            {/* Poster / Backdrop Section */}
            <div className="relative w-full md:w-2/5 h-64 md:h-auto min-h-[300px] overflow-hidden">
              <img 
                src={getCleanImageUrl(bestMatchMovie.posterUrl, 'poster')} 
                alt={bestMatchMovie.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                onError={(e) => handleImageLoadError(e, bestMatchMovie.backdropUrl)}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-wm-card via-wm-card/40 to-transparent"></div>
              
              {/* Overlay Badges */}
              <div className="absolute top-4 left-4 flex flex-col space-y-2">
                <span className="bg-wm-accent text-white font-extrabold text-[11px] px-3 py-1 rounded-full uppercase tracking-wider shadow">
                  {recommendations.best_match.match_score}% Match
                </span>
                <span className="bg-black/90 text-gray-300 border border-gray-800 font-mono text-[10px] px-2.5 py-1 rounded-full font-bold">
                  {recommendations.best_match.watch_commitment}
                </span>
                {watchedIds.includes(bestMatchMovie.id) && (
                  <span className="bg-emerald-600 text-white font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider shadow flex items-center space-x-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Watched</span>
                  </span>
                )}
              </div>
            </div>

            {/* Content Section */}
            <div className="p-6 md:p-8 flex-1 flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 
                      className="text-2xl md:text-3xl font-black text-white hover:text-wm-accent cursor-pointer transition"
                      onClick={() => onMovieClick(bestMatchMovie)}
                      id="best-match-title"
                    >
                      {bestMatchMovie.title}
                    </h3>
                    <div className="flex items-center space-x-2 text-gray-400 text-xs font-mono font-bold mt-1">
                      <span>{bestMatchMovie.year}</span>
                      <span>•</span>
                      <span className="text-amber-400 flex items-center"><Star className="w-3.5 h-3.5 fill-amber-400 mr-0.5" />{bestMatchMovie.rating}</span>
                      <span>•</span>
                      <span className="uppercase text-[10px] bg-black/60 border border-gray-800 px-2 py-0.5 rounded-md text-gray-300">{bestMatchMovie.contentType}</span>
                    </div>
                  </div>
                </div>

                <p className="text-gray-300 text-sm leading-relaxed line-clamp-3">
                  {bestMatchMovie.synopsis}
                </p>

                {/* Genres */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {bestMatchMovie.genres.map(g => (
                    <span key={g} className="text-[10px] font-bold bg-black/50 border border-gray-800 text-gray-300 px-2.5 py-1 rounded-md uppercase">
                      {g}
                    </span>
                  ))}
                </div>

                {/* Match Explanations */}
                <div className="bg-black/40 border border-gray-800/80 rounded-xl p-4 space-y-2 mt-4">
                  <span className="text-xs font-bold font-mono text-wm-accent uppercase tracking-wider block">Why it fits you:</span>
                  <ul className="space-y-1.5">
                    {recommendations.best_match.why_it_matches.map((bullet, idx) => (
                      <li key={idx} className="text-gray-300 text-xs flex items-start space-x-2">
                        <span className="text-wm-accent flex-shrink-0 font-bold mt-0.5">&bull;</span>
                        <span className="leading-relaxed">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Possible Mismatch Warnings */}
                {recommendations.best_match.possible_mismatch && (
                  <div className="flex items-center space-x-2 text-amber-400 bg-amber-950/20 border border-amber-800/50 px-3.5 py-2.5 rounded-xl text-xs">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
                    <span><strong>Caveat:</strong> {recommendations.best_match.possible_mismatch}</span>
                  </div>
                )}

                {/* Mood Scale */}
                {renderMoodScale(bestMatchMovie.moodScale)}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-800">
                <button
                  id="best-match-trailer-btn"
                  onClick={() => onMovieClick(bestMatchMovie)}
                  className="flex-1 min-w-[120px] bg-wm-accent hover:bg-red-700 text-white font-extrabold text-xs px-4 py-3 rounded-lg flex items-center justify-center space-x-1.5 transition"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Watch Trailer</span>
                </button>

                <button
                  id="best-match-watchlist-btn"
                  onClick={() => onAddToWatchlist(bestMatchMovie)}
                  className={`flex-1 min-w-[120px] font-bold text-xs px-4 py-3 rounded-lg flex items-center justify-center space-x-1.5 transition border ${
                    watchlistIds.includes(bestMatchMovie.id)
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                      : 'bg-wm-card text-white border-gray-800 hover:border-gray-700 hover:bg-wm-card-hover'
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
                    className={`flex-1 min-w-[120px] font-bold text-xs px-4 py-3 rounded-lg flex items-center justify-center space-x-1.5 transition border ${
                      watchedIds.includes(bestMatchMovie.id)
                        ? 'bg-emerald-600/20 text-emerald-300 border-emerald-600'
                        : 'bg-wm-card text-gray-300 border-gray-800 hover:border-gray-700 hover:bg-wm-card-hover'
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
                  className="text-gray-400 hover:text-wm-accent bg-wm-card border border-gray-800 hover:border-red-900/50 p-3 rounded-lg transition"
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
          <div className="flex items-center space-x-2">
            <Film className="w-5 h-5 text-wm-accent" />
            <h2 className="text-xl font-bold text-white tracking-tight">Other Custom Matches</h2>
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
                  className="bg-wm-card border border-gray-800 rounded-xl overflow-hidden shadow-lg flex flex-col justify-between group hover:border-gray-700 transition"
                >
                  {/* Backdrop Header */}
                  <div className="relative h-44 overflow-hidden">
                    <img 
                      src={getCleanImageUrl(movie.backdropUrl || movie.posterUrl, 'backdrop')} 
                      alt={movie.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                      onError={(e) => handleImageLoadError(e, movie.posterUrl)}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-wm-card via-wm-card/40 to-transparent"></div>
                    
                    {/* Floating labels */}
                    <div className="absolute top-3 left-3 flex flex-col space-y-1">
                      <span className="bg-wm-accent text-white font-bold text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        {rec.match_score}% Match
                      </span>
                      {rec.recommended_for && (
                        <span className="bg-white text-black font-mono text-[9px] px-2 py-0.5 rounded-md font-extrabold uppercase">
                          {rec.recommended_for}
                        </span>
                      )}
                      {isWatched && (
                        <span className="bg-emerald-600 text-white font-extrabold text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider shadow flex items-center space-x-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Watched</span>
                        </span>
                      )}
                    </div>

                    <div className="absolute bottom-3 left-3">
                      <h4 
                        className="text-lg font-black text-white hover:text-wm-accent cursor-pointer transition-colors"
                        onClick={() => onMovieClick(movie)}
                      >
                        {movie.title}
                      </h4>
                      <div className="flex items-center space-x-2 text-gray-300 text-xs font-mono font-medium mt-0.5">
                        <span>{movie.year}</span>
                        <span>•</span>
                        <span className="text-amber-400 flex items-center"><Star className="w-3 h-3 fill-amber-400 mr-0.5" />{movie.rating}</span>
                        <span>•</span>
                        <span className="capitalize">{movie.contentType}</span>
                      </div>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
                    <div className="space-y-3">
                      {/* Short Why It Matches list */}
                      <div className="space-y-1 bg-black/40 p-3 rounded-lg border border-gray-800">
                        {rec.why_it_matches.slice(0, 3).map((w, idx) => (
                          <div key={idx} className="text-gray-300 text-xs flex items-start space-x-1.5">
                            <span className="text-wm-accent font-bold">&bull;</span>
                            <span className="line-clamp-2 leading-relaxed">{w}</span>
                          </div>
                        ))}
                      </div>

                      {/* Warning */}
                      {rec.possible_mismatch && (
                        <div className="text-[11px] text-amber-400 flex items-center space-x-1.5 bg-amber-950/20 px-2.5 py-1.5 rounded-lg border border-amber-800/40">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="line-clamp-2"><strong>Caveat:</strong> {rec.possible_mismatch}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="pt-4 border-t border-gray-800 flex items-center justify-between gap-2 mt-4">
                      <button
                        onClick={() => onMovieClick(movie)}
                        className="text-xs text-wm-accent hover:text-red-400 font-mono font-bold uppercase tracking-wider flex items-center space-x-1 px-2 py-1 rounded-lg hover:bg-wm-card-hover"
                      >
                        <Play className="w-3 h-3 fill-wm-accent" />
                        <span>Details</span>
                      </button>

                      <div className="flex items-center space-x-2">
                        {onToggleWatched && (
                          <button
                            onClick={() => onToggleWatched(movie.id)}
                            className={`p-2 rounded-lg border transition ${
                              isWatched
                                ? 'bg-emerald-600/20 text-emerald-300 border-emerald-600'
                                : 'bg-black/50 border-gray-800 hover:border-gray-700 text-gray-400 hover:text-white'
                            }`}
                            title={isWatched ? 'Mark as unwatched' : 'Mark as watched'}
                          >
                            <CheckCircle2 className={`w-4 h-4 ${isWatched ? 'text-emerald-400 fill-emerald-400/20' : ''}`} />
                          </button>
                        )}

                        <button
                          onClick={() => onAddToWatchlist(movie)}
                          className={`p-2 rounded-lg border transition ${
                            isInWatchlist
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                              : 'bg-black/50 border-gray-800 hover:border-gray-700 text-gray-400 hover:text-white'
                          }`}
                          title="Watchlist"
                        >
                          {isInWatchlist ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        </button>

                        <button
                          onClick={() => onNotInterested(movie.id)}
                          className="p-2 bg-black/50 hover:bg-wm-card-hover border border-gray-800 hover:border-red-900/40 text-gray-400 hover:text-wm-accent rounded-lg transition"
                          title="Not Interested"
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
        <div className="space-y-4 pt-6 border-t border-gray-800">
          <div className="flex items-center space-x-2">
            <HelpCircle className="w-4 h-4 text-wm-accent" />
            <h3 className="text-xs font-bold font-mono tracking-wider text-gray-400 uppercase">
              Refine your shortlist
            </h3>
          </div>
          
          <div className="flex flex-wrap gap-2.5">
            {recommendations.refinement_suggestions.map((s, idx) => (
              <button
                id={`refinement-btn-${idx}`}
                key={idx}
                onClick={() => onRefine(s)}
                className="bg-wm-card hover:bg-wm-card-hover text-gray-300 hover:text-white border border-gray-800 px-4 py-2.5 rounded-lg text-xs md:text-sm font-medium transition cursor-pointer text-left leading-relaxed flex items-center space-x-2"
              >
                <span className="w-1.5 h-1.5 bg-wm-accent rounded-full flex-shrink-0"></span>
                <span>{s}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

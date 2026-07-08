import React from 'react';
import { X, Play, Plus, Check, Star, ShieldAlert, Award, Compass, Tv } from 'lucide-react';
import { Movie } from '../types';
import { curatedMovies } from '../data/curatedMovies';
import { getCleanImageUrl, handleImageLoadError } from '../utils/imageHelper';

interface MovieDetailModalProps {
  movie: Movie;
  onClose: () => void;
  onAddToWatchlist: (movie: Movie) => void;
  watchlistIds: string[];
  onMovieClick: (movie: Movie) => void;
}

export default function MovieDetailModal({
  movie,
  onClose,
  onAddToWatchlist,
  watchlistIds,
  onMovieClick,
}: MovieDetailModalProps) {
  const isInWatchlist = watchlistIds.includes(movie.id);

  // Find 3 similar movies based on genres and moods
  const similarMovies = curatedMovies
    .filter(m => m.id !== movie.id)
    .map(m => {
      let score = 0;
      m.genres.forEach(g => { if (movie.genres.includes(g)) score += 3; });
      m.moods.forEach(md => { if (movie.moods.includes(md)) score += 2; });
      if (m.contentType === movie.contentType) score += 2;
      return { movie: m, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(x => x.movie);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div 
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 md:p-6"
    >
      <div 
        id="movie-detail-modal"
        className="relative bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] md:max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
      >
        {/* Close Button - Stays pinned at top right */}
        <button
          id="close-modal-btn"
          onClick={onClose}
          className="absolute top-4 right-4 z-30 bg-slate-950/80 text-slate-400 hover:text-white p-2.5 rounded-full border border-slate-800 backdrop-blur transition hover:scale-105 shadow-md"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Scrollable body content */}
        <div className="overflow-y-auto flex-1">
          {/* Hero Backdrop */}
          <div className="relative h-64 md:h-80 overflow-hidden flex-shrink-0">
            <img 
              src={getCleanImageUrl(movie.backdropUrl || movie.posterUrl, 'backdrop')} 
              alt={movie.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
              onError={(e) => handleImageLoadError(e, movie.posterUrl)}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"></div>
            
            <div className="absolute bottom-6 left-6 md:left-8 right-6">
              <div className="flex flex-wrap gap-2 mb-2">
                <span className="bg-amber-500 text-slate-950 font-sans font-black text-xs px-2.5 py-0.5 rounded-md uppercase">
                  {movie.rating} Rating
                </span>
                <span className="bg-slate-950/80 text-slate-300 font-mono text-[10px] px-2.5 py-0.5 rounded-md border border-slate-800">
                  {movie.contentType === 'movie' ? `${movie.runtime}m` : `${movie.seasons} Seasons`}
                </span>
                {movie.seriesStatus && (
                  <span className="bg-indigo-600 text-white font-mono text-[10px] px-2.5 py-0.5 rounded-md border border-indigo-500 capitalize">
                    Status: {movie.seriesStatus}
                  </span>
                )}
              </div>
              <h2 className="text-3xl md:text-4xl font-sans font-black text-white tracking-tight">
                {movie.title}
              </h2>
            </div>
          </div>

          {/* Details Content Grid */}
          <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Main Info */}
            <div className="md:col-span-2 space-y-6">
              {/* Synopsis */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold font-mono tracking-wider text-slate-400 uppercase">Synopsis</h3>
                <p className="text-slate-300 text-sm leading-relaxed">{movie.synopsis}</p>
              </div>

              {/* Trailer Iframe Player */}
              {movie.trailerUrl && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold font-mono tracking-wider text-slate-400 uppercase">Teaser / Trailer</h3>
                  <div className="relative h-0 pb-[56.25%] bg-black rounded-xl overflow-hidden border border-slate-800 shadow-inner">
                    <iframe
                      title={`${movie.title} Trailer`}
                      src={movie.trailerUrl}
                      className="absolute top-0 left-0 w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  </div>
                </div>
              )}

              {/* Cast & Crew */}
              {movie.cast && movie.cast.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold font-mono tracking-wider text-slate-400 uppercase">Top Cast</h3>
                  <div className="flex flex-wrap gap-2">
                    {movie.cast.map(actor => (
                      <span key={actor} className="text-xs bg-slate-850 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-xl font-medium">
                        {actor}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Similar Drawer */}
              <div className="space-y-3 pt-4 border-t border-slate-800">
                <h3 className="text-xs font-bold font-mono tracking-wider text-slate-400 uppercase">Similar to this Title</h3>
                <div className="grid grid-cols-3 gap-3">
                  {similarMovies.map(sm => (
                    <div 
                      key={sm.id}
                      onClick={() => onMovieClick(sm)}
                      className="cursor-pointer group relative overflow-hidden bg-slate-950 border border-slate-850 rounded-xl h-24 flex items-end p-2.5"
                    >
                      <img 
                        src={getCleanImageUrl(sm.posterUrl, 'poster')} 
                        alt={sm.title}
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-80 transition duration-300 group-hover:scale-105"
                        onError={(e) => handleImageLoadError(e)}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 to-transparent"></div>
                      <div className="relative z-10">
                        <span className="text-[10px] text-white font-bold block truncate leading-tight group-hover:text-amber-400 transition">
                          {sm.title}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono block">
                          {sm.year} · ★{sm.rating}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar Metadata */}
            <div className="space-y-6 bg-slate-950/40 p-5 rounded-2xl border border-slate-800/80">
              {/* Available Platforms */}
              <div className="space-y-2">
                <span className="text-xs font-bold font-mono tracking-wider text-slate-400 uppercase block">Where to Stream:</span>
                <div className="flex flex-col space-y-1.5">
                  {movie.platforms.map(plat => (
                    <div key={plat} className="flex items-center space-x-2 text-slate-300 text-xs font-semibold">
                      <Tv className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <span>{plat}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ending preference */}
              {movie.endingPreference && (
                <div className="space-y-1 pb-4 border-b border-slate-800/60">
                  <span className="text-xs font-bold font-mono tracking-wider text-slate-400 uppercase block">Story End Preference:</span>
                  <span className="text-xs bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-2.5 py-1 rounded-lg font-bold capitalize inline-block">
                    {movie.endingPreference} (Spoiler-safe)
                  </span>
                </div>
              )}

              {/* Content Warnings */}
              {movie.contentWarnings && movie.contentWarnings.length > 0 && (
                <div className="space-y-2 pb-4 border-b border-slate-800/60">
                  <div className="flex items-center space-x-1.5 text-rose-400">
                    <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                    <span className="text-xs font-bold font-mono uppercase tracking-wider">Content Advisories:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {movie.contentWarnings.map(warn => (
                      <span key={warn} className="text-[10px] font-bold font-mono text-rose-300 bg-rose-500/10 border border-rose-500/25 px-2 py-0.5 rounded-md">
                        {warn}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* General Specs */}
              <div className="space-y-2 text-xs">
                <span className="text-xs font-bold font-mono tracking-wider text-slate-400 uppercase block">Specs:</span>
                <div className="grid grid-cols-2 gap-y-2 font-medium text-slate-300">
                  <span className="text-slate-500 font-mono">Format:</span>
                  <span className="capitalize text-right">{movie.contentType}</span>

                  <span className="text-slate-500 font-mono">Language:</span>
                  <span className="text-right">{movie.languages.join(', ')}</span>

                  <span className="text-slate-500 font-mono">Region:</span>
                  <span className="text-right">{movie.countries.join(', ')}</span>

                  <span className="text-slate-500 font-mono">Pacing:</span>
                  <span className="capitalize text-right">{movie.pace.replace('_', ' ')}</span>
                </div>
              </div>

              {/* Action */}
              <div className="pt-4 border-t border-slate-800/60">
                <button
                  id="modal-add-watchlist-btn"
                  onClick={() => onAddToWatchlist(movie)}
                  className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition ${
                    isInWatchlist
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20'
                  }`}
                >
                  {isInWatchlist ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>In your Watchlist</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Add to Watchlist</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

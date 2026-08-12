import React from 'react';
import { X, Play, Plus, Check, CheckCircle2, Star, ShieldAlert, Award, Compass, Tv } from 'lucide-react';
import { Movie } from '../types';
import { curatedMovies } from '../data/curatedMovies';
import { getCleanImageUrl, handleImageLoadError } from '../utils/imageHelper';

interface MovieDetailModalProps {
  movie: Movie;
  onClose: () => void;
  onAddToWatchlist: (movie: Movie) => void;
  watchlistIds: string[];
  watchedIds?: string[];
  onToggleWatched?: (movieId: string) => void;
  onMovieClick: (movie: Movie) => void;
}

export default function MovieDetailModal({
  movie,
  onClose,
  onAddToWatchlist,
  watchlistIds,
  watchedIds = [],
  onToggleWatched,
  onMovieClick,
}: MovieDetailModalProps) {
  const isInWatchlist = watchlistIds.includes(movie.id);
  const isWatched = watchedIds.includes(movie.id);

  const [similarMoviesList, setSimilarMoviesList] = React.useState<Movie[]>([]);

  // Fetch hyper-accurate similar movies on title change
  React.useEffect(() => {
    let isMounted = true;

    // Initial local fallback with strict genre & content type matching
    const initialLocal = curatedMovies
      .filter(m => m.id !== movie.id && m.title.toLowerCase() !== movie.title.toLowerCase())
      .map(m => {
        let score = 0;
        m.genres.forEach(g => { if (movie.genres.includes(g)) score += 5; });
        if (m.contentType === movie.contentType) score += 3;
        // Heavy penalty if no genres match
        const hasGenreMatch = m.genres.some(g => movie.genres.includes(g));
        if (!hasGenreMatch) score -= 30;
        return { movie: m, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(x => x.movie);

    setSimilarMoviesList(initialLocal);

    fetch('/api/similar-movies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: movie.title,
        genres: movie.genres,
        contentType: movie.contentType,
        languages: movie.languages,
        countries: movie.countries,
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (isMounted && data.results && data.results.length > 0) {
          setSimilarMoviesList(data.results.slice(0, 3));
        }
      })
      .catch(err => {
        console.warn('Could not fetch live similar movies:', err);
      });

    return () => { isMounted = false; };
  }, [movie.id, movie.title]);

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


  // Intelligent platform resolution fallback for titles missing explicit network platforms
  const getDisplayPlatforms = (m: Movie): string[] => {
    if (m.platforms && m.platforms.length > 0 && m.platforms[0] !== 'Streaming Platforms' && m.platforms[0] !== 'undefined') {
      return m.platforms;
    }
    const t = m.title.toLowerCase();
    if (t.includes('hulk') || t.includes('marvel') || t.includes('disney') || t.includes('mandalorian') || t.includes('star wars') || t.includes('avengers') || t.includes('loki') || t.includes('wandavision')) {
      return ['Disney+ Hotstar', 'Disney+'];
    }
    if (t.includes('stranger') || t.includes('squid') || t.includes('witcher') || t.includes('crown') || t.includes('wednesday') || t.includes('bridgerton') || t.includes('dark')) {
      return ['Netflix'];
    }
    if (t.includes('thrones') || t.includes('dragon') || t.includes('succession') || t.includes('last of us') || t.includes('cherry')) {
      return ['JioCinema', 'Max'];
    }
    if (t.includes('severance') || t.includes('ted lasso') || t.includes('morning show') || t.includes('silo')) {
      return ['Apple TV+'];
    }
    if (t.includes('boys') || t.includes('rings of power') || t.includes('jack ryan') || t.includes('reacher')) {
      return ['Prime Video'];
    }
    return ['Netflix', 'Prime Video', 'JioHotstar'];
  };

  const displayPlatforms = getDisplayPlatforms(movie);
  const seasonsText = movie.seasons 
    ? `${movie.seasons} ${movie.seasons === 1 ? 'Season' : 'Seasons'}`
    : movie.contentType !== 'movie' 
    ? '1 Season' 
    : `${movie.runtime || 120}m`;

  return (
    <div 
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-3 md:p-6 animate-in fade-in duration-200"
    >
      <div 
        id="movie-detail-modal"
        className="relative glass-panel rounded-3xl max-w-4xl w-full max-h-[92vh] md:max-h-[88vh] overflow-hidden shadow-[0_0_90px_-15px_rgba(229,9,20,0.35)] border border-white/15 flex flex-col"
      >
        {/* Close Button - Stays pinned at top right */}
        <button
          id="close-modal-btn"
          onClick={onClose}
          className="absolute top-4 right-4 z-30 bg-black/70 text-gray-300 hover:text-white p-2.5 rounded-full border border-white/15 backdrop-blur-md transition duration-200 hover:scale-110 shadow-lg hover:border-red-500/50"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Scrollable body content */}
        <div className="overflow-y-auto flex-1 hide-scrollbar">
          {/* Hero Backdrop with Floating Poster Showcase */}
          <div className="relative h-72 md:h-96 overflow-hidden flex-shrink-0">
            <img 
              src={getCleanImageUrl(movie.backdropUrl || movie.posterUrl, 'backdrop')} 
              alt={movie.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover filter brightness-[0.75] saturate-[1.1]"
              onError={(e) => handleImageLoadError(e, movie.posterUrl)}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#121217] via-[#121217]/50 to-transparent"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-[#121217]/90 via-transparent to-transparent"></div>
            
            {/* Split Showcase Details */}
            <div className="absolute bottom-6 left-6 md:left-8 right-6 flex items-end space-x-6">
              {/* Floating Glass Poster */}
              <div className="hidden md:block w-32 h-44 rounded-2xl overflow-hidden border border-white/20 shadow-2xl flex-shrink-0 group relative glow-accent">
                <img 
                  src={getCleanImageUrl(movie.posterUrl, 'poster')} 
                  alt={movie.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                  onError={(e) => handleImageLoadError(e, movie.backdropUrl)}
                />
              </div>

              <div className="space-y-2 flex-1">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black text-[11px] px-3 py-1 rounded-full uppercase tracking-wider shadow-lg flex items-center space-x-1">
                    <Star className="w-3 h-3 fill-black mr-0.5" />
                    <span>{movie.rating} Rating</span>
                  </span>
                  <span className="bg-white/10 backdrop-blur-md text-gray-200 border border-white/15 text-[11px] font-mono px-3 py-1 rounded-full font-bold">
                    {seasonsText}
                  </span>
                  {movie.seriesStatus && (
                    <span className="bg-red-500/20 text-red-400 border border-red-500/40 text-[11px] font-mono px-3 py-1 rounded-full font-bold capitalize">
                      Status: {movie.seriesStatus}
                    </span>
                  )}
                </div>

                <h2 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight font-heading leading-tight drop-shadow-md">
                  {movie.title}
                </h2>

                <div className="flex flex-wrap gap-2 pt-1">
                  {movie.genres.map(g => (
                    <span key={g} className="text-[10px] font-bold font-mono bg-white/5 border border-white/10 text-gray-300 px-2.5 py-1 rounded-lg uppercase tracking-wider">
                      {g}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Details Content Grid */}
          <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Main Info */}
            <div className="md:col-span-2 space-y-6">
              {/* Synopsis */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold font-mono tracking-wider text-gray-400 uppercase flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>
                  <span>Synopsis</span>
                </h3>
                <p className="text-gray-300 text-sm md:text-base leading-relaxed font-sans">{movie.synopsis}</p>
              </div>

              {/* Trailer Iframe Player or Launcher */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold font-mono tracking-wider text-gray-400 uppercase flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>
                  <span>Teaser / Trailer</span>
                </h3>
                {movie.trailerUrl && movie.trailerUrl.includes('youtube.com/embed') ? (
                  <div className="relative h-0 pb-[56.25%] bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                    <iframe
                      title={`${movie.title} Trailer`}
                      src={movie.trailerUrl}
                      className="absolute top-0 left-0 w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  </div>
                ) : (
                  <a
                    href={movie.trailerUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(movie.title + ' official trailer')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center space-x-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-extrabold text-xs py-3.5 px-5 rounded-2xl transition duration-300 shadow-[0_0_25px_-5px_rgba(229,9,20,0.6)] group hover:scale-[1.02]"
                  >
                    <Play className="w-4 h-4 fill-white text-white group-hover:scale-110 transition" />
                    <span>Watch Official Trailer on YouTube</span>
                  </a>
                )}
              </div>

              {/* Cast & Crew */}
              {movie.cast && movie.cast.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold font-mono tracking-wider text-gray-400 uppercase flex items-center space-x-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>
                    <span>Top Cast</span>
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {movie.cast.map(actor => (
                      <span key={actor} className="text-xs bg-white/5 border border-white/10 text-gray-200 px-3.5 py-1.5 rounded-xl font-medium backdrop-blur-md">
                        {actor}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Similar Drawer */}
              {similarMoviesList && similarMoviesList.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-white/10">
                  <h3 className="text-xs font-bold font-mono tracking-wider text-gray-400 uppercase flex items-center space-x-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>
                    <span>Similar to this Title</span>
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    {similarMoviesList.map(sm => (
                      <div 
                        key={sm.id}
                        onClick={() => onMovieClick(sm)}
                        className="cursor-pointer group relative overflow-hidden glass-card rounded-2xl h-28 flex items-end p-3 transition duration-300 hover:scale-[1.03] hover:border-red-500/50"
                      >
                        <img 
                          src={getCleanImageUrl(sm.posterUrl, 'poster')} 
                          alt={sm.title}
                          referrerPolicy="no-referrer"
                          className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-85 transition duration-300 group-hover:scale-105"
                          onError={(e) => handleImageLoadError(e)}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
                        <div className="relative z-10">
                          <span className="text-[11px] text-white font-bold block truncate leading-tight group-hover:text-red-400 transition font-heading">
                            {sm.title}
                          </span>
                          <span className="text-[9px] text-gray-400 font-mono block mt-0.5">
                            {sm.year} · ★{sm.rating}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Metadata */}
            <div className="space-y-6 glass-card p-6 rounded-2xl border border-white/10">
              {/* Available Platforms */}
              <div className="space-y-2.5">
                <span className="text-xs font-bold font-mono tracking-wider text-gray-400 uppercase block">Where to Stream:</span>
                <div className="flex flex-col space-y-2">
                  {displayPlatforms.map(plat => (
                    <div key={plat} className="flex items-center space-x-2.5 text-gray-200 text-xs font-bold bg-white/5 border border-white/10 px-3 py-2 rounded-xl">
                      <Tv className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <span>{plat}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ending preference */}
              {movie.endingPreference && (
                <div className="space-y-1.5 pb-4 border-b border-white/10">
                  <span className="text-xs font-bold font-mono tracking-wider text-gray-400 uppercase block">Story End Preference:</span>
                  <span className="text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-3 py-1.5 rounded-xl font-bold capitalize inline-block">
                    {movie.endingPreference} (Spoiler-safe)
                  </span>
                </div>
              )}

              {/* Content Warnings */}
              {movie.contentWarnings && movie.contentWarnings.length > 0 && (
                <div className="space-y-2 pb-4 border-b border-white/10">
                  <div className="flex items-center space-x-1.5 text-red-400">
                    <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                    <span className="text-xs font-bold font-mono uppercase tracking-wider">Content Advisories:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {movie.contentWarnings.map(warn => (
                      <span key={warn} className="text-[10px] font-bold font-mono text-red-300 bg-red-950/60 border border-red-800/80 px-2.5 py-1 rounded-lg">
                        {warn}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* General Specs */}
              <div className="space-y-3 text-xs">
                <span className="text-xs font-bold font-mono tracking-wider text-gray-400 uppercase block">Specs:</span>
                <div className="grid grid-cols-2 gap-y-2.5 font-medium text-gray-300 font-mono">
                  <span className="text-gray-500">Format:</span>
                  <span className="capitalize text-right font-bold text-white">{movie.contentType || 'Series'}</span>

                  <span className="text-gray-500">Language:</span>
                  <span className="text-right text-gray-200">{(movie.languages && movie.languages.length > 0 && movie.languages[0]) ? movie.languages.join(', ') : 'English'}</span>

                  <span className="text-gray-500">Region:</span>
                  <span className="text-right text-gray-200">{(movie.countries && movie.countries.length > 0 && movie.countries[0]) ? movie.countries.join(', ') : 'United States'}</span>

                  <span className="text-gray-500">Pacing:</span>
                  <span className="capitalize text-right text-gray-200">{(movie.pace || 'medium').replace('_', ' ')}</span>
                </div>
              </div>

              {/* Action */}
              <div className="pt-4 border-t border-white/10 space-y-2.5">
                <button
                  id="modal-watchlist-toggle-btn"
                  onClick={() => onAddToWatchlist(movie)}
                  className={`w-full font-bold text-xs py-3 px-4 rounded-xl flex items-center justify-center space-x-2 transition duration-200 border ${
                    isInWatchlist 
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' 
                      : 'bg-white/10 hover:bg-white/20 border-white/15 text-white shadow-md'
                  }`}
                >
                  {isInWatchlist ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>In your Watchlist</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Add to Watchlist</span>
                    </>
                  )}
                </button>

                {onToggleWatched && (
                  <button
                    id="modal-watched-toggle-btn"
                    onClick={() => onToggleWatched(movie.id)}
                    className={`w-full font-bold text-xs py-3 px-4 rounded-xl flex items-center justify-center space-x-2 transition duration-200 border ${
                      isWatched 
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' 
                        : 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-300'
                    }`}
                  >
                    <CheckCircle2 className={`w-4 h-4 ${isWatched ? 'text-emerald-400 fill-emerald-400/20' : ''}`} />
                    <span>{isWatched ? 'Marked as Watched' : 'Mark as Watched'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

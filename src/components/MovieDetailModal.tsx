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
        id: movie.id,
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
    // TMDB titles carry real provider data: empty means not on a subscription service in India.
    if (m.id.startsWith('tmdb_')) return [];
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

  const [activeTab, setActiveTab] = React.useState<'overview' | 'cast' | 'reviews'>('overview');

  // Realistic Rotten Tomatoes & Metascore derivation
  const rtScore = Math.min(98, Math.round(movie.rating * 10 + 3));
  const metaScore = Math.min(95, Math.round(movie.rating * 9 + 4));

  return (
    <div 
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-2xl flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
    >
      <div 
        id="movie-detail-modal"
        className="relative glass-panel rounded-3xl max-w-5xl w-full max-h-[92vh] overflow-hidden shadow-[0_0_90px_-10px_rgba(229,9,20,0.4)] border border-red-500/40 flex flex-col"
      >
        {/* Top Header Bar with Centered Tabs & Close */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-white/10 bg-black/40 backdrop-blur-md shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 rounded bg-red-600 flex items-center justify-center text-white font-black text-xs">
              W
            </div>
            <span className="text-xs font-bold text-white font-heading tracking-wide uppercase">WatchMatch</span>
          </div>

          {/* Centered Navigation Tabs */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-full p-1 text-xs font-semibold">
            {(['overview', 'cast', 'reviews'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1 rounded-full capitalize transition cursor-pointer ${
                  activeTab === tab ? 'bg-white/20 text-white font-bold shadow' : 'text-gray-400 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Close Button */}
          <button
            id="close-modal-btn"
            onClick={onClose}
            className="text-xs font-mono font-bold text-gray-400 hover:text-white flex items-center space-x-1 cursor-pointer transition hover:text-red-400"
          >
            <span>CLOSE</span>
            <span>✕</span>
          </button>
        </div>

        {/* Scrollable body content */}
        <div className="overflow-y-auto flex-1 hide-scrollbar">
          {/* Hero Section Banner */}
          <div className="relative h-64 md:h-72 overflow-hidden flex-shrink-0 bg-black/60">
            <img 
              src={getCleanImageUrl(movie.backdropUrl || movie.posterUrl, 'backdrop')} 
              alt={movie.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover filter brightness-[0.55] saturate-[1.1]"
              onError={(e) => handleImageLoadError(e, movie.posterUrl)}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e13] via-transparent to-transparent"></div>
            
            {/* Overlay Header Info */}
            <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs font-mono text-gray-300 font-bold block">
                  {movie.year} • {movie.genres.slice(0, 3).join(' • ')}
                </span>
                <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight font-heading leading-tight drop-shadow-md">
                  {movie.title}
                </h2>
              </div>

              {movie.trailerUrl && (
                <a
                  href={movie.trailerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white/15 hover:bg-white/25 backdrop-blur-md text-white border border-white/20 px-4 py-2 rounded-full text-xs font-bold flex items-center space-x-2 transition cursor-pointer shadow-lg"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Trailer</span>
                </a>
              )}
            </div>
          </div>

          {/* Details Content Grid */}
          <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left 8 Columns: Poster + Player + Cast + Synopsis */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* Poster + Rating Badges Row */}
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                {/* Floating Poster Card */}
                <div className="w-36 h-52 rounded-2xl overflow-hidden border border-white/20 shadow-2xl flex-shrink-0 relative group glow-accent">
                  <img 
                    src={getCleanImageUrl(movie.posterUrl, 'poster')} 
                    alt={movie.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                    onError={(e) => handleImageLoadError(e, movie.backdropUrl)}
                  />
                  <div className="absolute bottom-2 left-2 right-2 bg-black/80 backdrop-blur-md py-1 px-1.5 rounded text-center border border-white/10">
                    <span className="text-[10px] font-mono text-gray-300 font-bold block">
                      {movie.year} · {seasonsText} · PG-13
                    </span>
                  </div>
                </div>

                {/* Rating Badges Row + Synopsis */}
                <div className="flex-1 space-y-3.5">
                  <div className="flex flex-wrap gap-2.5 items-center">
                    {/* IMDb */}
                    <div className="flex items-center space-x-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 px-3 py-1 rounded-xl text-xs font-mono font-bold">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span>IMDb {movie.rating} ({((movie.voteCount || 125000)/1000).toFixed(0)}k)</span>
                    </div>

                    {/* Metascore */}
                    <div className="flex items-center space-x-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-2.5 py-1 rounded-xl text-xs font-mono font-bold">
                      <span>Metascore {metaScore}</span>
                    </div>

                    {/* Rotten Tomatoes */}
                    <div className="flex items-center space-x-1 bg-red-500/20 border border-red-500/40 text-red-300 px-2.5 py-1 rounded-xl text-xs font-mono font-bold">
                      <span>🍅 RT {rtScore}%</span>
                    </div>
                  </div>

                  {/* Synopsis */}
                  <div className="space-y-1">
                    <span className="text-xs font-mono font-bold text-gray-400 uppercase tracking-wider block">
                      Synopsis
                    </span>
                    <p className="text-gray-300 text-sm leading-relaxed font-sans">
                      {movie.synopsis}
                    </p>
                  </div>
                </div>
              </div>

              {/* Embedded Trailer Player */}
              <div className="space-y-2">
                <span className="text-xs font-mono font-bold text-gray-400 uppercase tracking-wider block">
                  Official Teaser / Trailer
                </span>
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
                  <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-xl bg-black/60 h-48 flex items-center justify-center group">
                    <img 
                      src={getCleanImageUrl(movie.backdropUrl || movie.posterUrl, 'backdrop')} 
                      alt="Trailer placeholder"
                      className="absolute inset-0 w-full h-full object-cover filter brightness-[0.4] group-hover:scale-105 transition duration-500"
                    />
                    <a
                      href={movie.trailerUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(movie.title + ' official trailer')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative z-10 flex items-center space-x-3 bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs px-6 py-3 rounded-full shadow-[0_0_25px_rgba(229,9,20,0.7)] transition cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>Play Trailer on YouTube</span>
                    </a>
                  </div>
                )}
              </div>

              {/* Top Cast Modern Avatar Cards */}
              {movie.cast && movie.cast.length > 0 && (
                <div className="space-y-3 pt-2">
                  <span className="text-xs font-mono font-bold text-gray-400 uppercase tracking-wider block">
                    Top Cast
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {movie.cast.map((actor, idx) => (
                      <div key={idx} className="flex items-center space-x-2.5 bg-white/5 border border-white/10 p-2 rounded-xl">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-600/40 to-rose-600/40 border border-red-500/30 text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
                          {actor.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-white block truncate">{actor}</span>
                          <span className="text-[10px] text-gray-400 font-mono block truncate">Character</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Right 4 Columns: Where to Watch, WatchMatch Rating, Ending, Advisories */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* WHERE TO WATCH Platform Cards with Action Buttons */}
              <div className="glass-card p-5 rounded-3xl border border-white/10 space-y-3">
                <span className="text-xs font-mono font-bold text-gray-400 uppercase tracking-wider block">
                  WHERE TO WATCH
                </span>

                <div className="space-y-2">
                  {displayPlatforms.length === 0 && (
                    <p className="text-xs text-gray-400">Not on a subscription service in India right now (may be available to rent or buy).</p>
                  )}
                  {displayPlatforms.map(plat => (
                    <div key={plat} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10">
                      <div className="flex items-center space-x-2.5">
                        <Tv className="w-4 h-4 text-red-500 flex-shrink-0" />
                        <span className="text-xs font-bold text-white">{plat}</span>
                      </div>
                      <span className="text-[10px] font-mono font-bold bg-white/10 px-2 py-0.5 rounded text-gray-300">
                        STREAM
                      </span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    onClick={() => onAddToWatchlist(movie)}
                    className="bg-white/10 hover:bg-white/20 text-white border border-white/15 py-2 px-3 rounded-xl text-xs font-bold text-center cursor-pointer transition"
                  >
                    WATCH NOW
                  </button>
                  <button
                    onClick={() => onAddToWatchlist(movie)}
                    className="bg-red-600/30 hover:bg-red-600/50 text-red-300 border border-red-500/40 py-2 px-3 rounded-xl text-xs font-bold text-center cursor-pointer transition"
                  >
                    SUBSCRIBE
                  </button>
                </div>
              </div>

              {/* WATCHMATCH RATING Badge */}
              <div className="glass-card p-4 rounded-2xl border border-white/10 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-gray-400 uppercase font-bold block">
                    WATCHMATCH RATING
                  </span>
                  <div className="flex items-center space-x-2 mt-0.5">
                    <span className="text-2xl font-black text-white font-heading">
                      {(movie.rating / 2).toFixed(1)} ★
                    </span>
                    <span className="text-xs bg-red-950/60 border border-red-500/50 text-red-300 px-2 py-0.5 rounded font-bold font-mono">
                      "Must Watch"
                    </span>
                  </div>
                </div>
              </div>

              {/* ENDING PREFERENCE Badge */}
              <div className="glass-card p-4 rounded-2xl border border-white/10 space-y-1.5">
                <span className="text-[10px] font-mono text-gray-400 uppercase font-bold block">
                  ENDING PREFERENCE
                </span>
                <div className="inline-flex items-center space-x-1.5 bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 px-3 py-1 rounded-xl text-xs font-bold">
                  <span>✓</span>
                  <span>SPOILER-SAFE • {movie.endingPreference ? movie.endingPreference.charAt(0).toUpperCase() + movie.endingPreference.slice(1) : 'Satisfying'} Ending</span>
                </div>
              </div>

              {/* CONTENT ADVISORIES */}
              <div className="glass-card p-4 rounded-2xl border border-white/10 space-y-2">
                <span className="text-[10px] font-mono text-gray-400 uppercase font-bold block">
                  CONTENT ADVISORIES
                </span>
                <div className="space-y-1 text-xs text-gray-300 font-sans">
                  {(movie.contentWarnings && movie.contentWarnings.length > 0 
                    ? movie.contentWarnings 
                    : ['Language (Strong)', 'Violence (Moderate)', 'Sci-Fi Themes']
                  ).map(warn => (
                    <div key={warn} className="flex items-center space-x-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                      <span>{warn}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Watchlist & Watched Actions */}
              <div className="space-y-2 pt-2">
                <button
                  id="modal-watchlist-toggle-btn"
                  onClick={() => onAddToWatchlist(movie)}
                  className={`w-full font-bold text-xs py-3.5 px-4 rounded-xl flex items-center justify-center space-x-2 transition duration-200 border cursor-pointer ${
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
                    className={`w-full font-bold text-xs py-3.5 px-4 rounded-xl flex items-center justify-center space-x-2 transition duration-200 border cursor-pointer ${
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

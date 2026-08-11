import React, { useState } from 'react';
import { User, Heart, Trash2, Sliders, Flame, Trash, Bookmark, RefreshCw, Star, Info, CheckCircle2, Filter } from 'lucide-react';
import { TasteProfile, Movie } from '../types';
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
}: ProfileViewProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'unwatched' | 'watched'>('all');

  // Load complete movie details for watchlist, watched, liked, disliked
  const watchedIds = tasteProfile.watched || [];
  const watchlistMovies = (tasteProfile.watchlist || []).map(id => curatedMovies.find(m => m.id === id)).filter(Boolean) as Movie[];
  const watchedMovies = watchedIds.map(id => curatedMovies.find(m => m.id === id)).filter(Boolean) as Movie[];
  const unwatchedWatchlistMovies = watchlistMovies.filter(m => !watchedIds.includes(m.id));
  const likedMovies = (tasteProfile.liked || []).map(id => curatedMovies.find(m => m.id === id)).filter(Boolean) as Movie[];
  const dislikedMovies = (tasteProfile.disliked || []).map(id => curatedMovies.find(m => m.id === id)).filter(Boolean) as Movie[];

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
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-10" id="taste-profile-view">
      {/* 1. Header Profile Summary */}
      <div className="bg-wm-card border border-gray-800 p-6 md:p-8 rounded-xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 bg-wm-accent rounded-full text-white flex items-center justify-center flex-shrink-0 shadow-lg">
            <User className="w-7 h-7 fill-white" />
          </div>
          <div className="text-center md:text-left space-y-1">
            <h2 className="text-xl font-black text-white">Your Personal CineTaste Profile</h2>
            <p className="text-gray-400 text-sm leading-relaxed">WatchMatch builds a persistent layer from your likes, dislikes, and watchlist to customize Scout answers.</p>
          </div>
        </div>
        
        <button
          id="btn-clear-profile"
          onClick={onResetTasteProfile}
          className="flex items-center space-x-1.5 text-xs text-wm-accent hover:text-white bg-black/60 border border-gray-800 hover:bg-wm-card-hover px-4 py-2.5 rounded-lg font-bold transition duration-200 shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Clear Profile History</span>
        </button>
      </div>

      {/* 2. Analytical Preferences Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Fav Genres */}
        <div className="bg-wm-card border border-gray-800 p-6 rounded-xl space-y-3">
          <div className="flex items-center space-x-2">
            <Flame className="w-5 h-5 text-wm-accent" />
            <h3 className="font-bold text-white text-base">Top Preferred Genres</h3>
          </div>
          {favoriteGenres.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {favoriteGenres.map(g => (
                <span key={g} className="bg-red-950/60 border border-red-800 text-red-300 font-bold text-xs px-3.5 py-1.5 rounded-md uppercase">
                  {g}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Like titles during movie scouting to discover your favorite genres.</p>
          )}
        </div>

        {/* Fav Moods */}
        <div className="bg-wm-card border border-gray-800 p-6 rounded-xl space-y-3">
          <div className="flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-white text-base">Favorite Story Vibes</h3>
          </div>
          {favoriteMoods.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {favoriteMoods.map(m => (
                <span key={m} className="bg-amber-950/60 border border-amber-800 text-amber-300 font-bold text-xs px-3.5 py-1.5 rounded-md uppercase">
                  {m}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Interact with recommendations to map your atmospheric vibes.</p>
          )}
        </div>
      </div>

      {/* 3. WATCH STATUS FILTER TOGGLE CONTROL */}
      <div className="bg-wm-card border border-gray-800 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md">
        <div className="flex items-center space-x-2.5">
          <Filter className="w-5 h-5 text-wm-accent" />
          <div>
            <h3 className="font-bold text-white text-sm">Library Watch Filter</h3>
            <p className="text-xs text-gray-400">Filter your saved films by viewing status</p>
          </div>
        </div>

        <div className="flex items-center bg-black/60 p-1 rounded-lg border border-gray-800 gap-1 w-full sm:w-auto justify-center">
          <button
            id="filter-btn-all"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${
              statusFilter === 'all'
                ? 'bg-wm-accent text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            All Saved ({watchlistMovies.length + watchedMovies.length})
          </button>
          <button
            id="filter-btn-unwatched"
            onClick={() => setStatusFilter('unwatched')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition flex items-center space-x-1.5 ${
              statusFilter === 'unwatched'
                ? 'bg-wm-accent text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Unwatched Watchlist ({unwatchedWatchlistMovies.length})</span>
          </button>
          <button
            id="filter-btn-watched"
            onClick={() => setStatusFilter('watched')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition flex items-center space-x-1.5 ${
              statusFilter === 'watched'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Watched ({watchedMovies.length})</span>
          </button>
        </div>
      </div>

      {/* 4. WATCHED HISTORY SECTOR (Shown when filter is 'all' or 'watched') */}
      {(statusFilter === 'all' || statusFilter === 'watched') && (
        <div className="space-y-4" id="watched-history-sector">
          <div className="flex items-center space-x-2 border-b border-gray-800 pb-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-lg text-white">Already Watched History</h3>
            <span className="text-xs bg-emerald-950/60 border border-emerald-800 text-emerald-300 font-mono px-2.5 py-0.5 rounded font-bold">
              {watchedMovies.length} Marked
            </span>
          </div>

          {watchedMovies.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {watchedMovies.map(movie => (
                <div 
                  key={movie.id} 
                  className="bg-wm-card hover:bg-wm-card-hover border border-emerald-900/40 rounded-lg p-4 flex items-center justify-between gap-4 transition group"
                >
                  <div 
                    onClick={() => onMovieClick(movie)}
                    className="flex items-center space-x-3 cursor-pointer flex-1 min-w-0"
                  >
                    <img 
                      src={getCleanImageUrl(movie.posterUrl, 'poster')} 
                      alt={movie.title}
                      referrerPolicy="no-referrer"
                      className="w-12 h-16 object-cover rounded-md flex-shrink-0 border border-gray-800"
                      onError={(e) => handleImageLoadError(e, movie.backdropUrl)}
                    />
                    <div className="min-w-0">
                      <span className="font-bold text-white text-sm block group-hover:text-emerald-400 truncate transition flex items-center space-x-1">
                        <span>{movie.title}</span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline flex-shrink-0" />
                      </span>
                      <span className="text-gray-400 text-xs font-mono">
                        {movie.year} · ★{movie.rating} · <span className="capitalize">{movie.contentType}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1">
                    {onToggleWatched && (
                      <button
                        onClick={() => onToggleWatched(movie.id)}
                        className="text-emerald-400 hover:text-red-400 p-2 hover:bg-black/40 rounded-lg transition text-xs font-bold"
                        title="Unmark as watched"
                      >
                        Unmark
                      </button>
                    )}
                    {onRemoveFromWatched && (
                      <button
                        onClick={() => onRemoveFromWatched(movie.id)}
                        className="text-gray-500 hover:text-wm-accent p-2 hover:bg-black/40 rounded-lg transition"
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
            <div className="text-center py-8 bg-wm-card/20 border border-dashed border-gray-800 rounded-xl">
              <CheckCircle2 className="w-8 h-8 text-gray-700 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No titles marked watched yet. Mark movies watched from search results or details modal!</p>
            </div>
          )}
        </div>
      )}

      {/* 5. WATCHLIST SECTOR (Shown when filter is 'all' or 'unwatched') */}
      {(statusFilter === 'all' || statusFilter === 'unwatched') && (
        <div className="space-y-4" id="watchlist-sector">
          <div className="flex items-center space-x-2 border-b border-gray-800 pb-2">
            <Bookmark className="w-5 h-5 text-wm-accent" />
            <h3 className="font-bold text-lg text-white">
              {statusFilter === 'unwatched' ? 'Unwatched Watchlist' : 'Your Curated Watchlist'}
            </h3>
            <span className="text-xs bg-wm-card border border-gray-800 text-gray-300 font-mono px-2.5 py-0.5 rounded">
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
                    className="bg-wm-card hover:bg-wm-card-hover border border-gray-800 rounded-lg p-4 flex items-center justify-between gap-4 transition group"
                  >
                    <div 
                      onClick={() => onMovieClick(movie)}
                      className="flex items-center space-x-3 cursor-pointer flex-1 min-w-0"
                    >
                      <img 
                        src={getCleanImageUrl(movie.posterUrl, 'poster')} 
                        alt={movie.title}
                        referrerPolicy="no-referrer"
                        className="w-12 h-16 object-cover rounded-md flex-shrink-0 border border-gray-800"
                        onError={(e) => handleImageLoadError(e, movie.backdropUrl)}
                      />
                      <div className="min-w-0">
                        <span className="font-bold text-white text-sm block group-hover:text-wm-accent truncate transition flex items-center space-x-1">
                          <span>{movie.title}</span>
                          {isWatched && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline flex-shrink-0" />}
                        </span>
                        <span className="text-gray-400 text-xs font-mono">
                          {movie.year} · ★{movie.rating} · <span className="capitalize">{movie.contentType}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1">
                      {onToggleWatched && (
                        <button
                          onClick={() => onToggleWatched(movie.id)}
                          className={`text-xs font-bold px-2 py-1 rounded transition border ${
                            isWatched
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                              : 'bg-black/50 text-gray-400 border-gray-800 hover:text-white'
                          }`}
                          title={isWatched ? 'Mark unwatched' : 'Mark watched'}
                        >
                          {isWatched ? 'Watched' : 'Mark Watched'}
                        </button>
                      )}

                      <button
                        onClick={() => onRemoveFromWatchlist(movie.id)}
                        className="text-gray-500 hover:text-wm-accent p-2 hover:bg-black/40 rounded-lg transition"
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
            <div className="text-center py-10 bg-wm-card/40 border border-dashed border-gray-800 rounded-xl">
              <Bookmark className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">
                {statusFilter === 'unwatched'
                  ? 'All items on your watchlist have been watched!'
                  : 'Your watchlist is currently empty. Add titles during discovery!'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 4. LIKED TITLES SECTOR */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2 border-b border-gray-800 pb-2">
          <Heart className="w-5 h-5 text-wm-accent" />
          <h3 className="font-bold text-lg text-white">Liked Recommendations</h3>
          <span className="text-xs bg-wm-card border border-gray-800 text-gray-300 font-mono px-2.5 py-0.5 rounded">
            {likedMovies.length} Titles
          </span>
        </div>

        {likedMovies.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {likedMovies.map(movie => (
              <div 
                key={movie.id} 
                className="bg-wm-card border border-gray-800 rounded-lg p-4 flex items-center justify-between gap-4"
              >
                <div 
                  onClick={() => onMovieClick(movie)}
                  className="flex items-center space-x-3 cursor-pointer flex-1 min-w-0"
                >
                  <img 
                    src={getCleanImageUrl(movie.posterUrl, 'poster')} 
                    alt={movie.title}
                    referrerPolicy="no-referrer"
                    className="w-12 h-16 object-cover rounded-md flex-shrink-0 border border-gray-800"
                    onError={(e) => handleImageLoadError(e, movie.backdropUrl)}
                  />
                  <div className="min-w-0">
                    <span className="font-bold text-white text-sm block truncate">
                      {movie.title}
                    </span>
                    <span className="text-gray-400 text-xs font-mono">
                      {movie.year} · ★{movie.rating}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onRemoveFromLikes(movie.id)}
                  className="text-gray-500 hover:text-wm-accent p-2 hover:bg-black/40 rounded-lg transition"
                  title="Unlike"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 bg-wm-card/20 border border-dashed border-gray-800 rounded-xl">
            <p className="text-gray-500 text-sm">No liked films yet.</p>
          </div>
        )}
      </div>

      {/* 5. DISLIKED SECTOR */}
      {dislikedMovies.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center space-x-2 border-b border-gray-800 pb-2">
            <Trash className="w-5 h-5 text-gray-500" />
            <h3 className="font-bold text-lg text-white">Dismissed / Not Interested</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dislikedMovies.map(movie => (
              <div 
                key={movie.id} 
                className="bg-wm-card/40 border border-gray-800/60 rounded-lg p-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <div className="min-w-0">
                    <span className="font-semibold text-gray-400 text-sm block truncate">
                      {movie.title}
                    </span>
                    <span className="text-gray-500 text-xs font-mono">
                      {movie.year} · Dismissed
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onRemoveFromDislikes(movie.id)}
                  className="text-gray-500 hover:text-white p-2 rounded-lg transition"
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
  );
}

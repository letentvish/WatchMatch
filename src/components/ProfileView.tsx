import React from 'react';
import { User, Heart, Trash2, Sliders, Flame, Trash, Bookmark, RefreshCw, Star, Info } from 'lucide-react';
import { TasteProfile, Movie } from '../types';
import { curatedMovies } from '../data/curatedMovies';
import { getCleanImageUrl, handleImageLoadError } from '../utils/imageHelper';

interface ProfileViewProps {
  tasteProfile: TasteProfile;
  onRemoveFromWatchlist: (movieId: string) => void;
  onRemoveFromLikes: (movieId: string) => void;
  onRemoveFromDislikes: (movieId: string) => void;
  onResetTasteProfile: () => void;
  onMovieClick: (movie: Movie) => void;
}

export default function ProfileView({
  tasteProfile,
  onRemoveFromWatchlist,
  onRemoveFromLikes,
  onRemoveFromDislikes,
  onResetTasteProfile,
  onMovieClick,
}: ProfileViewProps) {

  // Load complete movie details for watchlist, liked, disliked
  const watchlistMovies = tasteProfile.watchlist.map(id => curatedMovies.find(m => m.id === id)).filter(Boolean) as Movie[];
  const likedMovies = tasteProfile.liked.map(id => curatedMovies.find(m => m.id === id)).filter(Boolean) as Movie[];
  const dislikedMovies = tasteProfile.disliked.map(id => curatedMovies.find(m => m.id === id)).filter(Boolean) as Movie[];

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
      <div className="bg-gradient-to-tr from-slate-900 to-indigo-950 border border-slate-800 p-6 md:p-8 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center space-x-4">
          <div className="bg-gradient-to-tr from-amber-500 to-rose-500 p-4 rounded-full text-slate-950 flex items-center justify-center">
            <User className="w-8 h-8 fill-slate-950" />
          </div>
          <div className="text-center md:text-left space-y-1">
            <h2 className="text-xl font-sans font-extrabold text-white">Your Personal CineTaste Profile</h2>
            <p className="text-slate-400 text-sm">WatchMatch builds a persistent layer from your likes, dislikes, and watchlist to customize Scout answers.</p>
          </div>
        </div>
        
        <button
          id="btn-clear-profile"
          onClick={onResetTasteProfile}
          className="flex items-center space-x-1 text-xs text-rose-400 hover:text-white bg-rose-950/40 border border-rose-900 hover:bg-rose-900 px-4 py-2.5 rounded-xl font-bold transition duration-200"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Clear Profile History</span>
        </button>
      </div>

      {/* 2. Analytical Preferences Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Fav Genres */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-3">
          <div className="flex items-center space-x-2">
            <Flame className="w-5 h-5 text-rose-500" />
            <h3 className="font-sans font-bold text-white text-base">Top Preferred Genres</h3>
          </div>
          {favoriteGenres.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {favoriteGenres.map(g => (
                <span key={g} className="bg-rose-500/10 border border-rose-500/35 text-rose-300 font-sans font-bold text-xs px-3.5 py-1.5 rounded-xl uppercase">
                  {g}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">Like titles during movie scouting to discover your favorite genres.</p>
          )}
        </div>

        {/* Fav Moods */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-3">
          <div className="flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-amber-500" />
            <h3 className="font-sans font-bold text-white text-base">Favorite Story Vibes</h3>
          </div>
          {favoriteMoods.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {favoriteMoods.map(m => (
                <span key={m} className="bg-amber-500/10 border border-amber-500/35 text-amber-300 font-sans font-bold text-xs px-3.5 py-1.5 rounded-xl uppercase">
                  {m}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">Interact with recommendations to map your atmospheric vibes.</p>
          )}
        </div>
      </div>

      {/* 3. ACTIVE WATCHLIST SECTOR */}
      <div className="space-y-4" id="watchlist-sector">
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-2">
          <Bookmark className="w-5 h-5 text-emerald-400" />
          <h3 className="font-sans font-bold text-lg text-white">Your Curated Watchlist</h3>
          <span className="text-xs bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded">
            {watchlistMovies.length} Titles
          </span>
        </div>

        {watchlistMovies.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {watchlistMovies.map(movie => (
              <div 
                key={movie.id} 
                className="bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 rounded-xl p-4 flex items-center justify-between gap-4 transition group"
              >
                <div 
                  onClick={() => onMovieClick(movie)}
                  className="flex items-center space-x-3 cursor-pointer flex-1 min-w-0"
                >
                  <img 
                    src={getCleanImageUrl(movie.posterUrl, 'poster')} 
                    alt={movie.title}
                    referrerPolicy="no-referrer"
                    className="w-12 h-16 object-cover rounded-lg flex-shrink-0 border border-slate-800"
                    onError={(e) => handleImageLoadError(e, movie.backdropUrl)}
                  />
                  <div className="min-w-0">
                    <span className="font-sans font-bold text-white text-sm block group-hover:text-amber-400 truncate transition">
                      {movie.title}
                    </span>
                    <span className="text-slate-400 text-xs font-mono">
                      {movie.year} · ★{movie.rating} · <span className="capitalize">{movie.contentType}</span>
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onRemoveFromWatchlist(movie.id)}
                  className="text-slate-500 hover:text-rose-400 p-2 hover:bg-slate-800/60 rounded-xl transition"
                  title="Remove from watchlist"
                >
                  <Trash className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl">
            <Bookmark className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">Your watchlist is currently empty. Add titles during discovery!</p>
          </div>
        )}
      </div>

      {/* 4. LIKED TITLES SECTOR */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-2">
          <Heart className="w-5 h-5 text-rose-500" />
          <h3 className="font-sans font-bold text-lg text-white">Liked Recommendations</h3>
          <span className="text-xs bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded">
            {likedMovies.length} Titles
          </span>
        </div>

        {likedMovies.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {likedMovies.map(movie => (
              <div 
                key={movie.id} 
                className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex items-center justify-between gap-4"
              >
                <div 
                  onClick={() => onMovieClick(movie)}
                  className="flex items-center space-x-3 cursor-pointer flex-1 min-w-0"
                >
                  <img 
                    src={getCleanImageUrl(movie.posterUrl, 'poster')} 
                    alt={movie.title}
                    referrerPolicy="no-referrer"
                    className="w-12 h-16 object-cover rounded-lg flex-shrink-0 border border-slate-800"
                    onError={(e) => handleImageLoadError(e, movie.backdropUrl)}
                  />
                  <div className="min-w-0">
                    <span className="font-sans font-bold text-white text-sm block truncate">
                      {movie.title}
                    </span>
                    <span className="text-slate-400 text-xs font-mono">
                      {movie.year} · ★{movie.rating}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onRemoveFromLikes(movie.id)}
                  className="text-slate-500 hover:text-rose-400 p-2 hover:bg-slate-800/60 rounded-xl transition"
                  title="Unlike"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 bg-slate-900/20 border border-dashed border-slate-800 rounded-2xl">
            <p className="text-slate-500 text-sm">No liked films yet.</p>
          </div>
        )}
      </div>

      {/* 5. DISLIKED SECTOR */}
      {dislikedMovies.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-800 pb-2">
            <Trash className="w-5 h-5 text-slate-500" />
            <h3 className="font-sans font-bold text-lg text-white">Dismissed / Not Interested</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dislikedMovies.map(movie => (
              <div 
                key={movie.id} 
                className="bg-slate-900/30 border border-slate-800/40 rounded-xl p-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <div className="min-w-0">
                    <span className="font-sans font-semibold text-slate-400 text-sm block truncate">
                      {movie.title}
                    </span>
                    <span className="text-slate-500 text-xs font-mono">
                      {movie.year} · Dismissed
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onRemoveFromDislikes(movie.id)}
                  className="text-slate-600 hover:text-white p-2 rounded-xl transition"
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

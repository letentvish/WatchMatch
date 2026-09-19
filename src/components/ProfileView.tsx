import React, { useState } from 'react';
import { User, Heart, Trash2, Sliders, Flame, Trash, Bookmark, RefreshCw, Star, Info, CheckCircle2, Filter, Sparkles, Brain, Compass, Award, Zap, Film } from 'lucide-react';
import { TasteProfile, Movie, CinephilePersona } from '../types';
import { curatedMovies } from '../data/curatedMovies';
import { getCleanImageUrl, handleImageLoadError } from '../utils/imageHelper';
import { usePosters } from '../utils/posters';

const PROFILE_SEEDS = [
  { title: 'Memento', year: 2000, rating: 8.4 },
  { title: 'Blade Runner 2049', year: 2017, rating: 8.0 },
  { title: 'Drive', year: 2011, rating: 7.8 },
  { title: 'Prisoners', year: 2013, rating: 8.2 },
  { title: 'Arrival', year: 2016, rating: 7.9 },
  { title: 'Oldboy', year: 2003, rating: 8.3 },
];

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
  const seedPoster = usePosters(PROFILE_SEEDS.map(s => ({ title: s.title, year: s.year })));


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

  const defaultArchetype = "The Cerebral Noir Minimalist";
  const defaultTagline = "Film is a mirror reflecting the shadows of the soul.";
  const defaultTropes = [
    "Existential Dread",
    "Unreliable Narrator",
    "Atmospheric Crime",
    "Moral Ambiguity",
    "Dystopian Worlds",
    "Minimalist Dialogue",
  ];

  return (
    <div className="max-w-[1550px] mx-auto px-4 sm:px-6 lg:px-12 py-8 space-y-10" id="taste-profile-view">
      
      {/* Page Title */}
      <div className="text-center space-y-1">
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight font-heading">
          CineTaste Passport
        </h1>
        <p className="text-gray-400 text-xs sm:text-sm font-sans">
          Your evolving cinematic identity, Taste DNA, and personalized recommendation seeds
        </p>
      </div>

      {/* Main Centered Passport Identity Card */}
      <div className="max-w-4xl mx-auto glass-panel rounded-3xl p-6 sm:p-8 md:p-10 border border-red-500/50 shadow-[0_0_70px_-10px_rgba(229,9,20,0.4)] relative overflow-hidden backdrop-blur-2xl">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          
          {/* Left Column: Avatar & User Identity */}
          <div className="md:col-span-4 flex flex-col items-center text-center space-y-4 md:border-r md:border-white/10 md:pr-6">
            <div className="relative">
              {/* Lens / Camera circular avatar with glowing red ring */}
              <div className="w-28 h-28 rounded-3xl overflow-hidden border-2 border-red-500 shadow-[0_0_30px_rgba(229,9,20,0.6)] p-1 bg-black/60 relative">
                <img 
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&q=80" 
                  alt="Avatar"
                  className="w-full h-full object-cover rounded-2xl filter brightness-95"
                />
                {/* Netflix / Film Tag */}
                <div className="absolute bottom-2 right-2 bg-red-600 text-white font-black text-[10px] w-5 h-5 rounded flex items-center justify-center shadow">
                  W
                </div>
              </div>
            </div>

            <div className="space-y-0.5">
              <h3 className="text-xl font-black text-white font-heading">
                Jane Doe
              </h3>
              <span className="text-xs text-gray-400 font-mono block">
                Member since 2023
              </span>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center space-x-2 pt-1">
              <button 
                type="button"
                onClick={handlePersonaClick}
                disabled={isGeneratingPersona}
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/50 text-gray-300 hover:text-white flex items-center justify-center transition cursor-pointer"
                title="Refresh Taste Persona"
              >
                <Sparkles className={`w-4 h-4 ${isGeneratingPersona ? 'animate-spin text-red-400' : ''}`} />
              </button>
              <button 
                type="button"
                onClick={onResetTasteProfile}
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white flex items-center justify-center transition cursor-pointer"
                title="Reset Taste History"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right Column: Archetype, Taste DNA & Tropes */}
          <div className="md:col-span-8 space-y-6">
            
            {/* Header: Archetype badge & title */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold block">
                Archetype badge
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white font-heading tracking-tight">
                {persona?.archetype || defaultArchetype}
              </h2>
              <p className="text-amber-300 text-xs sm:text-sm italic font-sans">
                "{persona?.tagline || defaultTagline}"
              </p>
            </div>

            {/* 5-Dimension Taste DNA Breakdown with Exact Colors */}
            <div className="space-y-3 font-sans">
              <span className="text-[11px] font-mono font-bold text-gray-400 uppercase tracking-wider block">
                5-Dimension Taste DNA
              </span>
              
              <div className="space-y-2.5">
                {[
                  { label: "Mind-Bending", val: persona?.tasteDNA?.mindBending || 90, barGrad: "from-cyan-400 to-blue-500", glow: "rgba(6,182,212,0.6)" },
                  { label: "Pacing", val: persona?.tasteDNA?.pacing || 70, barGrad: "from-emerald-400 to-green-500", glow: "rgba(16,185,129,0.6)" },
                  { label: "Gritty Realism", val: persona?.tasteDNA?.darkRealism || 85, barGrad: "from-amber-400 to-yellow-500", glow: "rgba(245,158,11,0.6)" },
                  { label: "Emotional Depth", val: persona?.tasteDNA?.emotionalDepth || 75, barGrad: "from-orange-400 to-rose-500", glow: "rgba(244,63,94,0.6)" },
                  { label: "Visual Spectacle", val: persona?.tasteDNA?.spectacle || 80, barGrad: "from-red-500 to-rose-600", glow: "rgba(229,9,20,0.6)" },
                ].map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-gray-300">{item.label}</span>
                      <span className="text-gray-200 font-mono font-bold">{item.val}%</span>
                    </div>
                    <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className={`h-full bg-gradient-to-r ${item.barGrad} rounded-full transition-all duration-700`}
                        style={{ width: `${item.val}%`, boxShadow: `0 0 10px ${item.glow}` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Signature Trope Tags */}
            <div className="space-y-2 pt-1">
              <span className="text-[11px] font-mono font-bold text-gray-400 uppercase tracking-wider block">
                Signature Trope Tags
              </span>
              <div className="flex flex-wrap gap-2">
                {(persona?.signatureTropes?.length ? persona.signatureTropes : defaultTropes).map((trope, i) => (
                  <span 
                    key={i} 
                    className="border border-red-500/50 bg-red-950/30 text-gray-200 text-[11px] font-semibold px-3 py-1 rounded-full shadow-sm"
                  >
                    {trope}
                  </span>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* PERSONALIZED SEED MOVIES Carousel Section */}
      <section className="space-y-4 max-w-5xl mx-auto pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-extrabold text-white font-heading uppercase tracking-wider">
            PERSONALIZED SEED MOVIES
          </h2>
          <div className="flex items-center space-x-2">
            <button 
              type="button" 
              onClick={() => setSeedOffset(prev => Math.max(0, prev - 1))}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-white flex items-center justify-center transition border border-white/10 cursor-pointer"
            >
              ‹
            </button>
            <button 
              type="button" 
              onClick={() => setSeedOffset(prev => prev + 1)}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-white flex items-center justify-center transition border border-white/10 cursor-pointer"
            >
              ›
            </button>
          </div>
        </div>

        {/* Carousel Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          {PROFILE_SEEDS.map((seed, idx) => {
            const actualMovie = curatedMovies.find(m => m.title.toLowerCase() === seed.title.toLowerCase());
            const posterSrc = getCleanImageUrl(seedPoster({ title: seed.title, year: seed.year })?.posterUrl || actualMovie?.posterUrl, 'poster');

            return (
              <div 
                key={idx}
                onClick={() => {
                  if (actualMovie) onMovieClick(actualMovie);
                }}
                className="glass-card rounded-2xl p-2 border border-white/10 hover:border-red-500/60 transition duration-300 hover:scale-105 cursor-pointer group shadow-lg"
              >
                <div className="h-44 rounded-xl overflow-hidden bg-black/60 relative mb-2">
                  <img 
                    src={posterSrc} 
                    alt={seed.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition"
                    onError={(e) => handleImageLoadError(e)}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                  <div className="absolute bottom-2 left-2 right-2">
                    <span className="text-[11px] font-black text-white block truncate font-heading group-hover:text-red-400 transition">
                      {seed.title}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono block">
                      ★ {seed.rating} · {seed.year}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Watched & Watchlist Tabs / Library Grid */}
      <div className="max-w-5xl mx-auto space-y-6 pt-6 border-t border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Film className="w-5 h-5 text-red-500" />
            <h2 className="text-xl font-bold text-white font-heading">Your Saved Library</h2>
          </div>

          {/* Filter tabs */}
          <div className="flex bg-white/5 border border-white/10 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition ${statusFilter === 'all' ? 'bg-red-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
            >
              All ({watchlistMovies.length})
            </button>
            <button
              onClick={() => setStatusFilter('unwatched')}
              className={`px-3 py-1.5 rounded-lg transition ${statusFilter === 'unwatched' ? 'bg-red-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
            >
              Unwatched ({unwatchedWatchlistMovies.length})
            </button>
            <button
              onClick={() => setStatusFilter('watched')}
              className={`px-3 py-1.5 rounded-lg transition ${statusFilter === 'watched' ? 'bg-red-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
            >
              Watched ({watchedMovies.length})
            </button>
          </div>
        </div>

        {/* Library Items Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {(statusFilter === 'watched' ? watchedMovies : statusFilter === 'unwatched' ? unwatchedWatchlistMovies : watchlistMovies).map(movie => {
            const isWatched = watchedIds.includes(movie.id);
            return (
              <div 
                key={movie.id}
                className="glass-card p-3 rounded-2xl border border-white/10 flex items-center space-x-3 hover:border-red-500/40 transition group"
              >
                <img 
                  src={getCleanImageUrl(movie.posterUrl, 'poster')} 
                  alt={movie.title}
                  className="w-14 h-20 rounded-xl object-cover flex-shrink-0"
                  onError={(e) => handleImageLoadError(e)}
                />
                <div className="flex-1 min-w-0">
                  <h4 
                    onClick={() => onMovieClick(movie)}
                    className="text-sm font-bold text-white group-hover:text-red-400 cursor-pointer truncate font-heading"
                  >
                    {movie.title}
                  </h4>
                  <span className="text-xs text-gray-400 font-mono block">
                    {movie.year} · ★ {movie.rating}
                  </span>
                  <div className="flex items-center space-x-2 pt-2">
                    {onToggleWatched && (
                      <button
                        onClick={() => onToggleWatched(movie.id)}
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg border flex items-center space-x-1 cursor-pointer ${
                          isWatched ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-white/5 text-gray-400 border-white/10'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{isWatched ? 'Watched' : 'Mark'}</span>
                      </button>
                    )}
                    <button
                      onClick={() => onRemoveFromWatchlist(movie.id)}
                      className="text-gray-400 hover:text-red-400 text-[10px] px-2 py-1 bg-white/5 rounded-lg border border-white/10 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
import React, { useState } from 'react';
import { Search, Sparkles, Flame, Clock, Compass, Film, RefreshCw } from 'lucide-react';
import { curatedMovies } from '../data/curatedMovies';
import { Movie, TasteProfile } from '../types';
import { getCleanImageUrl, handleImageLoadError } from '../utils/imageHelper';

interface HomeViewProps {
  onSearchSubmit: (text: string) => void;
  isLoading: boolean;
  onSelectMovie?: (movie: Movie) => void;
  tasteProfile?: TasteProfile;
}

export default function HomeView({ onSearchSubmit, isLoading, onSelectMovie, tasteProfile }: HomeViewProps) {
  const [query, setQuery] = useState('');
  const [spotlightOffset, setSpotlightOffset] = useState(0);

  const watchedIds = tasteProfile?.watched || [];

  const quickPrompts = [
    {
      title: "Mind-bending & Finished",
      text: "A dark mystery series like Dark, but faster-paced and already finished."
    },
    {
      title: "Quick Hindi Crime Thriller",
      text: "A Hindi crime movie under 2 hours with no romance."
    },
    {
      title: "Intense & Satisfying",
      text: "A survival thriller with a satisfying ending, not too violent."
    },
    {
      title: "Action Mystery Horror",
      text: "Something like From, but with more answers and fewer slow episodes."
    },
    {
      title: "High-Rated Binge",
      text: "A weekend binge under 15 hours with high ratings and no cancellation cliffhanger."
    },
    {
      title: "Family-Safe Cozy Night",
      text: "A movie with a happy ending, under 90 mins to watch with family."
    }
  ];

  const curatedCollections = [
    {
      title: "Mind-Bending Parallel Worlds",
      description: "Complex puzzles, alternate realities, and stories that will keep you up reading theories.",
      prompt: "A mind-bending, high-rated sci-fi series with lots of mystery like Dark or Severance.",
      icon: Compass,
      gradient: "from-indigo-900 to-purple-900",
    },
    {
      title: "Fast-Paced Crime Thrillers",
      description: "Pure adrenaline, smart characters, and intricate plots with zero fluff.",
      prompt: "A fast-paced crime thriller movie under 2 hours, high intensity, no romance.",
      icon: Flame,
      gradient: "from-red-900 to-orange-900",
    },
    {
      title: "High-Stake Survival Dramas",
      description: "When the only goal is staying alive. Unforgiving environments and psychological trials.",
      prompt: "A survival thriller with a satisfying ending like Squid Game or Tumbbad.",
      icon: Sparkles,
      gradient: "from-emerald-900 to-teal-900",
    },
    {
      title: "Perfect Single-Night Binge",
      description: "Limited series under 6 hours. Start after dinner, finish before midnight.",
      prompt: "A limited series under 6 hours with a finished story and very high ratings.",
      icon: Clock,
      gradient: "from-blue-900 to-cyan-900",
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !isLoading) {
      onSearchSubmit(query.trim());
    }
  };

  // Filter out watched movies from spotlight candidates
  const unwatchedCandidates = curatedMovies.filter(m => !watchedIds.includes(m.id));
  const spotlightPool = unwatchedCandidates.length >= 4 ? unwatchedCandidates : curatedMovies;

  const startIndex = (spotlightOffset * 4) % spotlightPool.length;
  const currentSpotlightMovies = spotlightPool
    .slice(startIndex, startIndex + 4)
    .concat(spotlightPool.slice(0, Math.max(0, 4 - (spotlightPool.length - startIndex))))
    .slice(0, 4);

  return (
    <div className="w-full relative z-10 pb-20">
      {/* Widescreen Hero Section */}
      <section className="relative pt-12 sm:pt-16 pb-16 px-4 sm:px-6 lg:px-12 max-w-[1600px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          
          {/* Left 7 Columns: Hero & Search Bar */}
          <div className="lg:col-span-7 space-y-8 text-left">
            <div className="inline-flex items-center space-x-2 bg-red-500/10 border border-red-500/30 px-4 py-1.5 rounded-full text-red-400 font-mono text-xs font-bold uppercase tracking-wider backdrop-blur-md shadow-lg">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Cinephile Scout Engine</span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-none font-heading drop-shadow-lg">
              <span className="text-white block">Stop endless scrolling.</span>
              <span className="block bg-gradient-to-r from-red-500 via-rose-500 to-amber-500 bg-clip-text text-transparent mt-3">
                Describe exact mood & vibe.
              </span>
            </h1>

            <p className="text-base sm:text-lg text-gray-300 max-w-2xl font-sans leading-relaxed">
              Tell WatchMatch what you want to feel, avoid, and finish—and get a trusted, hyper-accurate shortlist of movies and series tailored for you.
            </p>

            {/* Search Input Area */}
            <div className="mt-8 max-w-3xl">
              <form 
                onSubmit={handleSubmit} 
                id="discovery-form" 
                className="relative flex items-center w-full glass-input rounded-2xl overflow-hidden border border-white/15 shadow-[0_0_60px_-10px_rgba(229,9,20,0.3)] focus-within:border-red-500/60 focus-within:shadow-[0_0_70px_0_rgba(229,9,20,0.5)] transition-all duration-300 p-2"
              >
                <div className="pl-4 pr-2 text-red-500 flex items-center justify-center">
                  <Search className="w-6 h-6" />
                </div>
                <input
                  id="scout-search-input"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={isLoading}
                  placeholder="e.g., A dark mystery series like Dark, or a painful romantic drama"
                  className="w-full bg-transparent border-none text-white focus:ring-0 placeholder-gray-500 text-base sm:text-lg py-4 px-2 font-medium focus:outline-none"
                />
                <button
                  id="scout-submit-btn"
                  type="submit"
                  disabled={isLoading || !query.trim()}
                  className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-extrabold px-8 py-4 rounded-xl flex items-center gap-2 transition-all duration-200 text-base shadow-[0_0_25px_-5px_rgba(229,9,20,0.6)] disabled:opacity-50 disabled:cursor-not-allowed shrink-0 cursor-pointer"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      <span>Scout</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Right 5 Columns: Visual Unwatched Movie Poster Graphic Cards */}
          <div className="lg:col-span-5 relative hidden lg:block">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-gray-400 flex items-center space-x-1.5">
                <Compass className="w-3.5 h-3.5 text-red-500" />
                <span>Tailored Unwatched Spotlight</span>
              </span>
              <button
                type="button"
                onClick={() => setSpotlightOffset(prev => prev + 1)}
                className="flex items-center space-x-1.5 text-xs text-red-400 hover:text-white glass-card border border-white/15 px-3 py-1 rounded-xl font-mono font-bold transition cursor-pointer shadow"
                title="Refresh unwatched spotlight recommendations"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Refresh</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 relative z-10">
              {currentSpotlightMovies.map((movie, idx) => (
                <div 
                  key={`${movie.id}_${idx}`} 
                  onClick={() => {
                    if (onSelectMovie) onSelectMovie(movie);
                    else onSearchSubmit(movie.title);
                  }}
                  className={`glass-card rounded-3xl overflow-hidden border border-white/15 shadow-2xl relative group transform transition duration-500 hover:scale-105 cursor-pointer ${idx % 2 === 1 ? 'translate-y-4' : ''}`}
                >
                  <div className="h-64 overflow-hidden relative bg-black/60">
                    <img 
                      src={getCleanImageUrl(movie.posterUrl, 'poster')} 
                      alt={movie.title} 
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-110 transition duration-700 filter brightness-95"
                      onError={(e) => handleImageLoadError(e, movie.backdropUrl)}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#070709] via-black/20 to-transparent"></div>
                    <div className="absolute top-3 left-3">
                      <span className="bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] font-mono font-bold px-2.5 py-1 rounded-full uppercase tracking-wider backdrop-blur-md shadow">
                        {movie.genres[0] || 'Spotlight'}
                      </span>
                    </div>
                    <div className="absolute bottom-3 left-3 right-3">
                      <h4 className="text-white font-extrabold text-base font-heading drop-shadow group-hover:text-red-400 transition truncate">{movie.title}</h4>
                      <span className="text-gray-400 text-xs font-mono">{movie.year} · ★ {movie.rating}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Ambient Background Glow */}
            <div className="absolute -top-10 -right-10 w-96 h-96 bg-red-600/15 rounded-full blur-3xl pointer-events-none"></div>
          </div>

        </div>
      </section>



      {/* Mood Description Section */}
      <section className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-12 py-10 space-y-6">
        <h3 className="text-xl font-extrabold text-white font-heading flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-red-500"></span>
          <span>Try describing your mood</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {quickPrompts.map((prompt, i) => (
            <button
              id={`quick-prompt-${i}`}
              key={i}
              onClick={() => {
                setQuery(prompt.text);
                onSearchSubmit(prompt.text);
              }}
              disabled={isLoading}
              className="text-left glass-card p-6 rounded-2xl hover:-translate-y-1 transition duration-300 group border border-white/10 hover:border-red-500/40 shadow-xl flex flex-col justify-between h-full cursor-pointer"
            >
              <div>
                <span className="text-base font-extrabold text-white group-hover:text-red-400 transition-colors block mb-2 font-heading">
                  {prompt.title}
                </span>
                <p className="text-xs sm:text-sm text-gray-300 leading-relaxed group-hover:text-gray-100 transition-colors font-sans">
                  "{prompt.text}"
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Trending Curated Directions Section */}
      <section className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-12 py-10 space-y-6">
        <div>
          <h2 className="text-2xl font-extrabold text-white mb-2 font-heading flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span>Trending Curated Directions</span>
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {curatedCollections.map((col, i) => {
            const Icon = col.icon;
            return (
              <div
                id={`curated-col-${i}`}
                key={i}
                onClick={() => {
                  setQuery(col.prompt);
                  onSearchSubmit(col.prompt);
                }}
                className={`w-full min-h-[260px] relative rounded-3xl overflow-hidden group glass-card transition duration-300 hover:scale-[1.03] cursor-pointer shadow-2xl border border-white/10 hover:border-red-500/40`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${col.gradient} opacity-40 group-hover:opacity-60 transition duration-300`}></div>
                <div className="absolute inset-0 p-6 flex flex-col justify-end">
                  <div className="w-12 h-12 mb-4 text-white flex items-center justify-center p-2.5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 shadow-md">
                    <Icon className="w-6 h-6 text-red-400" />
                  </div>
                  <h4 className="text-lg font-extrabold text-white mb-2 leading-tight font-heading">
                    {col.title}
                  </h4>
                  <p className="text-xs text-gray-300 line-clamp-3 font-sans leading-relaxed">
                    {col.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}


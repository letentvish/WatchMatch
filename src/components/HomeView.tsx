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

  const hashtagPills = [
    { label: "#Noir Mystery", prompt: "A dark noir mystery series with high suspense and intricate clues." },
    { label: "#Emotional Drama", prompt: "A deeply emotional character drama that leaves a lasting impact." },
    { label: "#Cerebral", prompt: "A mind-bending cerebral thriller like Inception or Dark." },
    { label: "#Gritty Thriller", prompt: "A fast-paced gritty crime thriller with zero fluff and high stakes." },
    { label: "#Bittersweet Romance", prompt: "A bittersweet realistic romance drama like Past Lives." },
  ];

  const curatedCollections = [
    {
      title: "Atmospheric Thrillers",
      countText: "4 movie thumbs",
      prompt: "An atmospheric psychological mystery or thriller with tension and high ratings.",
      icon: Compass,
      movieTitles: ["Dark", "Severance", "Chernobyl", "Shutter Island"],
      gradient: "from-indigo-950 to-neutral-900",
    },
    {
      title: "Heart-wrenching Dramas",
      countText: "4 movie thumbs",
      prompt: "A deeply moving and bittersweet emotional drama with phenomenal performances.",
      icon: Flame,
      movieTitles: ["Past Lives", "Manchester by the Sea", "Aftersun", "The Whale"],
      gradient: "from-rose-950 to-neutral-900",
    },
    {
      title: "Hidden Gems",
      countText: "4 movie thumbs",
      prompt: "Under-the-radar masterpieces and mind-bending hidden gems with high critical acclaim.",
      icon: Sparkles,
      movieTitles: ["Tumbbad", "Silo", "Mr. Robot", "Coherence"],
      gradient: "from-blue-950 to-neutral-900",
    },
    {
      title: "Critically Acclaimed Noir",
      countText: "4 movie thumbs",
      prompt: "A critically acclaimed crime noir or neo-noir mystery with dark aesthetics.",
      icon: Film,
      movieTitles: ["Drive", "Memories of Murder", "Prisoners", "Chinatown"],
      gradient: "from-neutral-950 to-stone-900",
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !isLoading) {
      onSearchSubmit(query.trim());
    }
  };

  // Helper to find movie image by title or curated match
  const getThumbnailByTitle = (title: string): string => {
    const found = curatedMovies.find(m => m.title.toLowerCase().includes(title.toLowerCase()));
    if (found?.posterUrl) return getCleanImageUrl(found.posterUrl, 'poster');
    return 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=300&q=80';
  };

  // Sample featured cards for floating hero sides
  const leftFeature = curatedMovies.find(m => m.title.toLowerCase().includes('bear')) || curatedMovies[0];
  const leftFeature2 = curatedMovies.find(m => m.title.toLowerCase().includes('dark')) || curatedMovies[1];
  const rightFeature = curatedMovies.find(m => m.title.toLowerCase().includes('drive') || m.title.toLowerCase().includes('severance')) || curatedMovies[2];
  const rightFeature2 = curatedMovies.find(m => m.title.toLowerCase().includes('succession') || m.title.toLowerCase().includes('shutter')) || curatedMovies[3];

  return (
    <div className="w-full relative z-10 pb-20 overflow-hidden">
      {/* Top Ambient Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[350px] bg-red-600/15 rounded-full blur-[140px] pointer-events-none -z-10"></div>

      {/* Hero Section */}
      <section className="relative pt-8 sm:pt-14 pb-12 px-4 sm:px-6 lg:px-12 max-w-[1550px] mx-auto">
        <div className="relative">
          
          {/* FLOATING CARD: Left 1 */}
          {leftFeature2 && (
            <div 
              onClick={() => onSelectMovie ? onSelectMovie(leftFeature2) : onSearchSubmit(leftFeature2.title)}
              className="hidden 2xl:block absolute -left-8 top-6 w-44 rounded-2xl overflow-hidden glass-card border border-white/15 p-2 shadow-2xl -rotate-6 hover:rotate-0 hover:scale-105 transition-all duration-300 cursor-pointer z-10 group"
            >
              <div className="relative h-60 rounded-xl overflow-hidden bg-black/60">
                <img 
                  src={getCleanImageUrl(leftFeature2.posterUrl, 'poster')} 
                  alt={leftFeature2.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition"
                  onError={(e) => handleImageLoadError(e)}
                />
                <span className="absolute top-2 right-2 bg-black/70 text-gray-200 border border-white/20 text-[10px] font-mono px-2 py-0.5 rounded font-bold">
                  S1
                </span>
              </div>
              <div className="pt-2 px-1">
                <h4 className="text-white text-xs font-bold truncate group-hover:text-red-400 font-heading">{leftFeature2.title}</h4>
                <span className="text-[10px] text-gray-400 font-mono">★ {leftFeature2.rating} · {leftFeature2.year}</span>
              </div>
            </div>
          )}

          {/* FLOATING CARD: Left 2 */}
          {leftFeature && (
            <div 
              onClick={() => onSelectMovie ? onSelectMovie(leftFeature) : onSearchSubmit(leftFeature.title)}
              className="hidden xl:block absolute left-10 lg:left-14 top-28 w-44 rounded-2xl overflow-hidden glass-card border border-white/15 p-2 shadow-2xl -rotate-3 hover:rotate-0 hover:scale-105 transition-all duration-300 cursor-pointer z-10 group"
            >
              <div className="relative h-56 rounded-xl overflow-hidden bg-black/60">
                <img 
                  src={getCleanImageUrl(leftFeature.posterUrl, 'poster')} 
                  alt={leftFeature.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition"
                  onError={(e) => handleImageLoadError(e)}
                />
                <span className="absolute top-2 right-2 bg-black/70 text-gray-200 border border-white/20 text-[10px] font-mono px-2 py-0.5 rounded font-bold">
                  {leftFeature.contentType === 'movie' ? 'Movie' : 'S1'}
                </span>
              </div>
              <div className="pt-2 px-1">
                <h4 className="text-white text-xs font-bold truncate group-hover:text-red-400 font-heading">{leftFeature.title}</h4>
                <span className="text-[10px] text-gray-400 font-mono">★ {leftFeature.rating} · {leftFeature.year}</span>
              </div>
            </div>
          )}

          {/* FLOATING CARD: Right 1 */}
          {rightFeature && (
            <div 
              onClick={() => onSelectMovie ? onSelectMovie(rightFeature) : onSearchSubmit(rightFeature.title)}
              className="hidden xl:block absolute right-10 lg:right-14 top-28 w-44 rounded-2xl overflow-hidden glass-card border border-white/15 p-2 shadow-2xl rotate-3 hover:rotate-0 hover:scale-105 transition-all duration-300 cursor-pointer z-10 group"
            >
              <div className="relative h-56 rounded-xl overflow-hidden bg-black/60">
                <img 
                  src={getCleanImageUrl(rightFeature.posterUrl, 'poster')} 
                  alt={rightFeature.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition"
                  onError={(e) => handleImageLoadError(e)}
                />
                <span className="absolute top-2 right-2 bg-black/70 text-gray-200 border border-white/20 text-[10px] font-mono px-2 py-0.5 rounded font-bold">
                  {rightFeature.contentType === 'movie' ? 'Movie' : 'S1'}
                </span>
              </div>
              <div className="pt-2 px-1">
                <h4 className="text-white text-xs font-bold truncate group-hover:text-red-400 font-heading">{rightFeature.title}</h4>
                <span className="text-[10px] text-gray-400 font-mono">★ {rightFeature.rating} · {rightFeature.year}</span>
              </div>
            </div>
          )}

          {/* FLOATING CARD: Right 2 */}
          {rightFeature2 && (
            <div 
              onClick={() => onSelectMovie ? onSelectMovie(rightFeature2) : onSearchSubmit(rightFeature2.title)}
              className="hidden 2xl:block absolute -right-8 top-6 w-44 rounded-2xl overflow-hidden glass-card border border-white/15 p-2 shadow-2xl rotate-6 hover:rotate-0 hover:scale-105 transition-all duration-300 cursor-pointer z-10 group"
            >
              <div className="relative h-60 rounded-xl overflow-hidden bg-black/60">
                <img 
                  src={getCleanImageUrl(rightFeature2.posterUrl, 'poster')} 
                  alt={rightFeature2.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition"
                  onError={(e) => handleImageLoadError(e)}
                />
                <span className="absolute top-2 right-2 bg-black/70 text-gray-200 border border-white/20 text-[10px] font-mono px-2 py-0.5 rounded font-bold">
                  S4
                </span>
              </div>
              <div className="pt-2 px-1">
                <h4 className="text-white text-xs font-bold truncate group-hover:text-red-400 font-heading">{rightFeature2.title}</h4>
                <span className="text-[10px] text-gray-400 font-mono">★ {rightFeature2.rating} · {rightFeature2.year}</span>
              </div>
            </div>
          )}

          {/* Center Main Hero Column */}
          <div className="max-w-3xl mx-auto text-center space-y-6 pt-4 relative z-20">
            {/* Main Headline */}
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight leading-tight font-heading uppercase text-white drop-shadow-2xl">
              <span className="block">STOP ENDLESS SCROLLING.</span>
              <span className="block mt-1">DESCRIBE EXACT MOOD &amp; VIBE.</span>
            </h1>

            {/* Glowing Search Box Container */}
            <div className="mt-8 max-w-2xl mx-auto">
              <form 
                onSubmit={handleSubmit} 
                id="discovery-form" 
                className="relative flex items-center w-full bg-[#0d0d12]/90 backdrop-blur-2xl rounded-full overflow-hidden border border-red-500/50 shadow-[0_0_50px_-5px_rgba(229,9,20,0.45)] focus-within:border-red-500 focus-within:shadow-[0_0_65px_0_rgba(229,9,20,0.65)] transition-all duration-300 p-1.5 pl-5"
              >
                <div className="text-red-500 flex items-center justify-center mr-2">
                  <Search className="w-5 h-5" />
                </div>
                <input
                  id="scout-search-input"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={isLoading}
                  placeholder="A dark mystery series like Dark, or a painful romantic drama"
                  className="w-full bg-transparent border-none text-white focus:ring-0 placeholder-gray-400 text-xs sm:text-sm md:text-base py-3 px-1 font-medium focus:outline-none"
                />
                <button
                  id="scout-submit-btn"
                  type="submit"
                  disabled={isLoading || !query.trim()}
                  className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-extrabold px-6 sm:px-8 py-3 rounded-full flex items-center gap-2 transition-all duration-200 text-xs sm:text-sm shadow-[0_0_20px_rgba(229,9,20,0.6)] disabled:opacity-50 disabled:cursor-not-allowed shrink-0 cursor-pointer"
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Scout</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Hashtag Vibe Chips directly below search */}
            <div className="flex flex-wrap justify-center gap-2.5 pt-2 max-w-2xl mx-auto">
              {hashtagPills.map((pill, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setQuery(pill.prompt);
                    onSearchSubmit(pill.prompt);
                  }}
                  className="bg-black/60 hover:bg-red-950/50 border border-red-500/30 hover:border-red-500/70 text-gray-300 hover:text-white px-4 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition duration-200 shadow-sm backdrop-blur-md"
                >
                  {pill.label}
                </button>
              ))}
            </div>

          </div>
        </div>
      </section>

      {/* Curated Trending Collections Section */}
      <section className="max-w-[1550px] mx-auto px-4 sm:px-6 lg:px-12 pt-8 pb-4 space-y-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white font-heading tracking-tight">
            Curated Trending Collections
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {curatedCollections.map((col, i) => {
            return (
              <div
                id={`curated-col-${i}`}
                key={i}
                onClick={() => {
                  setQuery(col.prompt);
                  onSearchSubmit(col.prompt);
                }}
                className={`glass-card p-4 rounded-3xl border border-white/10 hover:border-red-500/50 transition-all duration-300 hover:scale-[1.02] cursor-pointer shadow-xl relative overflow-hidden group`}
              >
                {/* 4-Poster Thumbnail Preview Row */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {col.movieTitles.map((t, idx) => (
                    <div key={idx} className="h-28 rounded-xl overflow-hidden bg-black/60 border border-white/10 relative group-hover:border-white/20 transition">
                      <img 
                        src={getThumbnailByTitle(t)} 
                        alt={t} 
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        onError={(e) => handleImageLoadError(e)}
                      />
                    </div>
                  ))}
                </div>

                {/* Collection Meta */}
                <div className="space-y-1">
                  <h4 className="text-base font-extrabold text-white font-heading group-hover:text-red-400 transition truncate">
                    {col.title}
                  </h4>
                  <span className="text-xs text-gray-400 font-mono block">
                    {col.countText}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}


import React, { useState } from 'react';
import { Search, Sparkles, Flame, Clock, Compass } from 'lucide-react';

interface HomeViewProps {
  onSearchSubmit: (text: string) => void;
  isLoading: boolean;
}

export default function HomeView({ onSearchSubmit, isLoading }: HomeViewProps) {
  const [query, setQuery] = useState('');

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

  return (
    <div className="w-full relative z-10 pb-20">
      {/* Hero Section */}
      <section className="relative pt-20 sm:pt-24 pb-16 px-4 sm:px-6 lg:px-8 text-center bg-[url('https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center bg-no-repeat before:absolute before:inset-0 before:bg-wm-bg/80 before:hero-bg before:z-[-1]">
        <div className="max-w-5xl mx-auto space-y-8 relative z-10">
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight leading-tight">
            <span className="text-white block">Stop scrolling.</span>
            <span className="block text-wm-accent mt-2">
              Describe what you feel.
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-300 max-w-3xl mx-auto font-medium leading-relaxed">
            Tell WatchMatch what you want to feel, avoid, and finish—and get<br className="hidden sm:block"/> a trusted shortlist of movies and series that fit.
          </p>

          {/* Search Input Area */}
          <div className="mt-12 max-w-3xl mx-auto">
            <form 
              onSubmit={handleSubmit} 
              id="discovery-form" 
              className="relative flex items-center w-full bg-wm-card rounded-lg overflow-hidden border border-gray-700/50 shadow-2xl focus-within:border-wm-accent transition-colors"
            >
              <div className="pl-5 pr-3 text-gray-400 flex items-center justify-center">
                <Search className="w-6 h-6" />
              </div>
              <input
                id="scout-search-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={isLoading}
                placeholder="e.g., A dark mystery series like Dark, but faster and already finished"
                className="w-full bg-transparent border-none text-white focus:ring-0 placeholder-gray-500 text-lg py-5 font-medium focus:outline-none"
              />
              <button
                id="scout-submit-btn"
                type="submit"
                disabled={isLoading || !query.trim()}
                className="bg-wm-accent hover:bg-red-700 text-white font-bold px-8 py-5 flex items-center gap-2 transition-colors text-lg h-full disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
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
      </section>

      {/* Mood Description Section */}
      <section className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
        <h3 className="text-xl font-bold text-white">Try describing your mood</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickPrompts.map((prompt, i) => (
            <button
              id={`quick-prompt-${i}`}
              key={i}
              onClick={() => {
                setQuery(prompt.text);
                onSearchSubmit(prompt.text);
              }}
              disabled={isLoading}
              className="text-left bg-wm-card p-6 rounded-md hover:bg-wm-card-hover hover:scale-[1.02] transition-all duration-200 group border border-transparent hover:border-gray-600 shadow-md flex flex-col justify-between h-full"
            >
              <div>
                <span className="text-lg font-bold text-white group-hover:text-wm-accent transition-colors block mb-2">
                  {prompt.title}
                </span>
                <p className="text-sm text-gray-400 leading-relaxed group-hover:text-gray-300 transition-colors">
                  "{prompt.text}"
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Trending Curated Directions Section */}
      <section className="max-w-[1400px] mx-auto py-12 space-y-6">
        <div className="px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-white mb-2">Trending Curated Directions</h2>
        </div>
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                  className={`w-full min-h-[280px] relative rounded-md overflow-hidden group bg-gradient-to-br ${col.gradient} transition-transform duration-300 hover:scale-105 cursor-pointer shadow-lg`}
                >
                  <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors"></div>
                  <div className="absolute inset-0 p-6 flex flex-col justify-end">
                    <div className="w-10 h-10 mb-4 text-white flex items-center justify-center">
                      <Icon className="w-8 h-8" />
                    </div>
                    <h4 className="text-xl font-bold text-white mb-2 leading-tight">
                      {col.title}
                    </h4>
                    <p className="text-sm text-gray-300 line-clamp-3">
                      {col.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}


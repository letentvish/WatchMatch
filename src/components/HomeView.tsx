import React, { useState } from 'react';
import { Search, Sparkles, Flame, Clock, Compass, HelpCircle } from 'lucide-react';

interface HomeViewProps {
  onSearchSubmit: (text: string) => void;
  isLoading: boolean;
}

export default function HomeView({ onSearchSubmit, isLoading }: HomeViewProps) {
  const [query, setQuery] = useState('');

  const quickPrompts = [
    { text: 'A dark mystery series like Dark, but faster-paced and already finished.', label: 'Mind-bending & Finished' },
    { text: 'A Hindi crime movie under 2 hours with no romance.', label: 'Quick Hindi Crime Thriller' },
    { text: 'A survival thriller with a satisfying ending, not too violent.', label: 'Intense & Satisfying' },
    { text: 'Something like From, but with more answers and fewer slow episodes.', label: 'Action Mystery Horror' },
    { text: 'A weekend binge under 15 hours with high ratings and no cancellation cliffhanger.', label: 'High-Rated Binge' },
    { text: 'A movie with a happy ending, under 90 mins to watch with family.', label: 'Family-Safe Cozy Night' },
  ];

  const curatedCollections = [
    {
      title: "Mind-Bending Parallel Worlds",
      description: "Complex puzzles, alternate realities, and stories that will keep you up reading theories.",
      prompt: "A mind-bending, high-rated sci-fi series with lots of mystery like Dark or Severance.",
      icon: Compass,
      color: "from-purple-500 to-indigo-500",
    },
    {
      title: "Fast-Paced Crime Thrillers",
      description: "Pure adrenaline, smart characters, and intricate plots with zero fluff.",
      prompt: "A fast-paced crime thriller movie under 2 hours, high intensity, no romance.",
      icon: Flame,
      color: "from-rose-500 to-orange-500",
    },
    {
      title: "High-Stake Survival Dramas",
      description: "When the only goal is staying alive. Unforgiving environments and psychological trials.",
      prompt: "A survival thriller with a satisfying ending like Squid Game or Tumbbad.",
      icon: Sparkles,
      color: "from-amber-500 to-yellow-500",
    },
    {
      title: "Perfect Single-Night Binge",
      description: "Limited series under 6 hours. Start after dinner, finish before midnight.",
      prompt: "A limited series under 6 hours with a finished story and very high ratings.",
      icon: Clock,
      color: "from-emerald-500 to-teal-500",
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !isLoading) {
      onSearchSubmit(query.trim());
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-12">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <h1 className="font-sans font-extrabold tracking-tight text-4xl md:text-5xl lg:text-6xl text-white">
          Stop scrolling.<br />
          <span className="bg-gradient-to-r from-amber-400 via-rose-400 to-purple-500 bg-clip-text text-transparent">
            Describe what you feel.
          </span>
        </h1>
        <p className="text-slate-400 text-lg max-w-xl mx-auto font-medium">
          Tell WatchMatch what you want to feel, avoid, and finish—and get a trusted shortlist of movies and series that fit.
        </p>
      </div>

      {/* Main Search Input */}
      <form onSubmit={handleSubmit} className="relative group max-w-3xl mx-auto" id="discovery-form">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 rounded-2xl blur opacity-30 group-hover:opacity-60 transition duration-1000"></div>
        <div className="relative flex items-center bg-slate-900 border border-slate-800 rounded-2xl p-2 shadow-2xl">
          <Search className="w-6 h-6 text-slate-400 ml-4 flex-shrink-0" />
          <input
            id="scout-search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isLoading}
            placeholder="e.g., A dark mystery series like Dark, but faster and already finished..."
            className="w-full bg-transparent text-white px-4 py-3 focus:outline-none placeholder-slate-500 text-base md:text-lg"
          />
          <button
            id="scout-submit-btn"
            type="submit"
            disabled={isLoading || !query.trim()}
            className="bg-gradient-to-r from-amber-500 to-rose-500 text-white font-semibold text-sm px-6 py-3 rounded-xl hover:from-amber-600 hover:to-rose-600 focus:outline-none transition shadow-lg shadow-rose-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Scout</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Quick Prompts */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold font-mono tracking-wider text-slate-500 uppercase">
          Try describing your mood
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {quickPrompts.map((prompt, i) => (
            <button
              id={`quick-prompt-${i}`}
              key={i}
              onClick={() => {
                setQuery(prompt.text);
                onSearchSubmit(prompt.text);
              }}
              disabled={isLoading}
              className="text-left bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/80 hover:border-slate-700 p-4 rounded-xl transition duration-200 group text-sm font-medium"
            >
              <div className="text-rose-400 font-mono text-xs mb-1 font-semibold flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{prompt.label}</span>
              </div>
              <p className="text-slate-300 group-hover:text-white line-clamp-2 leading-relaxed">
                "{prompt.text}"
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Curated Collections */}
      <div className="space-y-6 pt-4">
        <div className="flex items-center space-x-2">
          <HelpCircle className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-sans font-bold text-white tracking-tight">
            Trending Curated Directions
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                className="relative overflow-hidden bg-slate-900 hover:bg-slate-800/70 border border-slate-800 hover:border-slate-700 p-6 rounded-2xl cursor-pointer transition-all duration-300 group flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${col.color} flex items-center justify-center text-white mb-4 shadow-md`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <h4 className="text-white font-sans font-bold text-base group-hover:text-amber-400 transition">
                    {col.title}
                  </h4>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    {col.description}
                  </p>
                </div>
                <div className="mt-4 pt-2 text-rose-400 text-xs font-semibold font-mono flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition duration-300">
                  <span>Explore this vibe</span>
                  <span>&rarr;</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

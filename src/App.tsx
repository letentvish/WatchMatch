import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import HomeView from './components/HomeView';
import FilterBuilder from './components/FilterBuilder';
import ResultsView from './components/ResultsView';
import MovieDetailModal from './components/MovieDetailModal';
import ProfileView from './components/ProfileView';
import { SearchFilters, RecommendationResponse, TasteProfile, Movie } from './types';
import { Sparkles, ArrowLeft, RefreshCw, Bookmark, Heart, Sliders } from 'lucide-react';
import { curatedMovies } from './data/curatedMovies';
import { getCleanImageUrl, handleImageLoadError } from './utils/imageHelper';

export default function App() {
  const [currentView, setCurrentView] = useState<'discover' | 'filters' | 'profile' | 'watchlist'>('discover');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeFilters, setActiveFilters] = useState<SearchFilters | null>(null);
  const [activeRecommendations, setActiveRecommendations] = useState<RecommendationResponse | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize Taste Profile from LocalStorage
  const [tasteProfile, setTasteProfile] = useState<TasteProfile>(() => {
    const saved = localStorage.getItem('watchmatch_taste_profile');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse local taste profile', e);
      }
    }
    return {
      watchlist: [],
      liked: [],
      disliked: [],
      notInterested: [],
      history: [],
      ratings: {},
      dislikedTraits: [],
      preferredTraits: [],
    };
  });

  // Sync taste profile changes to local storage
  useEffect(() => {
    localStorage.setItem('watchmatch_taste_profile', JSON.stringify(tasteProfile));
  }, [tasteProfile]);

  // Conversational Search submitting handler
  const handleSearchSubmit = async (queryText: string) => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_message: queryText,
          existing_preferences: activeFilters || {},
        }),
      });

      if (!response.ok) {
        throw new Error('Our movie scout server failed to respond. Please try again.');
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Save structured filters
      if (data.filters) {
        setActiveFilters(data.filters);
      }

      // Check if clarifying question was asked
      if (data.filters?.clarifying_question) {
        setErrorMsg(`Scout Question: ${data.filters.clarifying_question}`);
        setActiveRecommendations(null);
      } else if (data.recommendations) {
        setActiveRecommendations(data.recommendations);
        setCurrentView('discover'); // Ensure we view the matches
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to analyze request. Check connection.');
    } finally {
      setIsLoading(false);
    }
  };

  // Structured Filter panel applying handler
  const handleApplyFilters = async (filters: SearchFilters) => {
    setIsLoading(true);
    setErrorMsg(null);
    setActiveFilters(filters);

    try {
      const response = await fetch('/api/rank-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_filters: filters,
          candidate_titles: [], // Serves curated local options by default
        }),
      });

      if (!response.ok) {
        throw new Error('Scout ranking system failed. Please adjust filters.');
      }

      const data = await response.json();
      setActiveRecommendations(data);
      setCurrentView('discover'); // Swivel back to results view on Discover tab
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to fetch recommendations with filters.');
    } finally {
      setIsLoading(false);
    }
  };

  // Add/Remove Movie to Watchlist
  const handleToggleWatchlist = (movie: Movie) => {
    setTasteProfile(prev => {
      const exists = prev.watchlist.includes(movie.id);
      const updated = exists
        ? prev.watchlist.filter(id => id !== movie.id)
        : [...prev.watchlist, movie.id];
      return { ...prev, watchlist: updated };
    });
  };

  // Add Movie to Liked list
  const handleAddToLikes = (movie: Movie) => {
    setTasteProfile(prev => {
      const alreadyLiked = prev.liked.includes(movie.id);
      if (alreadyLiked) return prev;
      return {
        ...prev,
        liked: [...prev.liked, movie.id],
        disliked: prev.disliked.filter(id => id !== movie.id), // remove from dislikes if liked
      };
    });
  };

  // Dismiss movie (not interested / disliked)
  const handleNotInterested = (movieId: string) => {
    setTasteProfile(prev => {
      const alreadyDisliked = prev.disliked.includes(movieId);
      if (alreadyDisliked) return prev;
      return {
        ...prev,
        disliked: [...prev.disliked, movieId],
        liked: prev.liked.filter(id => id !== movieId), // remove from likes
        watchlist: prev.watchlist.filter(id => id !== movieId), // remove from watchlist
      };
    });

    // Remove from active recommendations list in real time
    if (activeRecommendations) {
      setActiveRecommendations(prev => {
        if (!prev) return null;
        return {
          ...prev,
          recommendations: prev.recommendations.filter(r => r.title_id !== movieId),
          best_match: prev.best_match.title_id === movieId 
            ? prev.recommendations[0] || prev.best_match 
            : prev.best_match,
        };
      });
    }
  };

  // Conversational Refinement helper (called from result card buttons)
  const handleRefine = (refinementText: string) => {
    handleSearchSubmit(refinementText);
  };

  // Reset entire Taste Profile state
  const handleResetTasteProfile = () => {
    if (window.confirm('Clear all your saved watchlist, likes, and customized taste profile?')) {
      setTasteProfile({
        watchlist: [],
        liked: [],
        disliked: [],
        notInterested: [],
        history: [],
        ratings: {},
        dislikedTraits: [],
        preferredTraits: [],
      });
      setActiveFilters(null);
      setActiveRecommendations(null);
    }
  };

  // Handle manual removal inside Profile page
  const handleRemoveFromWatchlist = (id: string) => {
    setTasteProfile(prev => ({ ...prev, watchlist: prev.watchlist.filter(x => x !== id) }));
  };

  const handleRemoveFromLikes = (id: string) => {
    setTasteProfile(prev => ({ ...prev, liked: prev.liked.filter(x => x !== id) }));
  };

  const handleRemoveFromDislikes = (id: string) => {
    setTasteProfile(prev => ({ ...prev, disliked: prev.disliked.filter(x => x !== id) }));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Navigation */}
      <Navbar 
        currentView={currentView} 
        onViewChange={(view) => {
          setCurrentView(view);
          setErrorMsg(null); // clear prompts questions
        }} 
        watchlistCount={tasteProfile.watchlist.length}
      />

      {/* Main Content Stage */}
      <main className="flex-1 pb-16">
        {/* Error / Conversational Prompt Banner */}
        {errorMsg && (
          <div className="max-w-4xl mx-auto px-4 mt-6">
            <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 p-5 rounded-2xl flex items-start space-x-3 text-amber-300">
              <Sparkles className="w-5 h-5 flex-shrink-0 mt-0.5 animate-pulse" />
              <div className="space-y-2 flex-1">
                <span className="font-mono text-xs font-bold uppercase tracking-wider block text-amber-400">Scout Reflection Required</span>
                <p className="text-sm leading-relaxed">{errorMsg}</p>
                <div className="flex space-x-2 pt-1">
                  <button
                    onClick={() => setErrorMsg(null)}
                    className="text-xs font-bold text-slate-300 hover:text-white bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700/60"
                  >
                    Close Banner
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dynamic View Swapper */}
        {currentView === 'discover' && (
          <>
            {activeRecommendations ? (
              <div className="space-y-4">
                {/* Results Top bar to search again */}
                <div className="max-w-5xl mx-auto px-4 pt-6 flex items-center justify-between">
                  <button
                    id="btn-back-scout"
                    onClick={() => {
                      setActiveRecommendations(null);
                      setActiveFilters(null);
                    }}
                    className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl transition font-medium"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Search</span>
                  </button>
                  <span className="text-xs text-slate-500 font-mono">
                    Structured query successfully executed
                  </span>
                </div>

                <ResultsView 
                  recommendations={activeRecommendations}
                  onMovieClick={(movie) => setSelectedMovie(movie)}
                  onAddToWatchlist={(movie) => {
                    handleToggleWatchlist(movie);
                    handleAddToLikes(movie); // implicitly like if added to watchlist
                  }}
                  onNotInterested={handleNotInterested}
                  watchlistIds={tasteProfile.watchlist}
                  onRefine={handleRefine}
                />
              </div>
            ) : (
              <HomeView 
                onSearchSubmit={handleSearchSubmit} 
                isLoading={isLoading} 
              />
            )}
          </>
        )}

        {currentView === 'filters' && (
          <FilterBuilder 
            initialFilters={activeFilters || undefined}
            onApplyFilters={handleApplyFilters}
            isLoading={isLoading}
          />
        )}

        {currentView === 'profile' && (
          <ProfileView 
            tasteProfile={tasteProfile}
            onRemoveFromWatchlist={handleRemoveFromWatchlist}
            onRemoveFromLikes={handleRemoveFromLikes}
            onRemoveFromDislikes={handleRemoveFromDislikes}
            onResetTasteProfile={handleResetTasteProfile}
            onMovieClick={(movie) => setSelectedMovie(movie)}
          />
        )}

        {currentView === 'watchlist' && (
          <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
              <Bookmark className="w-6 h-6 text-emerald-400" />
              <h2 className="text-2xl font-sans font-bold text-white tracking-tight">Your Watchlist</h2>
            </div>
            
            {tasteProfile.watchlist.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {tasteProfile.watchlist.map(id => {
                  const movie = curatedMovies.find(m => m.id === id);
                  if (!movie) return null;
                  return (
                    <div 
                      key={movie.id}
                      className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-md flex transition duration-300 hover:border-slate-700"
                    >
                      <img 
                        src={getCleanImageUrl(movie.posterUrl, 'poster')} 
                        alt={movie.title}
                        referrerPolicy="no-referrer"
                        className="w-24 h-32 object-cover border-r border-slate-800"
                        onError={(e) => handleImageLoadError(e, movie.backdropUrl)}
                      />
                      <div className="p-4 flex-1 flex flex-col justify-between">
                        <div>
                          <h4 
                            onClick={() => setSelectedMovie(movie)}
                            className="text-base font-sans font-bold text-white hover:text-amber-400 cursor-pointer truncate transition"
                          >
                            {movie.title}
                          </h4>
                          <span className="text-slate-400 text-xs font-mono block mt-0.5">
                            {movie.year} · ★{movie.rating}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-2">
                          <button
                            onClick={() => setSelectedMovie(movie)}
                            className="text-xs text-amber-400 hover:text-amber-300 font-mono font-bold"
                          >
                            Details &rarr;
                          </button>
                          <button
                            onClick={() => handleRemoveFromWatchlist(movie.id)}
                            className="text-slate-500 hover:text-rose-400 text-xs font-bold px-2 py-1 rounded"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 bg-slate-900/20 border border-dashed border-slate-800 rounded-3xl">
                <Bookmark className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                <h3 className="text-white font-sans font-bold">Your watchlist is pristine and waiting.</h3>
                <p className="text-slate-400 text-sm mt-1 max-w-sm mx-auto">
                  Ask WatchMatch or visually configure filters to build your shortlist of highly curated movies.
                </p>
                <button
                  onClick={() => setCurrentView('discover')}
                  className="mt-6 bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-xs hover:scale-105 transition"
                >
                  Start Discovery
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Global Movie Sheet Detail Modal */}
      {selectedMovie && (
        <MovieDetailModal 
          movie={selectedMovie}
          onClose={() => setSelectedMovie(null)}
          onAddToWatchlist={(movie) => {
            handleToggleWatchlist(movie);
            handleAddToLikes(movie);
          }}
          watchlistIds={tasteProfile.watchlist}
          onMovieClick={(movie) => setSelectedMovie(movie)}
        />
      )}
    </div>
  );
}

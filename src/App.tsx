import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import HomeView from './components/HomeView';
import FilterBuilder from './components/FilterBuilder';
import ResultsView from './components/ResultsView';
import MovieDetailModal from './components/MovieDetailModal';
import ProfileView from './components/ProfileView';
import { SearchFilters, RecommendationResponse, TasteProfile, Movie } from './types';
import { Sparkles, ArrowLeft, RefreshCw, Bookmark, Heart, Sliders, CheckCircle2 } from 'lucide-react';
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
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          watched: parsed.watched || [],
          savedMoviesDict: parsed.savedMoviesDict || {},
        };
      } catch (e) {
        console.error('Failed to parse local taste profile', e);
      }
    }
    return {
      watchlist: [],
      watched: [],
      liked: [],
      disliked: [],
      notInterested: [],
      history: [],
      ratings: {},
      dislikedTraits: [],
      preferredTraits: [],
      savedMoviesDict: {},
    };
  });

  // Sync taste profile changes to local storage
  useEffect(() => {
    localStorage.setItem('watchmatch_taste_profile', JSON.stringify(tasteProfile));
  }, [tasteProfile]);

  // Helper to save movies into local dictionary for persistent profile lookup
  const saveMoviesToDict = (newMovies: (Movie | undefined)[]) => {
    setTasteProfile(prev => {
      const dict = { ...(prev.savedMoviesDict || {}) };
      let changed = false;
      newMovies.forEach(m => {
        if (m && m.id) {
          dict[m.id] = m;
          changed = true;
        }
      });
      if (!changed) return prev;
      return { ...prev, savedMoviesDict: dict };
    });
  };

  // Helper to get movie by ID from saved dictionary or curated list
  const getMovieById = (id: string): Movie | undefined => {
    return tasteProfile.savedMoviesDict?.[id] || curatedMovies.find(m => m.id === id);
  };

  // Conversational Search submitting handler
  const handleSearchSubmit = async (queryText: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    setActiveFilters(null); // Reset activeFilters so fresh search doesn't inherit stale country/genre locks

    try {
      const response = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_message: queryText,
          existing_preferences: {},
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

      // Save returned movie details into dictionary
      if (data.recommendations?.movieDetails) {
        saveMoviesToDict(Object.values(data.recommendations.movieDetails));
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

      if (data.movieDetails) {
        saveMoviesToDict(Object.values(data.movieDetails));
      }

      setActiveRecommendations(data);
      setCurrentView('discover'); // Swivel back to results view on Discover tab
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to fetch recommendations with filters.');
    } finally {
      setIsLoading(false);
    }
  };

  // AI Persona Generation handler
  const handleGeneratePersona = async () => {
    try {
      const response = await fetch('/api/generate-persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taste_profile: tasteProfile }),
      });

      if (!response.ok) throw new Error('Failed to generate AI Persona.');

      const data = await response.json();
      if (data.persona) {
        setTasteProfile(prev => ({
          ...prev,
          persona: data.persona,
        }));
      }
    } catch (err) {
      console.error('Error generating AI persona:', err);
    }
  };

  // Add/Remove Movie to Watched list
  const handleToggleWatched = (movieId: string, movieObj?: Movie) => {
    if (movieObj) saveMoviesToDict([movieObj]);
    setTasteProfile(prev => {
      const watched = prev.watched || [];
      const exists = watched.includes(movieId);
      const updated = exists
        ? watched.filter(id => id !== movieId)
        : [...watched, movieId];
      return { ...prev, watched: updated };
    });
  };

  // Add/Remove Movie to Watchlist
  const handleToggleWatchlist = (movie: Movie) => {
    saveMoviesToDict([movie]);
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
    saveMoviesToDict([movie]);
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
    if (window.confirm('Clear all your saved watchlist, watched history, likes, and customized taste profile?')) {
      setTasteProfile({
        watchlist: [],
        watched: [],
        liked: [],
        disliked: [],
        notInterested: [],
        history: [],
        ratings: {},
        dislikedTraits: [],
        preferredTraits: [],
        savedMoviesDict: {},
      });
      setActiveFilters(null);
      setActiveRecommendations(null);
    }
  };

  // Handle manual removal inside Profile page
  const handleRemoveFromWatchlist = (id: string) => {
    setTasteProfile(prev => ({ ...prev, watchlist: prev.watchlist.filter(x => x !== id) }));
  };

  const handleRemoveFromWatched = (id: string) => {
    setTasteProfile(prev => ({ ...prev, watched: (prev.watched || []).filter(x => x !== id) }));
  };

  const handleRemoveFromLikes = (id: string) => {
    setTasteProfile(prev => ({ ...prev, liked: prev.liked.filter(x => x !== id) }));
  };

  const handleRemoveFromDislikes = (id: string) => {
    setTasteProfile(prev => ({ ...prev, disliked: prev.disliked.filter(x => x !== id) }));
  };

  return (
    <div className="min-h-screen bg-wm-bg text-wm-text-main flex flex-col font-sans">
      {/* Navigation */}
      <Navbar 
        currentView={currentView} 
        onViewChange={(view) => {
          setCurrentView(view);
          setErrorMsg(null); // clear prompts questions
        }} 
        watchlistCount={tasteProfile.watchlist.length}
        onSelectMovie={(movie) => {
          saveMoviesToDict([movie]);
          setSelectedMovie(movie);
        }}
      />

      {/* Main Content Stage */}
      <main className="flex-1 pb-16">
        {/* Error / Conversational Prompt Banner */}
        {errorMsg && (
          <div className="max-w-4xl mx-auto px-4 mt-6">
            <div className="bg-wm-card border border-amber-800/60 p-5 rounded-xl flex items-start space-x-3 text-amber-300 shadow-lg">
              <Sparkles className="w-5 h-5 flex-shrink-0 mt-0.5 animate-pulse text-wm-accent" />
              <div className="space-y-2 flex-1">
                <span className="font-mono text-xs font-bold uppercase tracking-wider block text-wm-accent">Scout Reflection Required</span>
                <p className="text-sm leading-relaxed">{errorMsg}</p>
                <div className="flex space-x-2 pt-1">
                  <button
                    onClick={() => setErrorMsg(null)}
                    className="text-xs font-bold text-gray-300 hover:text-white bg-black/50 px-3 py-1.5 rounded-lg border border-gray-800"
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
                    className="flex items-center space-x-1.5 text-xs text-gray-400 hover:text-white bg-wm-card border border-gray-800 px-3 py-2 rounded-lg transition font-medium"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Search</span>
                  </button>
                  <span className="text-xs text-gray-500 font-mono">
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
                  watchedIds={tasteProfile.watched || []}
                  onToggleWatched={handleToggleWatched}
                  onRefine={handleRefine}
                />
              </div>
            ) : (
              <HomeView 
                onSearchSubmit={handleSearchSubmit} 
                isLoading={isLoading}
                onSelectMovie={(movie) => {
                  saveMoviesToDict([movie]);
                  setSelectedMovie(movie);
                }}
                tasteProfile={tasteProfile} 
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
            onRemoveFromWatched={handleRemoveFromWatched}
            onToggleWatched={handleToggleWatched}
            onResetTasteProfile={handleResetTasteProfile}
            onMovieClick={(movie) => setSelectedMovie(movie)}
            onGeneratePersona={handleGeneratePersona}
            onSaveMovie={(movie) => saveMoviesToDict([movie])}
          />
        )}

        {currentView === 'watchlist' && (
          <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div className="flex items-center space-x-2">
                <Bookmark className="w-6 h-6 text-wm-accent" />
                <h2 className="text-2xl font-bold text-white tracking-tight">Your Watchlist</h2>
              </div>
              <span className="text-xs bg-wm-card border border-gray-800 text-gray-400 font-mono px-3 py-1 rounded-full font-bold">
                {tasteProfile.watchlist.length} Saved
              </span>
            </div>
            
            {tasteProfile.watchlist.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {tasteProfile.watchlist.map(id => {
                  const movie = getMovieById(id);
                  if (!movie) return null;
                  const isWatched = (tasteProfile.watched || []).includes(movie.id);

                  return (
                    <div 
                      key={movie.id}
                      className="bg-wm-card border border-gray-800 rounded-xl overflow-hidden shadow-md flex transition duration-300 hover:border-gray-700 relative group"
                    >
                      <img 
                        src={getCleanImageUrl(movie.posterUrl, 'poster')} 
                        alt={movie.title}
                        referrerPolicy="no-referrer"
                        className="w-24 h-36 object-cover border-r border-gray-800 flex-shrink-0"
                        onError={(e) => handleImageLoadError(e, movie.backdropUrl)}
                      />
                      <div className="p-4 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <h4 
                              onClick={() => setSelectedMovie(movie)}
                              className="text-base font-bold text-white hover:text-wm-accent cursor-pointer truncate transition"
                            >
                              {movie.title}
                            </h4>
                            {isWatched && (
                              <span className="bg-emerald-600/20 text-emerald-400 border border-emerald-600/40 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1 flex-shrink-0">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Watched</span>
                              </span>
                            )}
                          </div>
                          <span className="text-gray-400 text-xs font-mono block mt-0.5">
                            {movie.year} · ★{movie.rating} · <span className="capitalize">{movie.contentType}</span>
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t border-gray-800/80 mt-2">
                          <button
                            onClick={() => setSelectedMovie(movie)}
                            className="text-xs text-wm-accent hover:text-red-400 font-mono font-bold"
                          >
                            Details &rarr;
                          </button>

                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleToggleWatched(movie.id, movie)}
                              className={`text-xs font-bold px-2.5 py-1 rounded flex items-center space-x-1 border transition ${
                                isWatched 
                                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700' 
                                  : 'bg-black/50 text-gray-400 border-gray-800 hover:text-white hover:border-gray-700'
                              }`}
                              title={isWatched ? 'Mark unwatched' : 'Mark watched'}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{isWatched ? 'Watched' : 'Mark Watched'}</span>
                            </button>

                            <button
                              onClick={() => handleRemoveFromWatchlist(movie.id)}
                              className="text-gray-500 hover:text-wm-accent text-xs font-bold px-2 py-1 rounded transition"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 bg-wm-card/30 border border-dashed border-gray-800 rounded-xl">
                <Bookmark className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                <h3 className="text-white font-bold">Your watchlist is pristine and waiting.</h3>
                <p className="text-gray-400 text-sm mt-1 max-w-sm mx-auto">
                  Ask WatchMatch or visually configure filters to build your shortlist of highly curated movies.
                </p>
                <button
                  onClick={() => setCurrentView('discover')}
                  className="mt-6 bg-wm-accent hover:bg-red-700 text-white font-bold px-6 py-2.5 rounded-lg text-xs hover:scale-105 transition"
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
          watchedIds={tasteProfile.watched || []}
          onToggleWatched={handleToggleWatched}
          onMovieClick={(movie) => setSelectedMovie(movie)}
        />
      )}
    </div>
  );
}


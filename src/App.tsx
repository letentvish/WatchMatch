import React, { useState, useEffect, useRef } from 'react';
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
import { hydrateCuratedArt } from './utils/curatedArt';
import { refreshArt } from './utils/posters';
import { loadLlmSettings, llmPayload, describeSettings } from './utils/llmSettings';
import AISettingsModal from './components/AISettingsModal';

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

  // AI engine chosen in the settings panel (free server AI, the user's own key, or none)
  const [showAISettings, setShowAISettings] = useState(false);
  const [aiLabel, setAiLabel] = useState(() => describeSettings(loadLlmSettings()));
  useEffect(() => {
    const refresh = () => setAiLabel(describeSettings(loadLlmSettings()));
    window.addEventListener('watchmatch-llm-settings', refresh);
    return () => window.removeEventListener('watchmatch-llm-settings', refresh);
  }, []);

  // Swap placeholder artwork on the curated titles for real TMDB posters, then re-render
  const [, setCuratedArtVersion] = useState(0);
  useEffect(() => {
    hydrateCuratedArt().then(changed => {
      if (changed) setCuratedArtVersion(v => v + 1);
    });
  }, []);

  // Movies saved before posters came from TMDB (watchlist, history, likes) still carry stock
  // photos in localStorage; swap in their real artwork once.
  useEffect(() => {
    refreshArt(Object.values(tasteProfile.savedMoviesDict || {})).then(updated => {
      if (updated.length) saveMoviesToDict(updated);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // What the server needs to personalise results: never re-recommend watched/disliked titles,
  // and use liked titles as a taste signal.
  const buildTastePayload = () => {
    const toItems = (ids: string[]) => ids
      .slice(-60)
      .map(id => {
        const m = getMovieById(id);
        return m ? { id, title: m.title, genres: m.genres } : null;
      })
      .filter(Boolean);
    return {
      watched: toItems(tasteProfile.watched || []),
      liked: toItems(tasteProfile.liked || []),
      disliked: toItems([...(tasteProfile.disliked || []), ...(tasteProfile.notInterested || [])]),
    };
  };

  // Only the latest search may update the screen: starting a new one cancels the previous request,
  // and a late response from an older one is ignored (otherwise results flip back and forth).
  const requestSeq = useRef(0);
  const inflight = useRef<AbortController | null>(null);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const beginRequest = (label: string) => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    const seq = ++requestSeq.current;
    setIsLoading(true);
    setPendingQuery(label);
    return {
      signal: controller.signal,
      isCurrent: () => seq === requestSeq.current,
      finish: () => {
        if (seq !== requestSeq.current) return;
        inflight.current = null;
        setIsLoading(false);
        setPendingQuery(null);
      },
    };
  };

  // Conversational Search submitting handler. Refinements ("only movies", "shorter") build on the
  // current filters; fresh searches start clean so old country/genre locks don't leak in.
  const handleSearchSubmit = async (queryText: string, isRefinement = false) => {
    const previousFilters = isRefinement ? activeFilters : null;
    const request = beginRequest(queryText);
    setErrorMsg(null);
    // Fresh searches drop the old filters right away; refinements keep them until the new ones arrive.
    if (!isRefinement) setActiveFilters(null);

    try {
      const response = await fetch('/api/discover', {
        signal: request.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_message: queryText,
          existing_preferences: previousFilters || {},
          taste: buildTastePayload(),
          llm: llmPayload(),
        }),
      });


      if (!response.ok) {
        throw new Error('Our movie scout server failed to respond. Please try again.');
      }

      const data = await response.json();
      if (!request.isCurrent()) return; // a newer search started; don't let this one overwrite it

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
      if (!request.isCurrent() || err?.name === 'AbortError') return;
      console.error(err);
      setErrorMsg(err.message || 'Failed to analyze request. Check connection.');
    } finally {
      request.finish();
    }
  };

  // Structured Filter panel applying handler
  const handleApplyFilters = async (filters: SearchFilters) => {
    const request = beginRequest('your filters');
    setErrorMsg(null);
    setActiveFilters(filters);

    try {
      const response = await fetch('/api/rank-candidates', {
        signal: request.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_filters: filters,
          candidate_titles: [],
          taste: buildTastePayload(),
          llm: llmPayload(),
        }),
      });

      if (!response.ok) {
        throw new Error('Scout ranking system failed. Please adjust filters.');
      }

      const data = await response.json();
      if (!request.isCurrent()) return;

      if (data.movieDetails) {
        saveMoviesToDict(Object.values(data.movieDetails));
      }

      setActiveRecommendations(data);
      setCurrentView('discover'); // Swivel back to results view on Discover tab
    } catch (err: any) {
      if (!request.isCurrent() || err?.name === 'AbortError') return;
      console.error(err);
      setErrorMsg(err.message || 'Failed to fetch recommendations with filters.');
    } finally {
      request.finish();
    }
  };

  // AI Persona Generation handler
  const handleGeneratePersona = async () => {
    try {
      const response = await fetch('/api/generate-persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taste_profile: tasteProfile, llm: llmPayload() }),
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
    handleSearchSubmit(refinementText, true);
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
        onOpenAISettings={() => setShowAISettings(true)}
        aiLabel={aiLabel}
      />
      {showAISettings && <AISettingsModal onClose={() => setShowAISettings(false)} />}

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
                      beginRequest('').finish(); // cancels any in-flight search
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
                  isLoading={isLoading}
                  pendingQuery={pendingQuery}
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
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-red-600/20 border border-red-500/40 flex items-center justify-center">
                  <Bookmark className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white font-heading tracking-tight">Your Watchlist</h2>
                  <p className="text-xs text-gray-400 font-sans">Curated movies and shows saved for your next session</p>
                </div>
              </div>
              <span className="text-xs bg-white/5 border border-white/10 text-red-400 font-mono px-3.5 py-1.5 rounded-full font-bold shadow-inner">
                {tasteProfile.watchlist.length} Saved
              </span>
            </div>
            
            {tasteProfile.watchlist.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {tasteProfile.watchlist.map(id => {
                  const movie = getMovieById(id);
                  if (!movie) return null;
                  const isWatched = (tasteProfile.watched || []).includes(movie.id);

                  return (
                    <div 
                      key={movie.id}
                      className="glass-card border border-white/10 rounded-2xl overflow-hidden shadow-xl flex transition-all duration-300 hover:border-red-500/40 hover:shadow-[0_0_25px_-5px_rgba(229,9,20,0.2)] group"
                    >
                      <img 
                        src={getCleanImageUrl(movie.posterUrl, 'poster')} 
                        alt={movie.title}
                        referrerPolicy="no-referrer"
                        className="w-28 h-40 object-cover border-r border-white/10 flex-shrink-0 group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => handleImageLoadError(e, movie.backdropUrl)}
                      />
                      <div className="p-4 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <h4 
                              onClick={() => setSelectedMovie(movie)}
                              className="text-base font-bold text-white hover:text-red-400 cursor-pointer line-clamp-1 transition font-heading"
                            >
                              {movie.title}
                            </h4>
                            {isWatched && (
                              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1 flex-shrink-0">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Watched</span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-2 text-gray-400 text-xs font-mono mt-1">
                            <span>{movie.year}</span>
                            <span>•</span>
                            <span className="text-amber-400 font-bold">★ {movie.rating}</span>
                            <span>•</span>
                            <span className="capitalize text-gray-300">{movie.contentType}</span>
                          </div>
                          {movie.genres && movie.genres.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {movie.genres.slice(0, 2).map(g => (
                                <span key={g} className="text-[10px] bg-white/5 border border-white/10 px-2 py-0.5 rounded-md text-gray-400">
                                  {g}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t border-white/10 mt-3">
                          <button
                            onClick={() => setSelectedMovie(movie)}
                            className="text-xs text-red-500 hover:text-red-400 font-mono font-bold flex items-center space-x-1 transition cursor-pointer"
                          >
                            <span>Inspect</span>
                            <span>&rarr;</span>
                          </button>

                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleToggleWatched(movie.id, movie)}
                              className={`text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center space-x-1.5 border transition cursor-pointer ${
                                isWatched 
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' 
                                  : 'bg-white/5 text-gray-300 border-white/10 hover:text-white hover:border-white/20'
                              }`}
                              title={isWatched ? 'Mark unwatched' : 'Mark watched'}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{isWatched ? 'Watched' : 'Mark'}</span>
                            </button>

                            <button
                              onClick={() => handleRemoveFromWatchlist(movie.id)}
                              className="text-gray-400 hover:text-red-400 text-xs font-bold px-2 py-1 rounded transition cursor-pointer"
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
              <div className="text-center py-20 glass-panel rounded-3xl border border-dashed border-white/10">
                <Bookmark className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-black text-white font-heading">Your watchlist is pristine and waiting.</h3>
                <p className="text-gray-400 text-xs mt-2 max-w-sm mx-auto font-sans leading-relaxed">
                  Ask WatchMatch or visually configure filters to build your shortlist of highly curated movies.
                </p>
                <button
                  onClick={() => setCurrentView('discover')}
                  className="mt-6 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold px-7 py-3 rounded-full text-xs hover:shadow-[0_0_25px_-3px_rgba(229,9,20,0.6)] transition-all cursor-pointer font-heading tracking-wide uppercase"
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


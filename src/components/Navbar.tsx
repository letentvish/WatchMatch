import React, { useState, useEffect, useRef } from 'react';
import { Film, Sliders, Heart, User, Menu, X, Search, Loader2, Star } from 'lucide-react';
import { Movie } from '../types';
import { getCleanImageUrl, handleImageLoadError } from '../utils/imageHelper';

interface NavbarProps {
  currentView: 'discover' | 'filters' | 'profile' | 'watchlist';
  onViewChange: (view: 'discover' | 'filters' | 'profile' | 'watchlist') => void;
  watchlistCount: number;
  onSelectMovie?: (movie: Movie) => void;
}

export default function Navbar({ currentView, onViewChange, watchlistCount, onSelectMovie }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Debounced live search fetching
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      setShowDropdown(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
        }
      } catch (err) {
        console.error('Navbar live search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside listener to dismiss search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNavClick = (view: 'discover' | 'filters' | 'profile' | 'watchlist') => {
    onViewChange(view);
    setMobileMenuOpen(false);
  };

  const handleMoviePick = (movie: Movie) => {
    setShowDropdown(false);
    setSearchQuery('');
    if (onSelectMovie) {
      onSelectMovie(movie);
    }
  };

  return (
    <header className="glass-panel sticky top-0 z-50 border-b border-white/10 backdrop-blur-2xl shadow-xl">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
        {/* Logo */}
        <div 
          className="flex items-center gap-3 cursor-pointer group shrink-0"
          onClick={() => handleNavClick('discover')}
          id="navbar-logo"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-rose-600 flex items-center justify-center text-white transition-transform duration-300 group-hover:scale-105 shadow-[0_0_20px_-3px_rgba(229,9,20,0.6)]">
            <Film className="w-6 h-6 stroke-[2.25]" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-2xl font-extrabold tracking-tight text-white group-hover:text-red-400 transition-colors font-heading">WatchMatch</span>
            <span className="text-[10px] text-red-500 uppercase font-mono font-bold tracking-widest mt-0.5">AI Cinephile Scout</span>
          </div>
        </div>

        {/* Live Search Bar */}
        <div className="flex-1 max-w-md relative hidden sm:block" ref={searchRef}>
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-red-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
              placeholder="Instant search movies, TV shows, anime..."
              className="w-full bg-white/5 border border-white/12 focus:border-red-500/60 text-white placeholder-gray-400 text-xs rounded-full pl-10 pr-9 py-2.5 outline-none transition shadow-inner font-sans backdrop-blur-md focus:shadow-[0_0_25px_-5px_rgba(229,9,20,0.4)]"
            />
            {isSearching ? (
              <Loader2 className="w-4 h-4 text-red-500 absolute right-3.5 animate-spin" />
            ) : searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 text-gray-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {showDropdown && (
            <div className="absolute top-full left-0 right-0 mt-2 glass-panel rounded-2xl shadow-2xl overflow-hidden z-50 max-h-96 overflow-y-auto divide-y divide-white/10 border border-white/15 animate-in fade-in duration-150">
              {searchResults.length > 0 ? (
                searchResults.map(movie => (
                  <div
                    key={movie.id}
                    onClick={() => handleMoviePick(movie)}
                    className="p-3 hover:bg-white/10 flex items-center gap-3 cursor-pointer transition duration-150 group"
                  >
                    <img
                      src={getCleanImageUrl(movie.posterUrl, 'poster')}
                      alt={movie.title}
                      referrerPolicy="no-referrer"
                      className="w-10 h-14 object-cover rounded-xl flex-shrink-0 border border-white/15 group-hover:scale-105 transition"
                      onError={(e) => handleImageLoadError(e, movie.backdropUrl)}
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-white group-hover:text-red-400 truncate transition font-heading">
                        {movie.title}
                      </h4>
                      <span className="text-[11px] text-gray-400 font-mono block mt-0.5">
                        {movie.year} · ★{movie.rating} · <span className="capitalize text-gray-300">{movie.contentType}</span>
                      </span>
                      {movie.genres?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {movie.genres.slice(0, 2).map(g => (
                            <span key={g} className="text-[9px] bg-white/5 border border-white/10 text-gray-300 px-1.5 py-0.5 rounded font-mono">
                              {g}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : !isSearching ? (
                <div className="p-4 text-center text-xs text-gray-400 font-sans">
                  No matching titles found for "{searchQuery}"
                </div>
              ) : null}
            </div>
          )}
        </div>


        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-semibold">
          <button
            id="nav-btn-discover"
            onClick={() => handleNavClick('discover')}
            className={`flex items-center gap-2 transition-colors py-1 ${
              currentView === 'discover'
                ? 'text-white font-bold border-b-2 border-wm-accent'
                : 'text-gray-300 hover:text-wm-accent'
            }`}
          >
            <Film className="w-4 h-4 text-wm-accent" />
            <span>Scout</span>
          </button>

          <button
            id="nav-btn-filters"
            onClick={() => handleNavClick('filters')}
            className={`flex items-center gap-2 transition-colors py-1 ${
              currentView === 'filters'
                ? 'text-white font-bold border-b-2 border-wm-accent'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4 text-gray-400" />
            <span>Filters</span>
          </button>

          <button
            id="nav-btn-watchlist"
            onClick={() => handleNavClick('watchlist')}
            className={`flex items-center gap-2 transition-colors relative py-1 ${
              currentView === 'watchlist'
                ? 'text-white font-bold border-b-2 border-wm-accent'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            <Heart className="w-4 h-4 text-gray-400" />
            <span>Watchlist</span>
            {watchlistCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-wm-accent text-[9px] font-bold text-white">
                {watchlistCount}
              </span>
            )}
          </button>

          <button
            id="nav-btn-profile"
            onClick={() => handleNavClick('profile')}
            className={`flex items-center gap-2 transition-colors py-1 ${
              currentView === 'profile'
                ? 'text-white font-bold border-b-2 border-wm-accent'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            <User className="w-4 h-4 text-gray-400" />
            <span>My Taste</span>
          </button>
        </nav>

        {/* Mobile Menu Button */}
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden text-gray-300 hover:text-white p-2"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Nav Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-wm-card border-b border-gray-800 px-4 py-4 space-y-3">
          <div className="relative mb-2">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search movies & shows..."
              className="w-full bg-black/60 border border-gray-800 text-white text-xs rounded-lg pl-9 pr-3 py-2.5"
            />
          </div>

          <button
            onClick={() => handleNavClick('discover')}
            className={`flex items-center justify-between w-full px-4 py-3 rounded-lg text-sm font-semibold ${
              currentView === 'discover' ? 'bg-wm-accent text-white' : 'text-gray-300 hover:bg-wm-card-hover'
            }`}
          >
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4" />
              <span>Scout</span>
            </div>
          </button>

          <button
            onClick={() => handleNavClick('filters')}
            className={`flex items-center justify-between w-full px-4 py-3 rounded-lg text-sm font-semibold ${
              currentView === 'filters' ? 'bg-wm-accent text-white' : 'text-gray-300 hover:bg-wm-card-hover'
            }`}
          >
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4" />
              <span>Filters</span>
            </div>
          </button>

          <button
            onClick={() => handleNavClick('watchlist')}
            className={`flex items-center justify-between w-full px-4 py-3 rounded-lg text-sm font-semibold ${
              currentView === 'watchlist' ? 'bg-wm-accent text-white' : 'text-gray-300 hover:bg-wm-card-hover'
            }`}
          >
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4" />
              <span>Watchlist</span>
            </div>
            {watchlistCount > 0 && (
              <span className="bg-white text-wm-accent text-xs font-bold rounded-full px-2 py-0.5">
                {watchlistCount}
              </span>
            )}
          </button>

          <button
            onClick={() => handleNavClick('profile')}
            className={`flex items-center justify-between w-full px-4 py-3 rounded-lg text-sm font-semibold ${
              currentView === 'profile' ? 'bg-wm-accent text-white' : 'text-gray-300 hover:bg-wm-card-hover'
            }`}
          >
            <div className="flex items-center gap-2">
              <User className="w-4 h-4" />
              <span>My Taste</span>
            </div>
          </button>
        </div>
      )}
    </header>
  );
}



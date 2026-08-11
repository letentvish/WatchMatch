import React, { useState } from 'react';
import { Film, Sliders, Heart, User, Menu, X } from 'lucide-react';

interface NavbarProps {
  currentView: 'discover' | 'filters' | 'profile' | 'watchlist';
  onViewChange: (view: 'discover' | 'filters' | 'profile' | 'watchlist') => void;
  watchlistCount: number;
}

export default function Navbar({ currentView, onViewChange, watchlistCount }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (view: 'discover' | 'filters' | 'profile' | 'watchlist') => {
    onViewChange(view);
    setMobileMenuOpen(false);
  };

  return (
    <header className="bg-wm-bg/90 backdrop-blur-md sticky top-0 z-50 border-b border-gray-800/80">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Logo */}
        <div 
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => handleNavClick('discover')}
          id="navbar-logo"
        >
          <div className="w-10 h-10 flex items-center justify-center text-wm-accent transition-transform group-hover:scale-105">
            <Film className="w-7 h-7 stroke-[2.25]" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-2xl font-black tracking-tight text-white group-hover:text-gray-100 transition-colors">WatchMatch</span>
            <span className="text-[10px] text-wm-accent uppercase font-bold tracking-widest mt-0.5">Personal Movie Scout</span>
          </div>
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


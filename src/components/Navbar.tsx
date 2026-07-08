import React from 'react';
import { Film, User, Sliders, Heart } from 'lucide-react';

interface NavbarProps {
  currentView: 'discover' | 'filters' | 'profile' | 'watchlist';
  onViewChange: (view: 'discover' | 'filters' | 'profile' | 'watchlist') => void;
  watchlistCount: number;
}

export default function Navbar({ currentView, onViewChange, watchlistCount }: NavbarProps) {
  return (
    <nav className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand */}
        <div 
          className="flex items-center space-x-2 cursor-pointer"
          onClick={() => onViewChange('discover')}
          id="navbar-logo"
        >
          <div className="bg-gradient-to-tr from-amber-500 to-rose-500 p-2 rounded-xl text-white shadow-lg shadow-rose-500/20">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <span className="font-sans font-bold tracking-tight text-xl text-white">WatchMatch</span>
            <span className="text-xs text-rose-400 block -mt-1 font-medium font-mono">Personal Movie Scout</span>
          </div>
        </div>

        {/* Links */}
        <div className="flex items-center space-x-2 md:space-x-4">
          <button
            id="nav-btn-discover"
            onClick={() => onViewChange('discover')}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
              currentView === 'discover' 
                ? 'bg-slate-800 text-white shadow-inner border border-slate-700' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Film className="w-4 h-4 text-rose-400" />
            <span>Scout</span>
          </button>

          <button
            id="nav-btn-filters"
            onClick={() => onViewChange('filters')}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
              currentView === 'filters' 
                ? 'bg-slate-800 text-white shadow-inner border border-slate-700' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Sliders className="w-4 h-4 text-amber-400" />
            <span>Filters</span>
          </button>

          <button
            id="nav-btn-watchlist"
            onClick={() => onViewChange('watchlist')}
            className={`relative flex items-center space-x-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
              currentView === 'watchlist' 
                ? 'bg-slate-800 text-white shadow-inner border border-slate-700' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Heart className="w-4 h-4 text-emerald-400" />
            <span>Watchlist</span>
            {watchlistCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center border-2 border-slate-900 animate-pulse">
                {watchlistCount}
              </span>
            )}
          </button>

          <button
            id="nav-btn-profile"
            onClick={() => onViewChange('profile')}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
              currentView === 'profile' 
                ? 'bg-slate-800 text-white shadow-inner border border-slate-700' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <User className="w-4 h-4 text-sky-400" />
            <span>My Taste</span>
          </button>
        </div>
      </div>
    </nav>
  );
}

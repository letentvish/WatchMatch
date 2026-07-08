import React from 'react';

/**
 * Utility to process image URLs and handle broken or mangled assets.
 * Some curated movie items contain Unsplash photo IDs nested inside TMDB domains,
 * which we dynamically correct, or use high-quality fallbacks.
 */

export function getCleanImageUrl(url: string | undefined, type: 'poster' | 'backdrop' = 'poster'): string {
  if (!url || url.trim() === '') {
    return type === 'poster'
      ? 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&q=80&auto=format&fit=crop'
      : 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1200&q=80&auto=format&fit=crop';
  }

  // Detect Unsplash photo IDs mangled inside TMDB domain names
  // Example: https://image.tmdb.org/t/p/original/1534447677768-be436bb09401.jpg
  if (url.includes('image.tmdb.org/t/p/') && (url.includes('-') || url.match(/\d{6,}/))) {
    const filename = url.split('/').pop() || '';
    const cleanId = filename.replace(/\.(jpg|jpeg|png|webp)/i, '');
    
    // If it's a UUID/Unsplash format with hyphens or starts with a long timestamp/id
    if (cleanId.includes('-') || cleanId.length > 10) {
      const photoId = cleanId.startsWith('photo-') ? cleanId : `photo-${cleanId}`;
      return `https://images.unsplash.com/${photoId}?q=80&w=${type === 'poster' ? 500 : 1200}&auto=format&fit=crop`;
    }
  }

  return url;
}

/**
 * Common image onError handler that can be passed to img elements.
 * It will try to fall back from backdrop to poster, and then to a default movie wallpaper.
 */
export function handleImageLoadError(
  e: React.SyntheticEvent<HTMLImageElement, Event>,
  fallbackPosterUrl?: string
) {
  const img = e.currentTarget;
  img.onerror = null; // Prevent infinite error loop if the fallback fails

  if (fallbackPosterUrl && img.src !== fallbackPosterUrl && fallbackPosterUrl.trim() !== '') {
    img.src = fallbackPosterUrl;
  } else {
    // Ultimate high-quality generic movie background
    img.src = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1200&auto=format&fit=crop';
  }
}

import React from 'react';

/**
 * Posters and backdrops come from TMDB (image.tmdb.org). Anything else in stored data — stock
 * photos from Unsplash, hotlink-blocked Wikimedia files, empty values — is not the title's real
 * artwork, so we show a neutral placeholder instead of an unrelated picture.
 */

const svg = (w: number, h: number) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1b24"/><stop offset="1" stop-color="#0b0b10"/></linearGradient></defs>` +
      `<rect width="100%" height="100%" fill="url(#g)"/>` +
      `<g transform="translate(${w / 2 - 24} ${h / 2 - 24})" fill="none" stroke="#3a3a48" stroke-width="3">` +
      `<rect x="4" y="8" width="40" height="32" rx="4"/><path d="M4 16h40M4 32h40M14 8v32M34 8v32"/></g></svg>`,
  )}`;

export const PLACEHOLDER_POSTER = svg(500, 750);
export const PLACEHOLDER_BACKDROP = svg(1280, 720);

function isRealArtwork(url: string): boolean {
  return /^https:\/\/image\.tmdb\.org\/t\/p\//.test(url) && !/\/photo-/.test(url)
    || /^https:\/\/(m\.media-amazon\.com|static\.tvmaze\.com)\//.test(url);
}

export function getCleanImageUrl(url: string | undefined, type: 'poster' | 'backdrop' = 'poster'): string {
  const placeholder = type === 'poster' ? PLACEHOLDER_POSTER : PLACEHOLDER_BACKDROP;
  if (!url || !url.trim()) return placeholder;
  return isRealArtwork(url.trim()) ? url.trim() : placeholder;
}

/**
 * Common image onError handler: try the given fallback (e.g. the poster when a backdrop fails),
 * then the neutral placeholder.
 */
export function handleImageLoadError(
  e: React.SyntheticEvent<HTMLImageElement, Event>,
  fallbackPosterUrl?: string
) {
  const img = e.currentTarget;
  const fallback = fallbackPosterUrl ? getCleanImageUrl(fallbackPosterUrl) : '';
  if (fallback && fallback !== PLACEHOLDER_POSTER && img.src !== fallback) {
    img.src = fallback;
  } else {
    img.onerror = null; // stop here even if the placeholder somehow fails
    img.src = img.naturalWidth > img.naturalHeight ? PLACEHOLDER_BACKDROP : PLACEHOLDER_POSTER;
  }
}

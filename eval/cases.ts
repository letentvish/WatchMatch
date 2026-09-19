import type { ContentType } from '../src/types.js';

// Hard expectations are checked against every returned title. `judge` is a plain-language
// description of what a good answer looks like, scored by an LLM when GEMINI_API_KEY is set.
export interface Expect {
  languages?: string[];          // each result's languages must include one of these
  contentTypes?: ContentType[];  // each result must be one of these
  maxRuntime?: number;           // movies only, minutes
  minYear?: number;
  maxYear?: number;
  platformsAny?: string[];       // each result must stream on one of these (substring, case-insensitive)
  seriesStatus?: 'finished';
  genresAny?: string[];          // most results should carry one of these genres
  excludeGenres?: string[];      // no result may carry these genres
  excludeTitles?: string[];      // none of these may appear
  judge?: string;
}

export interface TasteItem { id: string; title: string; genres?: string[] }

export interface EvalCase {
  id: string;
  steps: { query: string; refine?: boolean }[]; // refine = send previous step's filters
  taste?: { watched?: TasteItem[]; liked?: TasteItem[]; disliked?: TasteItem[] };
  expect: Expect;
}

const currentYear = new Date().getFullYear();
const one = (id: string, query: string, expect: Expect): EvalCase => ({ id, steps: [{ query }], expect });

export const cases: EvalCase[] = [
  // Pure mood
  one('mood-dark-mindbending', 'something dark and mind-bending', {
    judge: 'Dark, cerebral, twisty titles (e.g. psychological thrillers, puzzle-box sci-fi, time loops). Not generic action.',
  }),
  one('mood-feelgood', 'feel-good comedy for a lazy Sunday', {
    genresAny: ['Comedy'], excludeGenres: ['Horror'],
    judge: 'Light, warm, low-stakes comedies. Nothing grim or violent.',
  }),
  one('mood-cry-korean', 'painful romantic korean drama that will make me cry', {
    languages: ['Korean'],
    judge: 'Korean romance/melodrama with tragic or heartbreaking storylines.',
  }),
  one('mood-slowburn-horror', 'slow burn psychological horror', {
    judge: 'Atmospheric, psychological horror that builds dread slowly (not slashers or jump-scare fests).',
  }),
  one('mood-underdog', 'inspiring sports underdog story', {
    judge: 'Sports films/series about an underdog overcoming odds; uplifting.',
  }),
  one('mood-heist', 'a clever heist movie', {
    contentTypes: ['movie'],
    judge: 'Heist / caper films where a crew plans and executes a robbery.',
  }),
  one('mood-time-travel', 'time travel movies', {
    contentTypes: ['movie'],
    judge: 'Films whose plot centrally involves time travel or time loops.',
  }),
  one('mood-cozy-mystery', 'cozy mystery series', {
    contentTypes: ['series', 'limited_series'],
    judge: 'Gentle whodunit series, light in tone (e.g. amateur sleuths, small towns). Not gritty crime.',
  }),

  // Language / region
  one('lang-hindi-crime', 'hindi crime thriller', {
    languages: ['Hindi'], genresAny: ['Crime', 'Thriller', 'Mystery', 'Drama'],
  }),
  one('lang-malayalam', 'malayalam thriller', { languages: ['Malayalam'] }),
  one('lang-tamil-action', 'tamil action movie', { languages: ['Tamil'], contentTypes: ['movie'] }),
  one('lang-spanish-series', 'spanish thriller series', { languages: ['Spanish'], contentTypes: ['series', 'limited_series'] }),
  one('lang-japanese-horror', 'japanese horror movie', { languages: ['Japanese'], contentTypes: ['movie'], genresAny: ['Horror'] }),
  one('lang-korean-gems', 'hidden gem korean movies', { languages: ['Korean'], contentTypes: ['movie'] }),
  one('anime-worldbuilding', 'anime with great world building', {
    contentTypes: ['anime'],
    judge: 'Japanese anime known for rich, expansive worlds (fantasy or sci-fi).',
  }),

  // Hard constraints
  one('year-90s-crime', '90s crime movies', { contentTypes: ['movie'], minYear: 1990, maxYear: 1999, genresAny: ['Crime'] }),
  one('runtime-short-funny', 'funny movie under 90 minutes', { contentTypes: ['movie'], maxRuntime: 90, genresAny: ['Comedy'] }),
  one('recent-rated', 'recent highly rated movies', { contentTypes: ['movie'], minYear: currentYear - 4 }),
  one('platform-netflix-scifi', 'sci-fi on Netflix', { platformsAny: ['Netflix'] }),
  one('platform-prime-thriller-series', 'thriller series on prime video', {
    platformsAny: ['Amazon Prime Video', 'Prime Video'], contentTypes: ['series', 'limited_series'],
  }),
  one('limited-weekend', 'limited series I can finish in a weekend', { contentTypes: ['limited_series', 'series'] }),
  one('doc-true-crime', 'true crime documentary', { contentTypes: ['documentary'] }),
  one('family-animated', 'animated movie for family night with kids', {
    genresAny: ['Animation', 'Family'], excludeGenres: ['Horror'],
  }),
  one('exclude-romance-action', 'fast paced action movie, no romance', {
    contentTypes: ['movie'], genresAny: ['Action'], excludeGenres: ['Romance'],
  }),

  // Reference titles & people
  one('like-dark-finished', 'series like Dark but finished', {
    contentTypes: ['series', 'limited_series'], seriesStatus: 'finished', excludeTitles: ['Dark'],
    judge: 'Complex, finished sci-fi/mystery series with Dark-like puzzle plotting.',
  }),
  one('like-interstellar', 'something like Interstellar', {
    excludeTitles: ['Interstellar'],
    judge: 'Ambitious, emotional space / hard sci-fi films.',
  }),
  one('like-squid-game-korean', 'korean survival thriller like Squid Game', {
    languages: ['Korean'], excludeTitles: ['Squid Game'],
    judge: 'Korean survival / deadly-game or high-stakes thrillers.',
  }),
  one('person-srk', 'movies with Shah Rukh Khan', {
    languages: ['Hindi'],
    judge: 'Films starring Shah Rukh Khan.',
  }),

  // Typos
  one('typo-romcom', 'romatic comdy', { genresAny: ['Romance', 'Comedy'] }),

  // Follow-ups: the second message must build on the first
  {
    id: 'followup-korean-movies-short',
    steps: [{ query: 'korean thriller' }, { query: 'only movies under 2 hours', refine: true }],
    expect: { languages: ['Korean'], contentTypes: ['movie'], maxRuntime: 120 },
  },
  {
    id: 'followup-scifi-netflix',
    steps: [{ query: 'sci-fi series' }, { query: 'only on Netflix', refine: true }],
    expect: { contentTypes: ['series', 'limited_series'], platformsAny: ['Netflix'] },
  },

  // Taste profile: watched / disliked titles must never come back
  {
    id: 'taste-watched-excluded',
    steps: [{ query: 'korean survival thriller' }],
    taste: {
      watched: [
        { id: 'x1', title: 'Squid Game' },
        { id: 'x2', title: 'Alice in Borderland' },
        { id: 'x3', title: 'All of Us Are Dead' },
      ],
    },
    expect: { excludeTitles: ['Squid Game', 'Alice in Borderland', 'All of Us Are Dead'] },
  },
  {
    id: 'taste-disliked-excluded',
    steps: [{ query: 'mind-bending sci-fi movie' }],
    taste: {
      disliked: [{ id: 'y1', title: 'Inception' }, { id: 'y2', title: 'Tenet' }],
      liked: [{ id: 'y3', title: 'Arrival', genres: ['Sci-Fi', 'Drama'] }],
    },
    expect: { contentTypes: ['movie'], excludeTitles: ['Inception', 'Tenet'] },
  },
];

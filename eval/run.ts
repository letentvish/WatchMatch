// WatchMatch search-quality eval.
//
//   1. Start the app:   PORT=3100 npm run dev
//   2. Run the eval:    npm run eval               (all cases)
//                       npm run eval -- lang       (only cases whose id contains "lang")
//
// Env: EVAL_BASE_URL (default http://localhost:3100). The LLM relevance judge uses the server's default
// AI from .env (e.g. NVIDIA); override its model with EVAL_JUDGE_MODEL. Note: judging with the same
// model that ranked the results is lenient — use a different model when you can.
// Writes eval/results/latest.json and a timestamped copy so runs can be compared.

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { cases, EvalCase, Expect } from './cases.js';
import { generateJson, serverDefault, describe as describeLlm } from '../server/llm/index.js';
import type { Movie, RecommendationResponse, SearchFilters } from '../src/types.js';

dotenv.config();

const BASE = process.env.EVAL_BASE_URL || 'http://localhost:3100';
const defaultLlm = serverDefault();
const judgeLlm = defaultLlm ? { ...defaultLlm, model: process.env.EVAL_JUDGE_MODEL || defaultLlm.model } : null;
const judgeEnabled = !!judgeLlm;

interface CheckResult { name: string; pass: boolean; detail?: string }
interface CaseResult {
  id: string;
  query: string;
  titles: string[];
  checks: CheckResult[];
  constraintCompliance: number | null; // share of results satisfying every hard constraint
  judgeScore: number | null;            // 1..5
  ms: number;
  diagnostics?: Record<string, any>;
  filters?: SearchFilters;
  error?: string;
}

const lc = (s: string) => s.toLowerCase();

async function discover(query: string, existing: any, taste: any): Promise<{ filters: SearchFilters; recommendations: RecommendationResponse }> {
  const res = await fetch(`${BASE}/api/discover`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user_message: query, existing_preferences: existing || {}, taste: taste || {} }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function orderedMovies(r: RecommendationResponse): Movie[] {
  const ids = [r.best_match?.title_id, ...(r.recommendations || []).map(x => x.title_id)].filter(Boolean);
  return ids.map(id => r.movieDetails?.[id!]).filter((m): m is Movie => !!m);
}

// Which hard constraints does a single title violate?
function violations(m: Movie, e: Expect): string[] {
  const v: string[] = [];
  if (e.languages && !m.languages.some(l => e.languages!.some(x => lc(l) === lc(x)))) v.push(`language=${m.languages[0]}`);
  if (e.contentTypes && !e.contentTypes.includes(m.contentType)) v.push(`type=${m.contentType}`);
  if (e.maxRuntime && m.contentType === 'movie' && m.runtime > e.maxRuntime) v.push(`runtime=${m.runtime}`);
  if (e.minYear && m.year < e.minYear) v.push(`year=${m.year}`);
  if (e.maxYear && m.year > e.maxYear) v.push(`year=${m.year}`);
  if (e.platformsAny && !m.platforms.some(p => e.platformsAny!.some(x => lc(p).includes(lc(x))))) v.push(`platforms=${m.platforms.join('/') || 'none'}`);
  if (e.seriesStatus === 'finished' && m.seriesStatus && !['finished', 'limited_series'].includes(m.seriesStatus)) v.push(`status=${m.seriesStatus}`);
  if (e.excludeGenres && m.genres.some(g => e.excludeGenres!.some(x => lc(g).includes(lc(x))))) v.push(`genre=${m.genres.join('/')}`);
  if (e.excludeTitles && e.excludeTitles.some(t => lc(t) === lc(m.title))) v.push('excluded-title');
  return v;
}

async function judge(query: string, movies: Movie[], description?: string): Promise<number | null> {
  if (!judgeLlm || !movies.length) return null;
  const list = movies.map((m, i) => `${i + 1}. ${m.title} (${m.year}, ${m.languages[0]}, ${m.contentType}) — ${m.genres.join(', ')} — ${m.synopsis.slice(0, 200)}`);
  const prompt = `You are grading a movie recommender. For each result, score 1-5 how well it fits the request
(5 = exactly what the user wants, 3 = loosely related, 1 = wrong). Judge tone and mood, not just genre.

REQUEST: "${query}"
${description ? `WHAT A GOOD ANSWER LOOKS LIKE: ${description}\n` : ''}
RESULTS:
${list.join('\n')}`;
  try {
    const out = await generateJson(judgeLlm, {
      name: 'judge_scores',
      prompt,
      schema: { type: 'object', properties: { scores: { type: 'array', items: { type: 'number' } } }, required: ['scores'], additionalProperties: false },
      maxTokens: 500,
    });
    const scores: number[] = (out.scores || []).filter((n: any) => typeof n === 'number');
    return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  } catch (err: any) {
    console.warn(`  judge failed: ${err?.message || err}`);
    return null;
  }
}

async function runCase(c: EvalCase): Promise<CaseResult> {
  const started = Date.now();
  let filters: SearchFilters | undefined;
  let recs: RecommendationResponse | undefined;
  try {
    for (const step of c.steps) {
      const out = await discover(step.query, step.refine ? filters : {}, c.taste);
      filters = out.filters;
      recs = out.recommendations;
    }
  } catch (err: any) {
    return { id: c.id, query: c.steps.map(s => s.query).join(' → '), titles: [], checks: [{ name: 'request', pass: false, detail: err.message }], constraintCompliance: null, judgeScore: null, ms: Date.now() - started, error: err.message };
  }

  const movies = recs ? orderedMovies(recs) : [];
  const titles = movies.map(m => `${m.title} (${m.year})`);
  const checks: CheckResult[] = [];

  checks.push({ name: 'count>=6', pass: movies.length >= 6, detail: String(movies.length) });
  const unique = new Set(movies.map(m => lc(m.title)));
  checks.push({ name: 'no-duplicates', pass: unique.size === movies.length });
  const realPosters = movies.filter(m => m.posterUrl?.includes('image.tmdb.org')).length;
  checks.push({ name: 'real-posters', pass: realPosters === movies.length, detail: `${realPosters}/${movies.length}` });
  checks.push({ name: 'source=tmdb', pass: recs?.diagnostics?.source === 'tmdb', detail: recs?.diagnostics?.source });

  const hasHard = Object.keys(c.expect).some(k => k !== 'judge' && k !== 'genresAny');
  let compliance: number | null = null;
  if (hasHard && movies.length) {
    const bad = movies.map(m => ({ m, v: violations(m, c.expect) })).filter(x => x.v.length);
    compliance = 1 - bad.length / movies.length;
    checks.push({
      name: 'hard-constraints',
      pass: bad.length === 0,
      detail: bad.slice(0, 4).map(b => `${b.m.title}: ${b.v.join(',')}`).join('; ') || 'all ok',
    });
  }
  if (c.expect.genresAny && movies.length) {
    const hits = movies.filter(m => m.genres.some(g => c.expect.genresAny!.some(x => lc(g).includes(lc(x))))).length;
    checks.push({ name: 'genre-fit>=70%', pass: hits / movies.length >= 0.7, detail: `${hits}/${movies.length}` });
  }

  const judgeScore = await judge(c.steps[c.steps.length - 1].query, movies, c.expect.judge);
  if (judgeScore !== null) checks.push({ name: 'judge>=3.5', pass: judgeScore >= 3.5, detail: judgeScore.toFixed(2) });

  return { id: c.id, query: c.steps.map(s => s.query).join(' → '), titles, checks, constraintCompliance: compliance, judgeScore, ms: Date.now() - started, diagnostics: recs?.diagnostics, filters };
}

async function main() {
  const filter = process.argv[2];
  const selected = filter ? cases.filter(c => c.id.includes(filter)) : cases;

  try {
    await fetch(`${BASE}/api/curated-art`, { signal: AbortSignal.timeout(5000) });
  } catch {
    console.error(`Server not reachable at ${BASE}. Start it with: PORT=3100 npm run dev`);
    process.exit(1);
  }

  console.log(`Running ${selected.length} cases against ${BASE} (LLM judge: ${judgeEnabled ? describeLlm(judgeLlm) : 'off — configure an AI key in .env'})\n`);
  const results: CaseResult[] = [];
  // Two at a time keeps TMDB and Gemini well under their rate limits.
  for (let i = 0; i < selected.length; i += 2) {
    const batch = await Promise.all(selected.slice(i, i + 2).map(runCase));
    for (const r of batch) {
      results.push(r);
      const passed = r.checks.filter(c => c.pass).length;
      const mark = passed === r.checks.length ? 'PASS' : 'FAIL';
      console.log(`${mark}  ${r.id}  (${passed}/${r.checks.length}, ${(r.ms / 1000).toFixed(1)}s)`);
      for (const c of r.checks.filter(c => !c.pass)) console.log(`      ✗ ${c.name}: ${c.detail || ''}`);
      console.log(`      → ${r.titles.slice(0, 6).join(' | ') || '(no results)'}`);
    }
  }

  const allChecks = results.flatMap(r => r.checks);
  const compliance = results.map(r => r.constraintCompliance).filter((x): x is number => x !== null);
  const judged = results.map(r => r.judgeScore).filter((x): x is number => x !== null);
  const summary = {
    at: new Date().toISOString(),
    cases: results.length,
    casesFullyPassing: results.filter(r => r.checks.every(c => c.pass)).length,
    checkPassRate: allChecks.filter(c => c.pass).length / Math.max(1, allChecks.length),
    hardConstraintCompliance: compliance.length ? compliance.reduce((a, b) => a + b, 0) / compliance.length : null,
    meanJudgeScore: judged.length ? judged.reduce((a, b) => a + b, 0) / judged.length : null,
    medianLatencyMs: results.map(r => r.ms).sort((a, b) => a - b)[Math.floor(results.length / 2)],
    rankedByAI: results.filter(r => r.diagnostics?.rankedBy && r.diagnostics.rankedBy !== 'local').length,
    semanticRerank: results.filter(r => r.diagnostics?.semantic).length,
  };

  console.log('\n──────── Summary ────────');
  console.log(`Cases fully passing:        ${summary.casesFullyPassing}/${summary.cases}`);
  console.log(`Check pass rate:            ${(summary.checkPassRate * 100).toFixed(0)}%`);
  console.log(`Hard-constraint compliance: ${summary.hardConstraintCompliance === null ? 'n/a' : (summary.hardConstraintCompliance * 100).toFixed(0) + '%'}`);
  console.log(`Mean relevance (judge 1-5): ${summary.meanJudgeScore === null ? 'n/a (no AI key)' : summary.meanJudgeScore.toFixed(2)}`);
  console.log(`Median latency:             ${(summary.medianLatencyMs / 1000).toFixed(1)}s`);
  console.log(`Ranked by AI:               ${summary.rankedByAI}/${summary.cases}   semantic re-rank: ${summary.semanticRerank}/${summary.cases}`);

  const dir = path.join(process.cwd(), 'eval', 'results');
  fs.mkdirSync(dir, { recursive: true });
  const report = JSON.stringify({ summary, results }, null, 2);
  fs.writeFileSync(path.join(dir, 'latest.json'), report);
  fs.writeFileSync(path.join(dir, `${summary.at.replace(/[:.]/g, '-')}.json`), report);
  console.log(`\nReport: eval/results/latest.json`);
}

main();

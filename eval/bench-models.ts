// Benchmarks candidate models on a realistic ranking prompt (the slowest LLM call in the pipeline).
//   npx tsx eval/bench-models.ts [model ...]
// Uses the server's default provider/key from .env.
import dotenv from 'dotenv';
dotenv.config();

import { discoverCandidates, enrichMovies } from '../server/tmdb.js';
import { generateJson, serverDefault } from '../server/llm/index.js';

const MODELS = process.argv.slice(2).length ? process.argv.slice(2) : [
  'nvidia/nemotron-3-ultra-550b-a55b',
  'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/nemotron-3.5-lightning-30b-a3b',
  'deepseek-ai/deepseek-v4-flash-0731',
  'moonshotai/kimi-k2.6',
  'openai/gpt-oss-20b',
];

const REC = {
  type: 'object',
  properties: {
    title_id: { type: 'string' }, match_score: { type: 'number' }, why_it_matches: { type: 'array', items: { type: 'string' } },
    possible_mismatch: { type: 'string' }, watch_commitment: { type: 'string' }, recommended_for: { type: 'string' },
  },
  required: ['title_id', 'match_score', 'why_it_matches', 'possible_mismatch', 'watch_commitment', 'recommended_for'],
  additionalProperties: false,
};
const COMPACT = {
  type: 'object',
  properties: {
    ranked: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, score: { type: 'number' }, reason: { type: 'string' } }, required: ['id', 'score', 'reason'], additionalProperties: false } },
  },
  required: ['ranked'],
  additionalProperties: false,
};
const SCHEMA = {
  type: 'object',
  properties: { summary: { type: 'string' }, best_match: REC, recommendations: { type: 'array', items: REC }, refinement_suggestions: { type: 'array', items: { type: 'string' } } },
  required: ['summary', 'best_match', 'recommendations', 'refinement_suggestions'],
  additionalProperties: false,
};

async function main() {
  const def = serverDefault();
  if (!def) throw new Error('No default LLM configured in .env');
  const query = 'inspiring sports underdog story';
  const { candidates } = await discoverCandidates({ themes: ['sports', 'underdog'], moods: ['inspiring'] } as any, query);
  const pool = (await enrichMovies(candidates.slice(0, 25))).map(c => ({
    id: c.id, title: c.title, year: c.year, genres: c.genres, keywords: (c.themes || []).slice(0, 8), synopsis: c.synopsis.slice(0, 220),
  }));
  const prompt = `Rank these candidates for the request "${query}". Pick best_match and 6-10 recommendations; title_id must be copied from a candidate id. Three short why_it_matches bullets each.\nCANDIDATES: ${JSON.stringify(pool)}`;
  console.log(`Prompt ~${Math.round(prompt.length / 4)} tokens, ${pool.length} candidates\n`);

  const compact = process.env.COMPACT === '1';
  const compactPrompt = `Rank the best 10 candidates for the request "${query}" by how well tone and story fit. Return ids copied exactly from the candidates, a 0-100 score, and a reason of at most 12 words.
CANDIDATES: ${JSON.stringify(pool)}`;
  for (const model of MODELS) {
    const started = Date.now();
    if (compact) {
      try {
        const out = await generateJson({ ...def, model }, { name: 'ranking', prompt: compactPrompt, schema: COMPACT, maxTokens: 1200 });
        const ids = new Set(pool.map(p => p.id));
        const picks = out.ranked || [];
        const valid = picks.filter((p: any) => ids.has(p?.id)).length;
        console.log(`${model.padEnd(42)} ${(Date.now() - started) / 1000}s  valid ${valid}/${picks.length} → ${picks.slice(0, 5).map((p: any) => pool.find(c => c.id === p.id)?.title).join(' | ')}`);
      } catch (err: any) {
        console.log(`${model.padEnd(42)} FAILED after ${(Date.now() - started) / 1000}s: ${err.message}`);
      }
      continue;
    }
    try {
      const out = await generateJson({ ...def, model }, { name: 'ranked_recommendations', prompt, schema: SCHEMA, maxTokens: 3000 });
      const ids = new Set(pool.map(p => p.id));
      const picks = [out.best_match, ...(out.recommendations || [])];
      const valid = picks.filter((p: any) => ids.has(p?.title_id)).length;
      const titles = picks.slice(0, 5).map((p: any) => pool.find(c => c.id === p?.title_id)?.title || `?${p?.title_id}`);
      console.log(`${model.padEnd(42)} ${(Date.now() - started) / 1000}s  valid ids ${valid}/${picks.length}  → ${titles.join(' | ')}`);
    } catch (err: any) {
      console.log(`${model.padEnd(42)} FAILED after ${(Date.now() - started) / 1000}s: ${err.message}`);
    }
  }
}
main();

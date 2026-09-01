// Deterministic local RAG-style index. It uses exported vidIQ/YouTube observations;
// it does not call an LLM and never writes to YouTube.
import fs from 'node:fs';
import path from 'node:path';

const project = path.resolve(import.meta.dirname, '..');
const out = path.join(project, 'outputs', 'ralskies-content-engine', 'title_rag.json');
const now = new Date().toISOString();
const winners = [
  { videoId: '_QHxiOJqryE', title: 'GRAVITY (Hazbin Hotel) | Cover ♫【Ralskies ft. Mink】', views: 190496, likes: 4087, comments: 27, pattern: 'searchable + property + format + creator/collab', family: 'Searchable' },
  { videoId: 'mPqTsWUKKf8', title: 'Ruler of My Heart / Alien Stage cover', views: 51599, likes: 468, comments: 22, pattern: 'exact song + property + cover', family: 'Searchable' },
  { videoId: 'IxfclKSA6oU', title: 'SING AS MIZI | Ruler of my Heart English Version ♫【Ralskies】', views: 35413, likes: 1925, comments: 33, pattern: 'character/POV + song + language/version', family: 'POV' },
  { videoId: 'K18efNWle2Q', title: 'Fire - Ilium (Ralskies Cover ft. Natalie)', views: 34239, likes: 823, comments: 4, pattern: 'song + property + cover + collaborator', family: 'Searchable' },
  { videoId: 'yqXvID6v9Pg', title: 'Your Idol English Cover — KPop Demon Hunters', views: 32255, likes: 717, comments: 27, pattern: 'exact song + version + property', family: 'Fandom' },
  { videoId: 'D0UZf7Giu4', title: 'Soda Pop English Cover — KPop Demon Hunters', views: 22378, likes: 226, comments: 10, pattern: 'exact song + version + property', family: 'Fandom' },
  { videoId: 'Tof7aOJcy0U', title: 'Soda Pop (English Version) - KPop Demon Hunters (Ralskies Cover)', views: 18844, likes: 157, comments: 5, pattern: 'exact song + version + property + creator', family: 'Searchable' },
  { videoId: 'rGilZR1KLTg', title: 'Ralskies cover highlight', views: 15987, likes: 718, comments: 20, pattern: 'performance-first hook', family: 'Vocal' },
  { videoId: 'XQ-Oof8K8lU', title: 'Your Idol (English Version) - KPop Demon Hunters (Ralskies Cover)', views: 14472, likes: 110, comments: 10, pattern: 'exact song + property + creator', family: 'Fandom' },
  { videoId: 'mVuc97kXY1w', title: 'The Challenge Epic Orchestral Cover ft. collaborators (Ralskies)', views: 12997, likes: 407, comments: 7, pattern: 'song + arrangement qualifier + collaborators', family: 'Context' }
];
const rules = {
  preferred: ['Human hook + exact song/property hashtag', 'Searchable song/property terms near the beginning', '3–5 relevant hashtags maximum', 'Use a different hook family from the adjacent upload'],
  avoid: ['keyword soup', 'generic #FYP/#ForYou', 'claiming a performance detail not present in the clip', 'reusing the same hook wording repeatedly'],
  confidence: 'Directional only: this index contains observed channel winners, not causal A/B tests.'
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ schemaVersion: 1, generatedAt: now, source: 'vidIQ channel analytics + channel video search', channelId: 'UCIt8eA8uvrDVbpta0pgIc5Q', channel: 'Ralskies', winners, rules }, null, 2) + '\n');
console.log(`Wrote ${out}`);

export const DEFAULT_USER_LIFE_CONTEXT = [
  'I am Sarvesh, building and using personal productivity and learning tools around videos, notes, progress tracking, and app workflows.',
  'I learn from long-form videos and want practical takeaways I can apply to my projects, daily study routines, content systems, automation ideas, and personal productivity.',
  'I prefer concrete, action-oriented examples tied to real apps, study tasks, and repeatable workflows rather than generic advice.',
].join(' ');

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'because', 'before', 'being', 'between',
  'could', 'every', 'first', 'from', 'have', 'into', 'just', 'like', 'more',
  'most', 'only', 'other', 'that', 'their', 'there', 'these', 'thing', 'this',
  'those', 'through', 'video', 'watch', 'what', 'when', 'where', 'which',
  'while', 'with', 'would', 'your',
]);

interface LifeRecommendationInput {
  lifeContext: string;
  videoTitle?: string;
  clipText?: string;
  summary?: string;
}

function extractKeywords(text: string): string[] {
  const counts = new Map<string, number>();
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map(word => word.trim())
    .filter(word => word.length > 3 && !STOP_WORDS.has(word));

  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([word]) => word);
}

function subjectFrom(input: LifeRecommendationInput): string {
  const keywords = extractKeywords([
    input.summary,
    input.clipText,
    input.videoTitle,
  ].filter(Boolean).join(' '));

  if (keywords.length === 0) return 'this idea';
  if (keywords.length === 1) return keywords[0];
  return keywords.slice(0, 3).join(', ');
}

export function buildLifeRecommendations(input: LifeRecommendationInput): string[] {
  const context = input.lifeContext || DEFAULT_USER_LIFE_CONTEXT;
  const subject = subjectFrom(input);
  const contextLower = context.toLowerCase();
  const projectTarget = contextLower.includes('app') || contextLower.includes('project')
    ? 'one current app or project'
    : 'one current personal workflow';
  const learningTarget = contextLower.includes('study')
    ? 'your next study block'
    : 'your next video-review session';
  const systemTarget = contextLower.includes('automation')
    ? 'automation or checklist'
    : 'checklist, note template, or reminder';

  return [
    `Apply ${subject} to ${projectTarget}: write one before/after note and turn it into a small action you can finish today.`,
    `Use ${subject} in ${learningTarget}: create one recall question and answer it from memory before rewatching the clip.`,
    `Make ${subject} reusable: convert it into a ${systemTarget} so it appears the next time a similar decision comes up.`,
  ];
}

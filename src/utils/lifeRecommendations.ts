const LEGACY_USER_LIFE_CONTEXT = [
  'I am Sarvesh, building and using personal productivity and learning tools around videos, notes, progress tracking, and app workflows.',
  'I learn from long-form videos and want practical takeaways I can apply to my projects, daily study routines, content systems, automation ideas, and personal productivity.',
  'I prefer concrete, action-oriented examples tied to real apps, study tasks, and repeatable workflows rather than generic advice.',
].join(' ');

export const CONTEXT_ABOUT_ME_NOTION_URL = 'https://www.notion.so/3700e89f89e780929e14da3cb2e44779';

export const DEFAULT_USER_LIFE_CONTEXT = [
  'Source: Notion context-about-me profile.',
  'I am Sarvesh Kesharwani, based in Indore, India, working as an AI/ML engineer and building personal learning/productivity apps such as ClipWise, Tubeo, notes, dashboards, sync flows, and video-based study tools.',
  'My work and interests include Generative AI, RAG, LangChain/LangGraph, Python, SQL, cloud, automation, support-ticket reduction, fraud detection, issue classification, and practical product workflows.',
  'I learn from long-form videos and saved dialogues so I can improve English work communication, build better AI/product systems, prepare for Gen AI or ML roles, and convert ideas into repeatable daily actions.',
  'Recommendations should be personal, concrete, and tied to my real life: office communication, AI/ML engineering, app-building decisions, study routines, interviews, remote-work goals, and habit systems.',
].join(' ');

export function normalizeUserLifeContext(context?: string): string {
  const trimmed = context?.trim();
  if (!trimmed || trimmed === LEGACY_USER_LIFE_CONTEXT) return DEFAULT_USER_LIFE_CONTEXT;
  return trimmed;
}

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
  const context = normalizeUserLifeContext(input.lifeContext);
  const subject = subjectFrom(input);
  const contextLower = context.toLowerCase();
  const projectTarget = contextLower.includes('clipwise') || contextLower.includes('tubeo') || contextLower.includes('app')
    ? 'a ClipWise, Tubeo, or personal productivity app decision'
    : 'one current personal workflow';
  const engineeringTarget = contextLower.includes('rag') || contextLower.includes('ai/ml') || contextLower.includes('gen ai')
    ? 'your AI/ML, RAG, or automation work'
    : 'your technical work';
  const communicationTarget = contextLower.includes('english') || contextLower.includes('interview') || contextLower.includes('remote')
    ? 'English work communication, interview answers, or remote-team updates'
    : 'one real conversation';

  return [
    `Use ${subject} in ${projectTarget}: write a one-line decision note, then choose the smallest product action you can finish today.`,
    `Apply ${subject} to ${engineeringTarget}: turn it into a debugging, prompt-design, or workflow-improvement checklist you can reuse at work.`,
    `Practice ${subject} for ${communicationTarget}: say it as a short natural sentence you could use with a manager, teammate, interviewer, or study partner.`,
  ];
}

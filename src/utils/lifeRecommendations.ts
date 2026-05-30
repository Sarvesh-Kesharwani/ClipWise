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
}

function extractKeywords(text: string, limit = 4): string[] {
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
    .slice(0, limit)
    .map(([word]) => word);
}

function shortPoint(text: string): string {
  const lower = text.toLowerCase();

  if (lower.includes('model context protocol') || /\bmcp\b/.test(lower)) {
    return 'MCP client-server-tool structure';
  }
  if (lower.includes('client') && lower.includes('server')) {
    return 'client-server responsibilities';
  }
  if (lower.includes('rag') || lower.includes('retrieval')) {
    return 'RAG retrieval flow';
  }
  if (lower.includes('agent') || lower.includes('tool')) {
    return 'agent tool-use flow';
  }
  if (lower.includes('prompt')) {
    return 'prompt design pattern';
  }
  if (lower.includes('database') || lower.includes('supabase') || lower.includes('sql')) {
    return 'database design choice';
  }
  if (lower.includes('architecture') || lower.includes('system')) {
    return 'system architecture idea';
  }

  const keywords = extractKeywords(text, 3);
  if (keywords.length === 0) return 'this clip point';
  return keywords.join(' + ');
}

function transcriptPoints(clipText?: string, videoTitle?: string): string[] {
  const text = clipText?.trim();
  if (!text) return [];

  const sentences = text
    .replace(/\s+/g, ' ')
    .replace(/[?!]/g, '.')
    .split('.')
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length >= 24);

  const source = sentences.length > 0 ? sentences : [text];
  const titleWords = extractKeywords(videoTitle ?? '', 8);
  const scored = source.map((sentence, index) => {
    const lower = sentence.toLowerCase();
    const keywordScore = extractKeywords(sentence, 8).length;
    const titleScore = titleWords.filter(word => lower.includes(word)).length * 2;
    const domainScore = [
      'mcp', 'model context protocol', 'architecture', 'client', 'server',
      'agent', 'tool', 'rag', 'retrieval', 'prompt', 'database', 'workflow',
    ].filter(term => lower.includes(term)).length * 3;
    return { sentence, score: keywordScore + titleScore + domainScore - index * 0.2 };
  });

  const points = scored
    .sort((a, b) => b.score - a.score)
    .map(item => shortPoint(item.sentence));

  return Array.from(new Set(points)).slice(0, 3);
}

function padPoints(points: string[], videoTitle?: string): string[] {
  const fallback = shortPoint(videoTitle ?? '');
  const padded = [...points];
  while (padded.length < 3) {
    padded.push(fallback === 'this clip point' ? `clip point ${padded.length + 1}` : fallback);
  }
  return padded.slice(0, 3);
}

export function buildLifeRecommendations(input: LifeRecommendationInput): string[] {
  const context = normalizeUserLifeContext(input.lifeContext);
  const contextLower = context.toLowerCase();
  const points = padPoints(transcriptPoints(input.clipText, input.videoTitle), input.videoTitle);
  const appTarget = contextLower.includes('clipwise') || contextLower.includes('tubeo')
    ? 'ClipWise/Tubeo'
    : 'your app';
  const workTarget = contextLower.includes('rag') || contextLower.includes('ai/ml') || contextLower.includes('gen ai')
    ? 'AI/RAG work'
    : 'technical work';
  const communicationTarget = contextLower.includes('interview') || contextLower.includes('remote')
    ? 'interviews or standups'
    : 'a work update';

  return [
    `Use ${points[0]} to plan one cleaner ${appTarget} feature flow.`,
    `Turn ${points[1]} into a short checklist for ${workTarget}.`,
    `Explain ${points[2]} as one project example in ${communicationTarget}.`,
  ];
}

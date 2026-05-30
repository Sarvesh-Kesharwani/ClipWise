const LEGACY_USER_LIFE_CONTEXT = [
  'I am Sarvesh, building and using personal productivity and learning tools around videos, notes, progress tracking, and app workflows.',
  'I learn from long-form videos and want practical takeaways I can apply to my projects, daily study routines, content systems, automation ideas, and personal productivity.',
  'I prefer concrete, action-oriented examples tied to real apps, study tasks, and repeatable workflows rather than generic advice.',
].join(' ');

export const CONTEXT_ABOUT_ME_NOTION_URL = 'https://www.notion.so/3700e89f89e780929e14da3cb2e44779';
export const LIFE_RECOMMENDATIONS_VERSION = 2;

export const DEFAULT_USER_LIFE_CONTEXT = [
  'Source: Notion context-about-me profile.',
  'I am Sarvesh Kesharwani, based in Indore, India, working as an AI/ML engineer and building personal learning/productivity apps such as ClipWise, Tubeo, notes, dashboards, sync flows, and video-based study tools.',
  'My work and interests include Generative AI, RAG, LangChain/LangGraph, Python, SQL, cloud, automation, support-ticket reduction, fraud detection, issue classification, and practical product workflows.',
  'I learn from long-form videos and saved dialogues so I can improve English work communication, build better AI/product systems, prepare for Gen AI or ML roles, and convert ideas into repeatable daily actions.',
  'Recommendations should be personal, concrete, and tied to my real life: office communication, AI/ML engineering, app-building decisions, study routines, interviews, remote-work goals, and habit systems.',
].join(' ');

interface LifeRecommendationInput {
  lifeContext: string;
  videoTitle?: string;
  clipText?: string;
}

interface TopicRule {
  terms: string[];
  recommendations: string[];
}

export function normalizeUserLifeContext(context?: string): string {
  const trimmed = context?.trim();
  if (!trimmed || trimmed === LEGACY_USER_LIFE_CONTEXT) return DEFAULT_USER_LIFE_CONTEXT;
  return trimmed;
}

export function isLegacyLifeRecommendation(recommendation: string): boolean {
  return recommendation.includes(' + ')
    || recommendation.startsWith('Use coding')
    || recommendation.startsWith('Apply coding')
    || recommendation.startsWith('Practice coding')
    || recommendation.includes('one cleaner ClipWise/Tubeo feature flow');
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some(term => text.includes(term));
}

function sentenceParts(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/[.!?]/)
    .map(part => part.trim())
    .filter(part => part.length >= 32);
}

function transcriptSummary(clipText?: string): string {
  const text = clipText?.trim();
  if (!text) return '';

  return text
    .replace(/\s+/g, ' ')
    .slice(0, 5000)
    .toLowerCase();
}

function uniqueRecommendations(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function noTranscriptRecommendations(): string[] {
  return [
    'No transcript is available for this specific clip yet, so ClipWise will not reuse generic video-level recommendations.',
    'Wait a few seconds and reopen this clip so ClipWise can try to fetch captions, or add a YouLearn source with transcript.',
    'If captions are unavailable for this video, write your own summary and treat that as the only reliable use-case anchor.',
  ];
}

function topicRules(): TopicRule[] {
  return [
    {
      terms: ['subagent', 'sub-agent', 'sub agent', 'subagents', 'ai workers', 'parallel'],
      recommendations: [
        'When working on Tubeo, split one feature into UI, sync, and testing subagents so development runs in parallel.',
        'For ClipWise bugs, run one Codex/Claude subagent to inspect player logic and another to verify Supabase sync.',
        'Use subagents when a feature feels large: give each agent one repo-scoped task, then review and merge their diffs.',
        'For production pushes, assign one subagent to implementation and another to read deployment logs or smoke-test the live app.',
      ],
    },
    {
      terms: ['agentic coding', 'vibe coding', 'claude code', 'coding agent'],
      recommendations: [
        'When building ClipWise or Tubeo, write a clear feature spec first, then let Codex implement while you review diffs and tests.',
        'Use this to avoid random vibe coding: keep one checklist for requirements, files changed, build result, and deploy status.',
        'Apply it at work by treating AI as a junior developer: assign small tasks, inspect output, and keep final ownership yourself.',
        'For AI-assisted coding practice, compare the agent output with your own understanding before accepting a solution.',
      ],
    },
    {
      terms: ['slash command', 'slash commands', 'custom command'],
      recommendations: [
        'Create slash commands for repeated Tubeo tasks like "fix sync bug", "run build", and "deploy prod".',
        'Use a command for ClipWise video-flow QA so the same checks run every time before pushing.',
        'Turn your common prompts into commands to save time when switching between personal projects.',
        'Create one command for long debugging sessions that first inspects files, then proposes a scoped fix.',
      ],
    },
    {
      terms: ['context window', 'token', 'compact', 'memory'],
      recommendations: [
        'Use context-window discipline in Tubeo by keeping each Codex task focused on one screen or data flow.',
        'Before long ClipWise fixes, summarize current findings so the next agent run does not lose important decisions.',
        'Apply this at work by sending AI only the logs, files, and goal needed for the current debugging step.',
        'When switching tasks, save the final decision and exact files touched so future sessions restart faster.',
      ],
    },
    {
      terms: ['claude.md', 'instructions', 'rules file'],
      recommendations: [
        'Create a project instruction file for Tubeo so every agent follows your sync, UI, and deploy rules.',
        'Use it in ClipWise to prevent agents from touching shared Supabase schemas or unrelated data.',
        'Keep your preferred testing and commit rules in one place so future AI sessions start with the right context.',
        'Add your UI preferences to the project rules so agents stop making generic layouts.',
      ],
    },
    {
      terms: ['spec-driven', 'spec driven', 'specification', 'requirements'],
      recommendations: [
        'Before adding a Tubeo feature, write the expected user flow, saved state, and success checks as a short spec.',
        'Use specs in ClipWise when changing player behavior so recommendations, summaries, and Supabase sync stay aligned.',
        'Apply this to work tasks by asking for acceptance criteria before coding the solution.',
        'For complex ideas, turn the video lesson into a mini PRD before opening Codex.',
      ],
    },
    {
      terms: ['plan mode', 'ultraplan', 'planning mode'],
      recommendations: [
        'Use plan mode before risky Tubeo or ClipWise changes to identify files, data impact, and tests first.',
        'When a bug is unclear, ask Codex for a plan that separates investigation, fix, and verification.',
        'Apply it in work projects before touching shared DBs, auth, or production deployment settings.',
        'Use planning mode to compare two implementation paths before spending time coding.',
      ],
    },
    {
      terms: ['image as context', 'screenshot', 'image context'],
      recommendations: [
        'For ClipWise UI bugs, attach the screenshot so Codex can match the exact broken state instead of guessing.',
        'Use screenshots from Tubeo dashboards to ask for precise spacing, visibility, or component fixes.',
        'At work, share screenshots with logs so AI can connect the visible issue to the likely code path.',
        'When reviewing a UI change, ask the agent to verify the screen visually instead of relying only on code.',
      ],
    },
    {
      terms: ['model context protocol', 'mcp'],
      recommendations: [
        'Use MCP to connect Codex with Notion, Supabase, or GitHub when Tubeo needs real project context.',
        'For ClipWise, treat MCP tools as controlled bridges to data instead of pasting private context manually.',
        'Apply MCP at work when an AI assistant needs live docs, tickets, or DB context to answer accurately.',
        'Use MCP-style connectors to keep your personal context updated without rewriting the same prompt each time.',
      ],
    },
    {
      terms: ['hook', 'hooks'],
      recommendations: [
        'Use hooks to run automatic checks after Codex edits Tubeo or ClipWise files.',
        'Create a hook for build/lint reminders so broken changes are caught before production deploy.',
        'Apply hooks at work for repeated safety steps like formatting, tests, or logging checks.',
        'Use hooks for personal guardrails, such as warning before destructive git or database commands.',
      ],
    },
    {
      terms: ['plugin', 'plugins'],
      recommendations: [
        'Use plugins to package repeated ClipWise workflows like Supabase checks, Vercel deploy, and UI QA.',
        'For Tubeo, create focused plugin-style routines for news, YouLearn, and sync maintenance.',
        'Apply this at work by turning repeated AI instructions into reusable capability bundles.',
        'Keep separate plugins for coding, deployment, and content workflows so each task starts with the right tools.',
      ],
    },
    {
      terms: ['rag', 'retrieval', 'embedding', 'vector'],
      recommendations: [
        'Use this RAG idea to make Tubeo retrieve the right saved notes or transcripts before generating answers.',
        'For ClipWise, connect clip recommendations to transcript chunks instead of relying on your handwritten summary.',
        'Apply it in Gen AI work by checking retrieval quality before blaming the model output.',
        'Use retrieval examples from your own notes to prepare better Gen AI interview explanations.',
      ],
    },
    {
      terms: ['database', 'supabase', 'sql', 'schema'],
      recommendations: [
        'Use this database idea in ClipWise by keeping new app data in isolated tables and never touching shared schemas.',
        'For Tubeo, define the saved-state shape before changing UI so sync and restore keep working.',
        'Apply it at work by separating migration, data safety, and app-code changes before deployment.',
        'When a feature stores user progress, test load, save, refresh, and logout before calling it done.',
      ],
    },
  ];
}

function genericTranscriptRecommendations(clipText: string, contextLower: string): string[] {
  const appName = contextLower.includes('tubeo') ? 'Tubeo' : 'ClipWise';
  const sentences = sentenceParts(clipText).slice(0, 10);

  if (sentences.length === 0) {
    return [
      'Turn the clip into one practical checklist you can reuse while coding, debugging, or studying.',
      'Practice explaining this point as a real project example for an interview, standup, or teammate update.',
    ];
  }

  return sentences.map(sentence => {
    const snippet = sentence.split(/\s+/).slice(0, 16).join(' ');
    return `Use "${snippet}" as a concrete ${appName} or work example, then decide one action you can try today.`;
  });
}

export function buildLifeRecommendations(input: LifeRecommendationInput): string[] {
  const context = normalizeUserLifeContext(input.lifeContext);
  const contextLower = context.toLowerCase();
  const transcriptLower = transcriptSummary(input.clipText);
  const hasTranscript = transcriptLower.length > 0;

  if (!hasTranscript) return noTranscriptRecommendations();

  const recommendations: string[] = [];
  for (const rule of topicRules()) {
    if (hasAny(transcriptLower, rule.terms)) {
      recommendations.push(...rule.recommendations);
    }
  }

  if (recommendations.length > 0) {
    return uniqueRecommendations(recommendations);
  }

  return uniqueRecommendations(genericTranscriptRecommendations(input.clipText ?? '', contextLower));
}

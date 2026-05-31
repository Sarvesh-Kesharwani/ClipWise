export interface YouLearnVideoImport {
  title: string;
  externalUrl: string;
  duration: number;
  thumbnail?: string;
  contentId?: string;
  transcript?: YouLearnTranscriptSegment[];
}

export interface YouLearnTranscriptSegment {
  index: number;
  startTime: number;
  text: string;
}

interface YouLearnContent {
  type?: string;
  title?: string;
  content_url?: string;
  thumbnail_url?: string;
  content_id?: string;
  _id?: string;
  length?: number;
  duration?: number;
  contents?: YouLearnContent[];
  children?: YouLearnContent[];
  items?: YouLearnContent[];
  visibility?: string;
  transcript?: YouLearnTranscriptSegment[];
}

interface YouLearnSpaceResponse {
  contents?: YouLearnContent[];
}

interface YouLearnSource {
  id: string;
  kind: 'space' | 'folder' | 'playlist';
}

function extractYouLearnSource(url: string): YouLearnSource | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (!/(^|\.)youlearn\.ai$/i.test(parsed.hostname)) return null;

    const parts = parsed.pathname.split('/').filter(Boolean);
    const containerIndex = parts.findIndex(part =>
      ['space', 'spaces', 'playlist', 'playlists', 'folder', 'folders', 'space_folder', 'space_folders'].includes(part)
    );
    const id = containerIndex >= 0 ? parts[containerIndex + 1] : null;
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return null;

    const marker = parts[containerIndex];
    const kind = marker.includes('folder') ? 'folder' : marker.includes('playlist') ? 'playlist' : 'space';
    return { id, kind };
  } catch {
    return null;
  }
}

export function extractYouLearnSpaceId(url: string): string | null {
  return extractYouLearnSource(url)?.id ?? null;
}

export function isYouLearnSpaceUrl(url: string): boolean {
  return extractYouLearnSource(url) !== null;
}

export async function fetchYouLearnVideos(url: string): Promise<YouLearnVideoImport[]> {
  const source = extractYouLearnSource(url);
  if (!source) throw new Error('Paste a public YouLearn space, folder, or playlist link.');

  const params = new URLSearchParams({ spaceId: source.id, sourceKind: source.kind });
  const response = await fetch(`/api/youlearn-space?${params.toString()}`);
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const data = await response.json() as YouLearnSpaceResponse;
  return normalizeYouLearnVideos(data);
}

export async function fetchYouLearnTranscript(contentId: string): Promise<YouLearnTranscriptSegment[]> {
  const response = await fetch(`/api/youlearn-transcript?contentId=${encodeURIComponent(contentId)}`);
  if (!response.ok) return [];

  const data = await response.json() as { transcript?: YouLearnTranscriptSegment[] };
  return Array.isArray(data.transcript) ? data.transcript : [];
}

function normalizeYouLearnVideos(data: YouLearnSpaceResponse): YouLearnVideoImport[] {
  const seen = new Set<string>();
  return collectVideos(data.contents ?? [])
    .filter(content => (content.type === 'video' || content.type === 'youtube') && typeof content.content_url === 'string')
    .map(content => ({
      title: content.title?.trim() || 'YouLearn Video',
      externalUrl: content.content_url!,
      duration: normalizeDuration(content.length ?? content.duration),
      thumbnail: content.thumbnail_url,
      contentId: content.content_id ?? content._id,
      transcript: Array.isArray(content.transcript) ? content.transcript : undefined,
    }))
    .filter(video => {
      if (seen.has(video.externalUrl)) return false;
      seen.add(video.externalUrl);
      return true;
    });
}

function collectVideos(contents: YouLearnContent[], out: YouLearnContent[] = []): YouLearnContent[] {
  for (const content of contents) {
    out.push(content);
    for (const key of ['contents', 'children', 'items'] as const) {
      const nested = content[key];
      if (Array.isArray(nested)) collectVideos(nested, out);
    }
  }
  return out;
}

function normalizeDuration(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

async function readError(response: Response): Promise<string> {
  try {
    const data = await response.json() as { error?: string };
    return data.error || 'Could not read this YouLearn space.';
  } catch {
    return 'Could not read this YouLearn space.';
  }
}

interface ApiRequest {
  method?: string;
  url?: string;
}

interface ApiResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
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
}

type YouLearnSourceKind = 'space' | 'folder' | 'playlist';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const requestUrl = new URL(req.url ?? '/', 'http://localhost');
  const spaceId = requestUrl.searchParams.get('spaceId');
  const sourceKind = normalizeSourceKind(requestUrl.searchParams.get('sourceKind'));

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (!spaceId || !/^[a-zA-Z0-9_-]+$/.test(spaceId)) {
    sendJson(res, 400, { error: 'Missing or invalid YouLearn space ID.' });
    return;
  }

  try {
    const { data, status } = await loadYouLearnSource(spaceId, sourceKind);
    if (!data) {
      sendJson(res, status || 404, { error: 'This YouLearn source is not public or could not be loaded.' });
      return;
    }

    sendJson(res, 200, { contents: normalizeContents(collectContentArrays(data)) });
  } catch {
    sendJson(res, 502, { error: 'Could not reach YouLearn.' });
  }
}

async function loadYouLearnSource(sourceId: string, sourceKind: YouLearnSourceKind) {
  const candidates = sourceKind === 'folder'
    ? [
        `https://api.youlearn.ai/space_folder/anonymous/${sourceId}`,
        `https://api.youlearn.ai/space_folders/anonymous/${sourceId}`,
        `https://api.youlearn.ai/folder/anonymous/${sourceId}`,
        `https://api.youlearn.ai/space/anonymous/${sourceId}`,
      ]
    : sourceKind === 'playlist'
      ? [
          `https://api.youlearn.ai/playlist/anonymous/${sourceId}`,
          `https://api.youlearn.ai/playlists/anonymous/${sourceId}`,
          `https://api.youlearn.ai/space/anonymous/${sourceId}`,
        ]
      : [`https://api.youlearn.ai/space/anonymous/${sourceId}`];

  let status = 0;
  for (const url of candidates) {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    status = response.status;
    if (response.ok) {
      return { data: await response.json() as unknown, status };
    }
  }

  return { data: null, status };
}

function normalizeSourceKind(value: string | null): YouLearnSourceKind {
  return value === 'folder' || value === 'playlist' ? value : 'space';
}

function collectContentArrays(value: unknown, out: YouLearnContent[] = []): YouLearnContent[] {
  if (!value || typeof value !== 'object') return out;
  const record = value as Record<string, unknown>;

  for (const key of ['contents', 'children', 'items', 'videos', 'data'] as const) {
    const next = record[key];
    if (Array.isArray(next)) {
      out.push(...(next as YouLearnContent[]));
      for (const item of next) collectContentArrays(item, out);
    } else if (next && typeof next === 'object') {
      collectContentArrays(next, out);
    }
  }

  return out;
}

function normalizeContents(contents: YouLearnContent[]) {
  const seen = new Set<string>();
  const videos = contents
    .filter((content): content is YouLearnContent & { content_url: string } =>
      (content.type === 'video' || content.type === 'youtube') && typeof content.content_url === 'string'
    )
    .map(content => ({
      type: 'video',
      title: content.title?.trim() || 'YouLearn Video',
      content_url: content.content_url,
      thumbnail_url: content.thumbnail_url,
      content_id: content.content_id ?? content._id,
      length: normalizeDuration(content.length ?? content.duration),
    }))
    .filter(video => {
      const key = video.content_id ?? video.content_url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return videos.slice(0, 300);
}

function normalizeDuration(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function sendJson(res: ApiResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

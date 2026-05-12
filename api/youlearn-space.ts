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
  transcript?: YouLearnTranscriptSegment[];
}

interface YouLearnTranscriptChunk {
  page_content?: string;
  source?: number;
  idx?: number;
}

interface YouLearnTranscriptSegment {
  index: number;
  startTime: number;
  text: string;
}

interface YouLearnSpaceResponse {
  contents?: YouLearnContent[];
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const requestUrl = new URL(req.url ?? '/', 'http://localhost');
  const spaceId = requestUrl.searchParams.get('spaceId');

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (!spaceId || !/^[a-zA-Z0-9_-]+$/.test(spaceId)) {
    sendJson(res, 400, { error: 'Missing or invalid YouLearn space ID.' });
    return;
  }

  try {
    const response = await fetch(`https://api.youlearn.ai/space/anonymous/${spaceId}`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      sendJson(res, response.status, { error: 'This YouLearn space is not public or could not be loaded.' });
      return;
    }

    const data = await response.json() as YouLearnSpaceResponse;
    sendJson(res, 200, { contents: await normalizeContents(data.contents ?? []) });
  } catch {
    sendJson(res, 502, { error: 'Could not reach YouLearn.' });
  }
}

async function normalizeContents(contents: YouLearnContent[]) {
  const videos = contents
    .filter(content => content.type === 'video' && typeof content.content_url === 'string')
    .map(content => ({
      type: 'video',
      title: content.title?.trim() || 'YouLearn Video',
      content_url: content.content_url,
      thumbnail_url: content.thumbnail_url,
      content_id: content.content_id ?? content._id,
      length: normalizeDuration(content.length ?? content.duration),
    }));

  return Promise.all(videos.map(async video => ({
    ...video,
    transcript: video.content_id ? await fetchTranscript(video.content_id) : undefined,
  })));
}

async function fetchTranscript(contentId: string): Promise<YouLearnTranscriptSegment[] | undefined> {
  try {
    const response = await fetch('https://api.youlearn.ai/content/transcript', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-platform': 'web',
        Referer: 'https://app.youlearn.ai/',
      },
      body: JSON.stringify({ user_id: 'anonymous', content_id: contentId }),
    });

    if (!response.ok) return undefined;
    const chunks = await response.json() as YouLearnTranscriptChunk[];
    return normalizeTranscript(chunks);
  } catch {
    return undefined;
  }
}

function normalizeTranscript(chunks: YouLearnTranscriptChunk[]): YouLearnTranscriptSegment[] | undefined {
  const transcript = chunks
    .map((chunk, fallbackIndex) => ({
      index: typeof chunk.idx === 'number' ? chunk.idx : fallbackIndex,
      startTime: normalizeTime(chunk.source),
      text: typeof chunk.page_content === 'string' ? chunk.page_content.trim() : '',
    }))
    .filter(segment => segment.text);

  return transcript.length > 0 ? transcript : undefined;
}

function normalizeDuration(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function normalizeTime(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function sendJson(res: ApiResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

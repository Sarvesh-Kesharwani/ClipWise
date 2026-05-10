interface ApiRequest {
  method?: string;
  url?: string;
}

interface ApiResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const requestUrl = new URL(req.url ?? '/', 'http://localhost');
  const contentId = requestUrl.searchParams.get('contentId');

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (!contentId || !/^[a-zA-Z0-9_-]+$/.test(contentId)) {
    sendJson(res, 400, { error: 'Missing or invalid YouLearn content ID.' });
    return;
  }

  try {
    const transcript = await fetchTranscript(contentId);
    sendJson(res, 200, { transcript: transcript ?? [] });
  } catch {
    sendJson(res, 502, { error: 'Could not reach YouLearn.' });
  }
}

async function fetchTranscript(contentId: string): Promise<YouLearnTranscriptSegment[] | undefined> {
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

function normalizeTime(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function sendJson(res: ApiResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

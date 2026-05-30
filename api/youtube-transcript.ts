import { YoutubeTranscript } from 'youtube-transcript';

interface ApiRequest {
  method?: string;
  url?: string;
}

interface ApiResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

interface TranscriptSegment {
  index: number;
  startTime: number;
  text: string;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const requestUrl = new URL(req.url ?? '/', 'http://localhost');
  const videoId = requestUrl.searchParams.get('videoId');

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    sendJson(res, 400, { error: 'Missing or invalid YouTube video ID.' });
    return;
  }

  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    sendJson(res, 200, { transcript: normalizeTranscript(transcript) });
  } catch {
    sendJson(res, 200, { transcript: [] });
  }
}

function normalizeTranscript(chunks: Array<{ text: string; offset: number }>): TranscriptSegment[] {
  return chunks
    .map((chunk, index) => ({
      index,
      startTime: Math.max(0, chunk.offset / 1000),
      text: chunk.text.trim(),
    }))
    .filter(segment => segment.text);
}

function sendJson(res: ApiResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

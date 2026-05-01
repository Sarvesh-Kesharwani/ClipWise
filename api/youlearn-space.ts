import type { IncomingMessage, ServerResponse } from 'node:http';

interface YouLearnContent {
  type?: string;
  title?: string;
  content_url?: string;
  thumbnail_url?: string;
  content_id?: string;
  _id?: string;
  length?: number;
  duration?: number;
}

interface YouLearnSpaceResponse {
  contents?: YouLearnContent[];
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
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
    sendJson(res, 200, { contents: normalizeContents(data.contents ?? []) });
  } catch {
    sendJson(res, 502, { error: 'Could not reach YouLearn.' });
  }
}

function normalizeContents(contents: YouLearnContent[]) {
  return contents
    .filter(content => content.type === 'video' && typeof content.content_url === 'string')
    .map(content => ({
      type: 'video',
      title: content.title?.trim() || 'YouLearn Video',
      content_url: content.content_url,
      thumbnail_url: content.thumbnail_url,
      content_id: content.content_id ?? content._id,
      length: normalizeDuration(content.length ?? content.duration),
    }));
}

function normalizeDuration(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

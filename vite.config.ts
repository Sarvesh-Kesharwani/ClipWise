import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import authHandler from './api/auth'
import syncHandler from './api/sync'
import { AUTH_COOKIE_NAME, parseCookie, verifyAuthToken } from './lib/auth'

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

interface YouLearnTranscriptChunk {
  page_content?: string;
  source?: number;
  idx?: number;
}

function youLearnDevApi(): Plugin {
  return {
    name: 'youlearn-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
        if (isDevPublicPath(pathname)) {
          next();
          return;
        }

        const authed = await verifyAuthToken(parseCookie(req.headers.cookie, AUTH_COOKIE_NAME));
        if (authed) {
          next();
          return;
        }

        if (pathname.startsWith('/api/')) {
          res.statusCode = 401;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ error: 'Unauthorized.' }));
          return;
        }

        const nextPath = `${pathname}${new URL(req.url ?? '/', 'http://localhost').search}`;
        res.statusCode = 302;
        res.setHeader('Location', `/login?next=${encodeURIComponent(nextPath)}`);
        res.end();
      });

      server.middlewares.use('/api/auth', authHandler);
      server.middlewares.use('/api/sync', syncHandler);
      server.middlewares.use('/api/youlearn-space', async (req, res) => {
        const requestUrl = new URL(req.url ?? '/', 'http://localhost');
        const spaceId = requestUrl.searchParams.get('spaceId');

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');

        if (!spaceId || !/^[a-zA-Z0-9_-]+$/.test(spaceId)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing or invalid YouLearn space ID.' }));
          return;
        }

        try {
          const response = await fetch(`https://api.youlearn.ai/space/anonymous/${spaceId}`, {
            headers: { Accept: 'application/json' },
          });

          if (!response.ok) {
            res.statusCode = response.status;
            res.end(JSON.stringify({ error: 'This YouLearn space is not public or could not be loaded.' }));
            return;
          }

          const data = await response.json() as YouLearnSpaceResponse;
          res.statusCode = 200;
          res.end(JSON.stringify({ contents: await normalizeContents(data.contents ?? []) }));
        } catch {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: 'Could not reach YouLearn.' }));
        }
      });

      server.middlewares.use('/api/youlearn-transcript', async (req, res) => {
        const requestUrl = new URL(req.url ?? '/', 'http://localhost');
        const contentId = requestUrl.searchParams.get('contentId');

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');

        if (!contentId || !/^[a-zA-Z0-9_-]+$/.test(contentId)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing or invalid YouLearn content ID.' }));
          return;
        }

        try {
          res.statusCode = 200;
          res.end(JSON.stringify({ transcript: await fetchTranscript(contentId) ?? [] }));
        } catch {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: 'Could not reach YouLearn.' }));
        }
      });

    },
  }
}

function isDevPublicPath(pathname: string) {
  return pathname === '/login'
    || pathname === '/api/auth'
    || pathname === '/favicon.ico'
    || pathname === '/vite.svg'
    || pathname.startsWith('/assets/')
    || pathname.startsWith('/src/')
    || pathname.startsWith('/@vite')
    || pathname.startsWith('/@react-refresh')
    || pathname.startsWith('/node_modules/')
    || /\.[a-z0-9]+$/i.test(pathname);
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

async function fetchTranscript(contentId: string) {
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
    const transcript = chunks
      .map((chunk, fallbackIndex) => ({
        index: typeof chunk.idx === 'number' ? chunk.idx : fallbackIndex,
        startTime: typeof chunk.source === 'number' && Number.isFinite(chunk.source) && chunk.source >= 0 ? chunk.source : 0,
        text: typeof chunk.page_content === 'string' ? chunk.page_content.trim() : '',
      }))
      .filter(segment => segment.text);

    return transcript.length > 0 ? transcript : undefined;
  } catch {
    return undefined;
  }
}

function normalizeDuration(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), youLearnDevApi()],
})

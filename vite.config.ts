import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function youLearnDevApi(): Plugin {
  return {
    name: 'youlearn-dev-api',
    configureServer(server) {
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

          res.statusCode = 200;
          res.end(await response.text());
        } catch {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: 'Could not reach YouLearn.' }));
        }
      });
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), youLearnDevApi()],
})

// Dev-only integration behind the paragraph editor.
//
// This is a Vite middleware rather than an Astro endpoint on purpose: the site
// builds to static output with no adapter, so a real route would either be
// prerendered (GET only) or fail the build. A middleware registered in
// astro:server:setup exists only while `astro dev` is running and leaves the
// production build untouched.

import { fileURLToPath } from 'node:url';
import { patchClass, patchText } from './patch.mjs';

export const EDIT_ENDPOINT = '/__edit-text';

const MAX_BODY = 1_000_000;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY) reject(new Error('Request body too large.'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Request body was not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(body);
}

export default function devTextEditor() {
  let root = process.cwd();

  return {
    name: 'dev-text-editor',
    hooks: {
      'astro:config:done': ({ config }) => {
        root = fileURLToPath(config.root);
      },

      'astro:server:setup': ({ server, logger }) => {
        server.middlewares.use(EDIT_ENDPOINT, async (req, res) => {
          if (req.method !== 'POST') {
            send(res, 405, { ok: false, error: 'POST only.' });
            return;
          }

          try {
            const { action = 'text', original, updated, group, value } = await readJson(req);

            const result =
              action === 'class'
                ? await patchClass({ root, original, group, value })
                : await patchText({ root, original, updated });

            if (result.ok && !result.unchanged) {
              const what = action === 'class' ? `${group} → ${value ?? 'auto'}` : 'text';
              logger.info(`${what} edited in ${result.file}:${result.line}`);
            }

            // A refusal is an expected outcome the panel reports, not a
            // transport failure — 200 keeps it out of the browser's console,
            // which is the user's own working surface. Genuine faults below
            // still come back as 500.
            send(res, 200, result);
          } catch (error) {
            logger.error(`text edit failed: ${error.message}`);
            send(res, 500, { ok: false, error: error.message });
          }
        });

        logger.info(`paragraph editor ready — toggle it with the panel, or ⌘⇧E`);
      },
    },
  };
}

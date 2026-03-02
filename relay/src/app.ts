import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { fixRouter } from './routes/fix.js';

export function createApp() {
  const app = express();

  // Health route — mounted BEFORE auth middleware, accessible without auth
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Auth middleware — applies to ALL routes below this point
  app.use((req, res, next) => {
    const expected = process.env.RELAY_SECRET ?? '';
    const actual = (req.headers['authorization'] ?? '').replace('Bearer ', '');
    if (!expected) {
      console.error('[relay] RELAY_SECRET not set — rejecting all requests');
      res.status(500).json({ error: 'Server misconfigured' });
      return;
    }
    try {
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
      ) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    } catch {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  });

  // Body parsing — after auth to avoid parsing untrusted bodies
  app.use(express.json());

  // Routes
  app.use('/fix', fixRouter);

  return app;
}

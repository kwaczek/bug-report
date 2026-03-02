import 'dotenv/config';
import { createApp } from './app.js';
import { loadSeen } from './services/dedup.js';

// Restore dedup state from disk before accepting requests
loadSeen();

const app = createApp();
const port = process.env.PORT ?? '3001';

app.listen(Number(port), () => {
  console.log(`[relay] listening on port ${port}`);
  console.log(`[relay] RALPH_WORKSPACE: ${process.env.RALPH_WORKSPACE ?? '(not set — using cwd)'}`);
});

import "dotenv/config";
import { createApp } from "./app.js";
import { loadProjectsFromEnv, getAllRepos } from "./config.js";
import { ensureLabelsExist } from "./services/github.js";
import { registerRelayWebhook } from "./services/relay.js";

// Load project mappings from PROJECT_MAP env var at startup
loadProjectsFromEnv();

// Register Phase 3 webhook handler for auto-fix relay notifications.
// Wrapped in try/catch — if GITHUB_WEBHOOK_SECRET is not set the server
// still starts; relay notifications will be unavailable until the secret
// is configured and the server is restarted.
try {
  registerRelayWebhook();
} catch (err) {
  console.warn(`[startup] relay webhook not registered: ${err}`);
}

const app = createApp();
const port = process.env.PORT ?? 3000;

app.listen(port, async () => {
  console.log(`[bug-report-backend] listening on port ${port}`);

  // Idempotently ensure GitHub labels exist for all configured repos (BACK-05).
  // Non-fatal — labels can be created manually or on next restart.
  const repos = getAllRepos();
  for (const { projectId, owner, repo } of repos) {
    try {
      await ensureLabelsExist(owner, repo);
      console.log(`[startup] labels ensured for ${owner}/${repo} (${projectId})`);
    } catch (err) {
      console.warn(`[startup] failed to ensure labels for ${owner}/${repo}: ${err}`);
    }
  }
});

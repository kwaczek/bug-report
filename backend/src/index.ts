import "dotenv/config";
import { createApp } from "./app.js";
import { loadProjectsFromEnv } from "./config.js";

// Load project mappings from env
loadProjectsFromEnv();

const app = createApp();
const port = process.env.PORT ?? 3000;

app.listen(port, () => {
  console.log(`[bug-report-backend] listening on port ${port}`);
});

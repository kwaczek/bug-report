import type { ProjectConfig } from "./types.js";

// Project ID → GitHub repo mapping
// Add entries here for each project that uses the bug report widget
// Real entries added via PROJECT_MAP env var or hardcoded here
const projects: Record<string, ProjectConfig> = {
  // Example: "my-app" maps to kwaczek/my-app on GitHub
  // Real entries added via PROJECT_MAP env var or hardcoded here
};

export function getRepo(projectId: string): ProjectConfig | undefined {
  return projects[projectId];
}

export function getAllRepos(): Array<{ projectId: string } & ProjectConfig> {
  return Object.entries(projects).map(([projectId, config]) => ({
    projectId,
    ...config,
  }));
}

// Load project mappings from environment variable if set
// Format: "projectId:owner/repo,projectId2:owner2/repo2"
export function loadProjectsFromEnv(): void {
  const map = process.env.PROJECT_MAP;
  if (!map) return;
  for (const entry of map.split(",")) {
    const [id, ownerRepo] = entry.trim().split(":");
    if (id && ownerRepo) {
      const [owner, repo] = ownerRepo.split("/");
      if (owner && repo) {
        projects[id] = { owner, repo };
      }
    }
  }
}

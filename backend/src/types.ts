// Re-export from widget for reference (backend defines its own copy)
export interface BugMetadata {
  url: string;
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  windowWidth: number;
  windowHeight: number;
  devicePixelRatio: number;
  language: string;
  timestamp: string;
}

export interface TriageResult {
  verdict: "auto-fix" | "review" | "spam";
  confidence: number;
  reasoning: string;
}

export interface ReportPayload {
  projectId: string;
  subject: string;
  description: string;
  metadata: BugMetadata;
}

export interface ProjectConfig {
  owner: string;
  repo: string;
}

// Cross-phase contract: defined in Phase 2, consumed by Phase 4
export interface PendingApproval {
  issueId: number;
  repo: ProjectConfig;
  triageResult: TriageResult;
  reportData: {
    subject: string;
    description: string;
    screenshotUrls: string[];
    metadata: BugMetadata;
  };
}

export interface RelayFixRequest {
  issueId: number;
  issueUrl: string;
  issueTitle: string;
  owner: string;
  repo: string;
  triageResult: {
    verdict: 'auto-fix';
    confidence: number;
    reasoning: string;
  };
  reportData: {
    subject: string;
    description: string;
    screenshotUrls: string[];
  };
}

export interface FixWatchEntry {
  owner: string;
  repo: string;
  issueId: number;
  repoName: string;
  startedAt: string; // ISO 8601
}

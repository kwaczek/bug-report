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

export interface WidgetConfig {
  projectId: string;
  apiUrl: string;
}

export interface SubmitArgs {
  projectId: string;
  apiUrl: string;
  subject: string;
  description: string;
  metadata: BugMetadata;
  autoScreenshot: Blob | null;
  attachedImages: Blob[];
  mode: 'ralph' | 'gsd';
}

export interface SubmitResult {
  ok: boolean;
  message: string;
}

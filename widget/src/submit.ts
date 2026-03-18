import type { SubmitArgs, SubmitResult } from './types.js';

export async function submitReport({
  projectId,
  apiUrl,
  subject,
  description,
  metadata,
  autoScreenshot,
  attachedImages,
}: SubmitArgs): Promise<SubmitResult> {
  try {
    const form = new FormData();
    form.append('projectId', projectId);
    form.append('subject', subject);
    form.append('description', description);
    form.append('metadata', JSON.stringify(metadata));

    if (autoScreenshot) {
      form.append('screenshots', autoScreenshot, 'screenshot-auto.jpg');
    }

    attachedImages.forEach((blob, i) => {
      form.append('screenshots', blob, `screenshot-${i}.png`);
    });

    // No manual content header — browser sets the multipart boundary automatically
    const res = await fetch(`${apiUrl}/report`, {
      method: 'POST',
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, message: text || `Error ${res.status}` };
    }

    return { ok: true, message: 'Report submitted successfully' };
  } catch (err) {
    // Network failure — never propagate to host page (WIDG-09)
    console.warn('[bug-report-widget] submit failed:', err);
    return { ok: false, message: 'Network error \u2014 please try again' };
  }
}

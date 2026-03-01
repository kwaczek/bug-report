import { toJpeg } from 'html-to-image';

export async function capturePageScreenshot(widgetHostId: string): Promise<Blob | null> {
  try {
    const dataUrl = await toJpeg(document.body, {
      quality: 0.8,
      // Exclude the widget host from its own screenshot
      filter: (node) =>
        !(node instanceof Element && node.id === widgetHostId),
    });

    // Blank canvas detection: valid JPEG data URL is >> 1000 chars
    if (!dataUrl || dataUrl.length < 1000) return null;

    const res = await fetch(dataUrl);
    return await res.blob();
  } catch {
    // CORS failure, SVG foreignObject error, security error — all graceful (WIDG-09)
    return null;
  }
}

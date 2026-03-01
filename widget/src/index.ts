import { createWidget } from './widget.js';

// CRITICAL: capture currentScript at module evaluation time (synchronous, top-level)
// document.currentScript is null after initial script execution — must be first
const scriptEl = document.currentScript as HTMLScriptElement | null;
const projectId = scriptEl?.getAttribute('data-project-id') ?? '';
const apiUrl = scriptEl?.getAttribute('data-api-url') ?? '';

(async () => {
  try {
    if (!projectId) {
      console.warn('[bug-report-widget] Missing data-project-id attribute on script tag');
    }
    if (!apiUrl) {
      console.warn('[bug-report-widget] Missing data-api-url attribute on script tag');
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      await new Promise<void>((resolve) => {
        document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
      });
    }

    // Create shadow host — fixed position, max z-index, no layout impact on host page
    const host = document.createElement('div');
    host.id = 'bug-report-widget-host';
    Object.assign(host.style, {
      position: 'fixed',
      zIndex: '2147483647',
      bottom: '24px',
      right: '24px',
      width: '0',
      height: '0',
      border: 'none',
      outline: 'none',
      background: 'none',
    });
    document.body.appendChild(host);

    const shadowRoot = host.attachShadow({ mode: 'open' });

    createWidget(shadowRoot, { projectId, apiUrl });
  } catch (err) {
    // Silent fail — host page must never see widget errors (WIDG-09)
    console.warn('[bug-report-widget] init failed:', err);
  }
})();

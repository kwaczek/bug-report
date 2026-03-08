import type { WidgetConfig } from './types.js';
import { collectMetadata } from './metadata.js';
import { capturePageScreenshot } from './screenshot.js';
import { createUploadHandler } from './upload.js';
import styles from './styles/widget.css?inline';

type WidgetState = 'idle' | 'open' | 'submitting' | 'success' | 'error';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Record<string, string>,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (k === 'className') node.className = v;
      else node.setAttribute(k, v);
    }
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createWidget(shadowRoot: ShadowRoot, config: WidgetConfig): void {
  // Inject CSS into shadow root — never into document.head (WIDG-03)
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  shadowRoot.appendChild(styleEl);

  // Pre-capture URL at init time (WIDG-05)
  const pageUrl = window.location.href;

  let state: WidgetState = 'idle';
  let autoScreenshot: Blob | null = null;
  let errorMessage = 'Submission failed. Please try again.';
  const uploadHandler = createUploadHandler();

  // --- Build static DOM ---

  const trigger = el('button', { className: 'brw-trigger', 'aria-label': 'Report a bug' }, '🐛');
  shadowRoot.appendChild(trigger);

  const overlay = el('div', { className: 'brw-overlay', hidden: '' });
  shadowRoot.appendChild(overlay);

  const panel = el('div', {
    className: 'brw-panel',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'brw-title',
  });
  overlay.appendChild(panel);

  // --- Render functions ---

  function clearPanel(): void {
    while (panel.firstChild) panel.removeChild(panel.firstChild);
  }

  function renderLoadingView(): void {
    clearPanel();
    const loading = el('div', { className: 'brw-state-loading' }, 'Submitting report\u2026');
    panel.appendChild(loading);
  }

  function renderSuccessView(): void {
    clearPanel();
    const msg = el('div', { className: 'brw-state-success' }, 'Report submitted. Thank you!');
    panel.appendChild(msg);
    const closeBtn = el('button', { className: 'brw-btn-cancel' }, 'Close');
    closeBtn.style.margin = '16px auto 0';
    closeBtn.style.display = 'block';
    closeBtn.addEventListener('click', closeModal);
    panel.appendChild(closeBtn);
  }

  function renderErrorView(): void {
    clearPanel();
    const msg = el('div', { className: 'brw-state-error' }, errorMessage);
    panel.appendChild(msg);
    const closeBtn = el('button', { className: 'brw-btn-cancel' }, 'Close');
    closeBtn.style.margin = '16px auto 0';
    closeBtn.style.display = 'block';
    closeBtn.addEventListener('click', closeModal);
    panel.appendChild(closeBtn);
  }

  function renderFormView(): void {
    clearPanel();

    // Title
    const title = el('h2', { className: 'brw-title', id: 'brw-title' }, 'Report a Bug');
    panel.appendChild(title);

    // Subject
    const subjectField = el('div', { className: 'brw-field' });
    const subjectLabel = el('label', { className: 'brw-label' }, 'Subject');
    const subjectInput = el('input', {
      type: 'text',
      className: 'brw-input',
      placeholder: 'Short description of the issue',
      required: 'true',
    });
    subjectField.appendChild(subjectLabel);
    subjectField.appendChild(subjectInput);
    panel.appendChild(subjectField);

    // Description
    const descField = el('div', { className: 'brw-field' });
    const descLabel = el('label', { className: 'brw-label' }, 'Description');
    const descTextarea = el('textarea', {
      className: 'brw-textarea',
      placeholder: 'Steps to reproduce, expected vs actual behavior\u2026',
    });
    descField.appendChild(descLabel);
    descField.appendChild(descTextarea);
    panel.appendChild(descField);

    // Mode toggle
    const modeField = el('div', { className: 'brw-field' });
    const modeLabel = el('label', { className: 'brw-label' }, 'Fix type');
    const modeToggle = el('div', { className: 'brw-mode-toggle' });
    const modeQuick = el('button', {
      className: 'brw-mode-option',
      type: 'button',
      'aria-pressed': 'true',
    }, 'Quick fix');
    const modeInvestigate = el('button', {
      className: 'brw-mode-option',
      type: 'button',
      'aria-pressed': 'false',
    }, 'Needs investigation');

    let selectedMode: 'ralph' | 'gsd' = 'ralph';

    modeQuick.addEventListener('click', () => {
      selectedMode = 'ralph';
      modeQuick.setAttribute('aria-pressed', 'true');
      modeInvestigate.setAttribute('aria-pressed', 'false');
    });
    modeInvestigate.addEventListener('click', () => {
      selectedMode = 'gsd';
      modeQuick.setAttribute('aria-pressed', 'false');
      modeInvestigate.setAttribute('aria-pressed', 'true');
    });

    modeToggle.appendChild(modeQuick);
    modeToggle.appendChild(modeInvestigate);
    modeField.appendChild(modeLabel);
    modeField.appendChild(modeToggle);
    panel.appendChild(modeField);

    // URL (pre-filled — WIDG-05)
    const urlField = el('div', { className: 'brw-field' });
    const urlLabel = el('label', { className: 'brw-label' }, 'Page URL');
    const urlInput = el('input', { type: 'url', className: 'brw-input' });
    urlInput.value = pageUrl;
    urlField.appendChild(urlLabel);
    urlField.appendChild(urlInput);
    panel.appendChild(urlField);

    // Auto-screenshot status
    const screenshotInfo = el('div', { className: 'brw-screenshot-info' });
    if (autoScreenshot) {
      screenshotInfo.classList.add('captured');
      screenshotInfo.textContent = 'Screenshot captured automatically';
    } else {
      screenshotInfo.classList.add('failed');
      screenshotInfo.textContent = 'Auto-screenshot unavailable \u2014 attach manually if needed';
    }
    panel.appendChild(screenshotInfo);

    // Additional screenshots (WIDG-06)
    const uploadField = el('div', { className: 'brw-field' });
    const uploadLabel = el('label', { className: 'brw-label' }, 'Additional screenshots');
    const fileInput = el('input', {
      type: 'file',
      className: 'brw-file-input',
      accept: 'image/*',
      multiple: 'true',
    });
    const pasteHint = el('div', { className: 'brw-paste-hint' }, 'Or press Ctrl+V / Cmd+V to paste an image');
    const attachedCount = el('div', { className: 'brw-attached-count' });
    const imgs = uploadHandler.getImages();
    if (imgs.length > 0) attachedCount.textContent = `${imgs.length} image(s) attached`;
    uploadField.appendChild(uploadLabel);
    uploadField.appendChild(fileInput);
    uploadField.appendChild(pasteHint);
    uploadField.appendChild(attachedCount);
    panel.appendChild(uploadField);

    // Wire upload and paste — onUpdate refreshes the attached count display
    uploadHandler.attachTo(fileInput, () => {
      const count = uploadHandler.getImages().length;
      attachedCount.textContent = count > 0 ? `${count} image(s) attached` : '';
    });

    // Actions
    const actions = el('div', { className: 'brw-actions' });
    const cancelBtn = el('button', { className: 'brw-btn-cancel' }, 'Cancel');
    cancelBtn.addEventListener('click', closeModal);
    const submitBtn = el('button', { className: 'brw-btn-submit' }, 'Submit Report');
    submitBtn.addEventListener('click', () => {
      const subject = (subjectInput as HTMLInputElement).value.trim();
      const description = (descTextarea as HTMLTextAreaElement).value.trim();
      if (!subject) {
        (subjectInput as HTMLInputElement).focus();
        return;
      }
      handleSubmit(subject, description, selectedMode).catch((err: unknown) => {
        console.warn('[bug-report-widget] handleSubmit threw:', err);
      });
    });
    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    panel.appendChild(actions);
  }

  function renderPanel(): void {
    if (state === 'submitting') { renderLoadingView(); return; }
    if (state === 'success')    { renderSuccessView(); return; }
    if (state === 'error')      { renderErrorView();   return; }
    renderFormView();
  }

  async function openModal(): Promise<void> {
    uploadHandler.clear();
    autoScreenshot = null;
    state = 'open';
    overlay.removeAttribute('hidden');
    renderPanel();

    // Capture screenshot in background — does not block modal opening (WIDG-04)
    try {
      autoScreenshot = await capturePageScreenshot('bug-report-widget-host');
      if (state === 'open') renderPanel();
    } catch {
      // capturePageScreenshot never throws, but guard anyway (WIDG-09)
    }
  }

  function closeModal(): void {
    state = 'idle';
    overlay.setAttribute('hidden', '');
    uploadHandler.detach();
    uploadHandler.clear();
    autoScreenshot = null;
  }

  async function handleSubmit(subject: string, description: string, mode: 'ralph' | 'gsd'): Promise<void> {
    const { submitReport } = await import('./submit.js');
    state = 'submitting';
    renderPanel();

    const metadata = collectMetadata();
    const result = await submitReport({
      projectId: config.projectId,
      apiUrl: config.apiUrl,
      subject,
      description,
      metadata,
      autoScreenshot,
      attachedImages: uploadHandler.getImages(),
      mode,
    }).catch((err: unknown) => {
      console.warn('[bug-report-widget] submitReport threw unexpectedly:', err);
      return { ok: false, message: 'Unexpected error' };
    });

    errorMessage = result.message || 'Submission failed. Please try again.';
    state = result.ok ? 'success' : 'error';
    renderPanel();
  }

  trigger.addEventListener('click', () => {
    openModal().catch((err: unknown) => {
      console.warn('[bug-report-widget] openModal failed:', err);
    });
  });

  // Close on overlay backdrop click (outside panel)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
}

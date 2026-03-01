/**
 * TDD tests for submit.ts — submitReport() FormData submission module
 *
 * These tests run under Node 20 (native fetch) using tsx for TypeScript execution.
 * They mock the global fetch to verify FormData construction and return values.
 */

import { submitReport } from '../src/submit.js';
import type { SubmitArgs } from '../src/types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

// Helper to build a valid SubmitArgs
function makeArgs(overrides: Partial<SubmitArgs> = {}): SubmitArgs {
  const meta = {
    url: 'https://example.com',
    userAgent: 'TestAgent/1.0',
    timestamp: '2026-03-01T00:00:00Z',
    screenWidth: 1920,
    screenHeight: 1080,
    windowWidth: 1440,
    windowHeight: 900,
    devicePixelRatio: 1,
    language: 'en',
  };
  return {
    projectId: 'proj-123',
    apiUrl: 'http://localhost:3000',
    subject: 'Test subject',
    description: 'Test description',
    metadata: meta,
    autoScreenshot: null,
    attachedImages: [],
    ...overrides,
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

console.log('\n=== submit.ts TDD Tests ===\n');

// We accumulate captured FormData fields for inspection
let capturedForm: FormData | null = null;
let fetchCallCount = 0;

// Mock fetch globally
const originalFetch = globalThis.fetch;

// ── Test 1: Returns { ok: true } on 200 response ────────────────────────────
console.log('Test 1: Returns { ok: true, message } on HTTP 200');
{
  capturedForm = null;
  fetchCallCount = 0;

  globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    fetchCallCount++;
    capturedForm = init?.body as FormData;
    return new Response('', { status: 200 });
  };

  const result = await submitReport(makeArgs());
  assert(result.ok === true, 'result.ok is true on 200');
  assert(result.message === 'Report submitted successfully', 'message is "Report submitted successfully"');
  assert(fetchCallCount === 1, 'fetch called exactly once');
}

// ── Test 2: FormData contains required fields ────────────────────────────────
console.log('\nTest 2: FormData contains projectId, subject, description, metadata');
{
  capturedForm = null;
  fetchCallCount = 0;

  const args = makeArgs();
  globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    capturedForm = init?.body as FormData;
    return new Response('', { status: 200 });
  };

  await submitReport(args);

  assert(capturedForm !== null, 'FormData was captured');
  if (capturedForm) {
    assert(capturedForm.get('projectId') === 'proj-123', 'projectId appended to FormData');
    assert(capturedForm.get('subject') === 'Test subject', 'subject appended to FormData');
    assert(capturedForm.get('description') === 'Test description', 'description appended to FormData');
    const meta = capturedForm.get('metadata') as string;
    assert(typeof meta === 'string', 'metadata is a string (JSON stringified)');
    const parsed = JSON.parse(meta);
    assert(parsed.url === 'https://example.com', 'metadata JSON contains url field');
  }
}

// ── Test 3: Content-Type is NOT manually set ─────────────────────────────────
console.log('\nTest 3: fetch init does NOT manually set Content-Type header');
{
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    capturedInit = init;
    return new Response('', { status: 200 });
  };

  await submitReport(makeArgs());
  const headers = capturedInit?.headers as Record<string, string> | undefined;
  const hasContentType = headers != null &&
    (headers['Content-Type'] != null || headers['content-type'] != null);
  assert(!hasContentType, 'Content-Type is NOT manually set in fetch headers');
}

// ── Test 4: autoScreenshot appended as screenshot-auto.jpg ───────────────────
console.log('\nTest 4: autoScreenshot appended as "screenshot-auto.jpg"');
{
  capturedForm = null;
  const screenshotBlob = new Blob(['fakejpeg'], { type: 'image/jpeg' });

  globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    capturedForm = init?.body as FormData;
    return new Response('', { status: 200 });
  };

  await submitReport(makeArgs({ autoScreenshot: screenshotBlob }));

  if (capturedForm) {
    const screenshots = capturedForm.getAll('screenshots');
    assert(screenshots.length === 1, 'One screenshot entry in FormData');
    // FormData File objects have .name
    const file = screenshots[0] as File;
    assert(file.name === 'screenshot-auto.jpg', 'autoScreenshot filename is screenshot-auto.jpg');
  } else {
    assert(false, 'FormData was captured with autoScreenshot');
  }
}

// ── Test 5: attachedImages appended as screenshot-{i}.png ───────────────────
console.log('\nTest 5: attachedImages appended as "screenshot-{i}.png"');
{
  capturedForm = null;
  const img0 = new Blob(['img0'], { type: 'image/png' });
  const img1 = new Blob(['img1'], { type: 'image/png' });

  globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    capturedForm = init?.body as FormData;
    return new Response('', { status: 200 });
  };

  await submitReport(makeArgs({ attachedImages: [img0, img1] }));

  if (capturedForm) {
    const screenshots = capturedForm.getAll('screenshots');
    assert(screenshots.length === 2, 'Two screenshot entries in FormData');
    assert((screenshots[0] as File).name === 'screenshot-0.png', 'First attached image is screenshot-0.png');
    assert((screenshots[1] as File).name === 'screenshot-1.png', 'Second attached image is screenshot-1.png');
  } else {
    assert(false, 'FormData was captured with attachedImages');
  }
}

// ── Test 6: Returns { ok: false, message: text } on non-200 ──────────────────
console.log('\nTest 6: Returns { ok: false, message } on non-200 HTTP response');
{
  globalThis.fetch = async () => new Response('Bad Request', { status: 400 });

  const result = await submitReport(makeArgs());
  assert(result.ok === false, 'result.ok is false on 400');
  assert(typeof result.message === 'string' && result.message.length > 0, 'error message is non-empty string');
}

// ── Test 7: Returns { ok: false, message: 'Network error' } on fetch throw ───
console.log('\nTest 7: Returns { ok: false, message: "Network error..." } on fetch throw');
{
  globalThis.fetch = async () => { throw new Error('net::ERR_CONNECTION_REFUSED'); };

  const result = await submitReport(makeArgs());
  assert(result.ok === false, 'result.ok is false on network error');
  assert(result.message.includes('Network error'), 'message includes "Network error"');
}

// ── Test 8: Never throws ─────────────────────────────────────────────────────
console.log('\nTest 8: submitReport() never throws even on catastrophic fetch failure');
{
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };

  let threw = false;
  try {
    await submitReport(makeArgs());
  } catch {
    threw = true;
  }
  assert(!threw, 'submitReport() did not throw');
}

// ── Test 9: Correct endpoint URL ─────────────────────────────────────────────
console.log('\nTest 9: fetch called with {apiUrl}/report');
{
  let capturedUrl = '';
  globalThis.fetch = async (url: string | URL | Request) => {
    capturedUrl = url.toString();
    return new Response('', { status: 200 });
  };

  await submitReport(makeArgs({ apiUrl: 'http://api.example.com' }));
  assert(capturedUrl === 'http://api.example.com/report', 'fetch URL is apiUrl + /report');
}

// ── Restore global fetch ─────────────────────────────────────────────────────
globalThis.fetch = originalFetch;

// ── Results ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) {
  process.exit(1);
}

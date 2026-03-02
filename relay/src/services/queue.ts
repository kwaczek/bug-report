const queues = new Map<string, Promise<void>>();

/**
 * Enqueues a job for the given project name, serializing execution via
 * Promise chaining. Jobs for different projects run in parallel; jobs for
 * the same project run sequentially.
 *
 * Errors in individual jobs are caught and logged — they do NOT prevent
 * subsequent jobs for the same project from running.
 */
export function enqueue(projectName: string, job: () => Promise<void>): void {
  const current = queues.get(projectName) ?? Promise.resolve();
  const next = current
    .then(job)
    .catch((err: unknown) => {
      console.error(`[queue] job failed for ${projectName}:`, err);
    });
  queues.set(projectName, next);
  console.log(`[queue] enqueued job for ${projectName}`);
}

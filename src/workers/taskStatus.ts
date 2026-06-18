/**
 * Lifecycle states a Task moves through.
 */
export enum TaskStatus {
  Queued = 'queued',
  InProgress = 'in_progress',
  Completed = 'completed',
  Failed = 'failed',
}

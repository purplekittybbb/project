/**
 * @deprecated Import from `@/lib/queue` instead.
 * Thin re-export kept for admin routes and existing tests.
 */

export {
  SCRAPE_QUEUE_NAME,
  SCRAPE_DLQ_NAME,
  enqueueScrapeJob,
  getScrapeQueue,
  getDeadLetterQueue,
  getScrapeQueueCounts,
  listDeadLetterJobs,
  moveToDeadLetter,
  isFinalAttempt,
  __resetScrapeQueueForTests,
  type ScrapeJobPayload,
  type DeadLetterPayload,
  type QueueCounts,
  type DeadLetterListItem,
} from "@/lib/queue";

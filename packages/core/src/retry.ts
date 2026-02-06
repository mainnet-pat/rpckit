export interface RetryOptions {
  retryCount?: number
  retryDelay?: number
}

const DEFAULT_RETRY_COUNT = 3
const DEFAULT_RETRY_DELAY = 150

/**
 * Execute an async function with exponential backoff retry.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = (options.retryCount ?? DEFAULT_RETRY_COUNT) + 1
  const baseDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY

  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (attempt === maxAttempts) {
        break
      }

      // Exponential backoff: delay * 2^(attempt-1)
      const delay = baseDelay * 2 ** (attempt - 1)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

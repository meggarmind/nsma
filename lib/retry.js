/**
 * Retry utility with exponential backoff for API calls
 * Used by Notion and Claude API clients
 */

/**
 * Default function to determine if an error is retryable
 * @param {Error} error - The error to check
 * @returns {boolean} - Whether the error should trigger a retry
 */
function defaultIsRetryable(error) {
  // Network errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' || error.code === 'ECONNRESET' ||
      error.code === 'UND_ERR_CONNECT_TIMEOUT') {
    return true;
  }

  // HTTP status-based errors
  const status = error.status || error.statusCode;
  if (status) {
    // 429 = rate limit, 5xx = server errors
    return status === 429 || status >= 500;
  }

  // Check error message for status codes (fallback)
  const message = error.message || '';
  if (message.includes('429') || message.includes('rate limit')) return true;
  if (message.includes('529') || message.includes('overloaded')) return true;
  if (/5\d{2}/.test(message)) return true; // Any 5xx in message
  if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT')) return true;

  return false;
}

/**
 * Extract retry-after delay from error or response
 * @param {Error} error - The error that may contain retry info
 * @returns {number|null} - Delay in ms, or null if not specified
 */
function extractRetryAfter(error) {
  // Check for Retry-After header value stored on error
  if (error.retryAfter) {
    const seconds = parseInt(error.retryAfter, 10);
    if (!isNaN(seconds)) return seconds * 1000;
  }

  // Check error message for retry hints
  const message = error.message || '';
  const match = message.match(/retry.?after[:\s]+(\d+)/i);
  if (match) {
    return parseInt(match[1], 10) * 1000;
  }

  return null;
}

/**
 * Calculate delay with exponential backoff and jitter
 * @param {number} attempt - Current attempt number (1-based)
 * @param {number} baseDelay - Base delay in ms
 * @param {number} maxDelay - Maximum delay cap in ms
 * @returns {number} - Delay in ms
 */
function calculateBackoff(attempt, baseDelay, maxDelay) {
  // Exponential: 1s, 2s, 4s, 8s...
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);

  // Add jitter (0-50% of delay) to prevent thundering herd
  const jitter = Math.random() * exponentialDelay * 0.5;

  // Cap at maxDelay
  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * Execute a function with retry logic and exponential backoff
 *
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Configuration options
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @param {number} [options.baseDelay=1000] - Base delay in ms (1 second)
 * @param {number} [options.maxDelay=30000] - Maximum delay cap in ms (30 seconds)
 * @param {Function} [options.isRetryable] - Custom function to check if error is retryable
 * @param {Function} [options.onRetry] - Callback on retry: (error, attempt, delay) => void
 * @returns {Promise<any>} - Result of the function
 * @throws {Error} - Last error if all retries fail
 */
export async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    isRetryable = defaultIsRetryable,
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const isLastAttempt = attempt > maxRetries;
      const shouldRetry = !isLastAttempt && isRetryable(error);

      if (!shouldRetry) {
        throw error;
      }

      // Calculate delay (use Retry-After if available, otherwise backoff)
      const retryAfterDelay = extractRetryAfter(error);
      const delay = retryAfterDelay || calculateBackoff(attempt, baseDelay, maxDelay);

      // Notify caller about retry
      if (onRetry) {
        onRetry(error, attempt, delay);
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Enhanced fetch wrapper that captures status and headers for retry logic
 * Use this instead of raw fetch when you need retry support
 *
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} - Fetch response
 * @throws {Error} - Error with status and retryAfter properties
 */
export async function fetchWithRetryInfo(url, options = {}) {
  let response;

  try {
    response = await fetch(url, options);
  } catch (networkError) {
    // Network errors (no response received)
    const error = new Error(`Network error: ${networkError.message}`);
    error.code = networkError.code || 'NETWORK_ERROR';
    error.cause = networkError;
    throw error;
  }

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
    error.status = response.status;
    error.statusCode = response.status;
    error.body = body;
    error.retryAfter = response.headers.get('Retry-After');
    throw error;
  }

  return response;
}

export { defaultIsRetryable, extractRetryAfter, calculateBackoff };

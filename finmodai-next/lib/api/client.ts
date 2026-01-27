/**
 * Standardized Client Fetch Wrapper
 * 
 * Provides consistent error handling, trace ID tracking, and logging.
 */

type ApiFetchOptions = RequestInit & {
  traceId?: string;
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
  details?: string;
  code?: string;
  traceId?: string;
  stage?: string;
  step?: string;
  fieldErrors?: any;
  warnings?: any;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: string,
    public code?: string,
    public traceId?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Standardized fetch wrapper for API calls
 * 
 * - Parses JSON safely
 * - Throws ApiError on non-2xx responses
 * - Includes traceId in errors
 * - Logs errors with traceId
 */
export async function apiFetch<T = any>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { traceId, ...fetchOptions } = options;
  const requestTraceId = traceId || crypto.randomUUID();

  try {
    const response = await fetch(path, {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
        'X-Trace-Id': requestTraceId,
      },
    });

    // Parse JSON safely
    let json: any;
    try {
      json = await response.json();
    } catch (parseError) {
      // If response is not JSON, create error from status
      throw new ApiError(
        `Invalid response format from ${path}`,
        response.status,
        `Expected JSON but got ${response.headers.get('content-type')}`,
        'INVALID_RESPONSE',
        requestTraceId
      );
    }

    // Check if response is successful
    if (!response.ok) {
      const errorData = json as ApiErrorResponse;
      const details =
        typeof errorData.details === 'string' && errorData.details.trim().length > 0
          ? errorData.details
          : typeof errorData.message === 'string' && errorData.message.trim().length > 0
          ? errorData.message
          : undefined;
      const code =
        typeof errorData.code === 'string' && errorData.code.trim().length > 0
          ? errorData.code
          : typeof errorData.error === 'string' && errorData.error.trim().length > 0
          ? errorData.error
          : 'REQUEST_FAILED';
      const message =
        details ||
        (typeof errorData.error === 'string' && errorData.error.trim().length > 0
          ? errorData.error
          : `Request failed with status ${response.status}`);

      const error = new ApiError(
        message,
        response.status,
        details,
        code,
        errorData.traceId || requestTraceId
      );
      (error as any).stage = errorData.stage || errorData.step;
      (error as any).fieldErrors = errorData.fieldErrors;
      (error as any).warnings = errorData.warnings;
      (error as any).raw = errorData;

      // Log error with traceId
      console.error(`[apiFetch] Error ${response.status} on ${path}:`, {
        traceId: error.traceId,
        error: error.message,
        details: error.details,
        code: error.code,
      });

      throw error;
    }

    // Return data (unwrap if wrapped in { data })
    return json.data !== undefined ? json.data : json;
  } catch (error) {
    // Re-throw ApiError as-is
    if (error instanceof ApiError) {
      throw error;
    }

    // Wrap unexpected errors
    const wrappedError = new ApiError(
      error instanceof Error ? error.message : 'Unknown error',
      0,
      String(error),
      'NETWORK_ERROR',
      requestTraceId
    );

    console.error(`[apiFetch] Unexpected error on ${path}:`, {
      traceId: wrappedError.traceId,
      error: wrappedError.message,
      details: wrappedError.details,
    });

    throw wrappedError;
  }
}







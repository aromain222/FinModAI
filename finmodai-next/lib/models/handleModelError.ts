/**
 * Client-side model error handler
 * 
 * Normalizes various error types (fetch Response, Axios, Error, unknown)
 * into a consistent format for UI display.
 */

export interface NormalizedModelError {
  message: string;
  stage?: string;
  step?: string;
  traceId?: string;
  status?: number;
  code?: string;
  details?: string;
  error?: string; // API response error field
}

/**
 * Safely reads JSON from a Response, falling back to text if JSON parsing fails
 */
async function safeReadJson(response: Response): Promise<any> {
  try {
    const text = await response.text();
    if (!text.trim()) {
      return {};
    }
    return JSON.parse(text);
  } catch {
    // If JSON parsing fails, return error text as message
    try {
      const text = await response.text();
      return { message: text || `HTTP ${response.status} ${response.statusText}` };
    } catch {
      return { message: `HTTP ${response.status} ${response.statusText}` };
    }
  }
}

// Track logged errors to avoid console spam
const loggedErrors = new Set<string>();

/**
 * Log error once per unique traceId/message combination
 */
function logErrorOnce(error: NormalizedModelError): void {
  const key = `${error.traceId || 'no-trace'}:${error.message}`;
  if (!loggedErrors.has(key)) {
    loggedErrors.add(key);
    console.error('[handleModelError]', {
      message: error.message,
      stage: error.stage,
      step: error.step,
      traceId: error.traceId,
      status: error.status,
      code: error.code,
      details: error.details,
    });
  }
}

/**
 * Handles model errors from various sources and returns normalized error object
 * 
 * @param err - Error from fetch, Axios, Error, ApiError, or unknown
 * @returns Normalized error object with message, stage, step, traceId, status
 */
export async function handleModelError(err: unknown): Promise<NormalizedModelError> {
  // Handle ApiError from apiFetch
  if (err && typeof err === 'object' && 'name' in err && (err as any).name === 'ApiError') {
    const apiError = err as any;
    const raw = apiError.raw || {};
    const normalized: NormalizedModelError = {
      message: apiError.message || apiError.details || raw.message || 'Request failed',
      stage: apiError.stage || raw.stage,
      step: apiError.step || raw.step,
      traceId: apiError.traceId || raw.traceId,
      status: apiError.status,
      code: apiError.code || raw.code || raw.error,
      details: apiError.details || raw.details,
      // Store raw.error for client-side display priority
      ...(raw.error ? { error: raw.error } : {}),
    } as NormalizedModelError & { error?: string };
    logErrorOnce(normalized);
    return normalized;
  }

  // Handle Response objects (from fetch)
  if (err && typeof err === 'object' && 'json' in err && typeof (err as any).json === 'function') {
    try {
      const response = err as Response;
      const errorData = await safeReadJson(response);
      const normalized: NormalizedModelError = {
        message: errorData.message || errorData.error || `HTTP ${response.status} ${response.statusText}`,
        stage: errorData.stage,
        step: errorData.step,
        traceId: errorData.traceId,
        status: response.status,
        code: errorData.error || errorData.code,
        details: errorData.details,
      };
      logErrorOnce(normalized);
      return normalized;
    } catch {
      // Fall through to other handlers
    }
  }

  // Handle fetch Response errors
  if (err instanceof Response) {
    const errorData = await safeReadJson(err);
    const normalized: NormalizedModelError = {
      message: errorData.message || errorData.error || `HTTP ${err.status} ${err.statusText}`,
      stage: errorData.stage,
      step: errorData.step,
      traceId: errorData.traceId,
      status: err.status,
      code: errorData.error || errorData.code,
      details: errorData.details,
    };
    logErrorOnce(normalized);
    return normalized;
  }

  // Handle fetch errors (network failures, etc.)
  if (err && typeof err === 'object' && 'status' in err && 'ok' in err) {
    // This might be a Response-like object
    const responseLike = err as any;
    try {
      const errorData = responseLike.json ? await responseLike.json().catch(() => ({})) : {};
      return {
        message: errorData.message || errorData.error || `HTTP ${responseLike.status || 500}`,
        stage: errorData.stage,
        step: errorData.step,
        traceId: errorData.traceId,
        status: responseLike.status || 500,
        code: errorData.error || errorData.code,
        details: errorData.details,
      };
    } catch {
      // Fall through to error handling below
    }
  }

  // Handle Axios-style errors
  if (err && typeof err === 'object' && 'response' in err) {
    const axiosError = err as any;
    const response = axiosError.response;
    if (response && typeof response === 'object') {
      const errorData = response.data || {};
      const normalized: NormalizedModelError = {
        message: errorData.message || errorData.error || axiosError.message || 'Request failed',
        stage: errorData.stage,
        step: errorData.step,
        traceId: errorData.traceId || axiosError.config?.traceId,
        status: response.status || axiosError.status || 500,
        code: errorData.error || errorData.code || axiosError.code,
        details: errorData.details || response.statusText,
      };
      logErrorOnce(normalized);
      return normalized;
    }
    const normalized: NormalizedModelError = {
      message: axiosError.message || 'Request failed',
      status: axiosError.status || 500,
      code: axiosError.code,
    };
    logErrorOnce(normalized);
    return normalized;
  }

  // Handle plain Error objects
  if (err instanceof Error) {
    // Check if error has structured properties
    const errorObj = err as any;
    // Extract message from multiple possible locations
    const message = 
      errorObj.message ||
      errorObj.response?.data?.message ||
      errorObj.details?.message ||
      err.message ||
      'Model generation failed';
    
    const normalized: NormalizedModelError = {
      message,
      stage: errorObj.stage || errorObj.response?.data?.stage,
      step: errorObj.step || errorObj.response?.data?.step,
      traceId: errorObj.traceId || errorObj.response?.data?.traceId,
      status: errorObj.status || errorObj.httpStatus || errorObj.response?.status,
      code: errorObj.code || errorObj.response?.data?.code || errorObj.response?.data?.error,
      details: errorObj.details || errorObj.response?.data?.details,
    };
    logErrorOnce(normalized);
    return normalized;
  }

  // Handle objects with error-like properties
  if (err && typeof err === 'object') {
    const errorObj = err as any;
    // Extract message from multiple possible locations
    const message = 
      errorObj.message ||
      errorObj.response?.data?.message ||
      errorObj.details?.message ||
      errorObj.error ||
      String(err) ||
      'Unknown error occurred';
    
    const normalized: NormalizedModelError = {
      message,
      stage: errorObj.stage || errorObj.response?.data?.stage,
      step: errorObj.step || errorObj.response?.data?.step,
      traceId: errorObj.traceId || errorObj.response?.data?.traceId,
      status: errorObj.status || errorObj.httpStatus || errorObj.response?.status,
      code: errorObj.code || errorObj.error || errorObj.response?.data?.code || errorObj.response?.data?.error,
      details: errorObj.details || errorObj.response?.data?.details,
    };
    logErrorOnce(normalized);
    return normalized;
  }

  // Handle primitives or unknown types
  const normalized: NormalizedModelError = {
    message: String(err) || 'Unknown error occurred',
  };
  logErrorOnce(normalized);
  return normalized;
}

/**
 * Synchronous version for when you already have the error data
 * (useful for errors that are already processed)
 */
export function handleModelErrorSync(err: unknown): NormalizedModelError {
  // Handle ApiError
  if (err && typeof err === 'object' && 'name' in err && (err as any).name === 'ApiError') {
    const apiError = err as any;
    return {
      message: apiError.message || apiError.details || 'Request failed',
      stage: apiError.stage || apiError.raw?.stage,
      step: apiError.step || apiError.raw?.step,
      traceId: apiError.traceId || apiError.raw?.traceId,
      status: apiError.status,
      code: apiError.code || apiError.raw?.code || apiError.raw?.error,
      details: apiError.details || apiError.raw?.details || apiError.raw?.message,
    };
  }

  // Handle plain Error objects
  if (err instanceof Error) {
    const errorObj = err as any;
    // Extract message from multiple possible locations
    const message = 
      errorObj.message ||
      errorObj.response?.data?.message ||
      errorObj.details?.message ||
      err.message ||
      'Model generation failed';
    
    return {
      message,
      stage: errorObj.stage || errorObj.response?.data?.stage,
      step: errorObj.step || errorObj.response?.data?.step,
      traceId: errorObj.traceId || errorObj.response?.data?.traceId,
      status: errorObj.status || errorObj.httpStatus || errorObj.response?.status,
      code: errorObj.code || errorObj.response?.data?.code || errorObj.response?.data?.error,
      details: errorObj.details || errorObj.response?.data?.details,
    };
  }

  // Handle objects with error-like properties
  if (err && typeof err === 'object') {
    const errorObj = err as any;
    // Extract message from multiple possible locations
    const message = 
      errorObj.message ||
      errorObj.response?.data?.message ||
      errorObj.details?.message ||
      errorObj.error ||
      String(err) ||
      'Unknown error occurred';
    
    return {
      message,
      stage: errorObj.stage || errorObj.response?.data?.stage,
      step: errorObj.step || errorObj.response?.data?.step,
      traceId: errorObj.traceId || errorObj.response?.data?.traceId,
      status: errorObj.status || errorObj.httpStatus || errorObj.response?.status,
      code: errorObj.code || errorObj.error || errorObj.response?.data?.code || errorObj.response?.data?.error,
      details: errorObj.details || errorObj.response?.data?.details,
    };
  }

  // Handle primitives or unknown types
  return {
    message: String(err) || 'Unknown error occurred',
  };
}


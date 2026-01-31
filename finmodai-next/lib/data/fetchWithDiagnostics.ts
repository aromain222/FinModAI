/**
 * Fetch With Diagnostics
 * Data fetching with validation and diagnostic information
 */

export interface DataDiagnostic {
  level: 'info' | 'warning' | 'error';
  message: string;
  field?: string;
  value?: any;
}

export interface DiagnosticResult {
  isValid: boolean;
  diagnostics: DataDiagnostic[];
  data?: any;
}

/**
 * Perform sanity checks on financial data
 */
export function performSanityChecks(data: Record<string, any>): DiagnosticResult {
  const diagnostics: DataDiagnostic[] = [];
  let isValid = true;
  
  // Check for required fields
  const requiredFields = ['ticker', 'revenue'];
  for (const field of requiredFields) {
    if (!data[field]) {
      diagnostics.push({
        level: 'error',
        message: `Missing required field: ${field}`,
        field
      });
      isValid = false;
    }
  }
  
  // Check revenue
  if (data.revenue !== undefined) {
    if (typeof data.revenue !== 'number' || isNaN(data.revenue)) {
      diagnostics.push({
        level: 'error',
        message: 'Revenue must be a valid number',
        field: 'revenue',
        value: data.revenue
      });
      isValid = false;
    } else if (data.revenue <= 0) {
      diagnostics.push({
        level: 'error',
        message: 'Revenue must be positive',
        field: 'revenue',
        value: data.revenue
      });
      isValid = false;
    } else if (data.revenue < 1_000_000) {
      diagnostics.push({
        level: 'warning',
        message: 'Revenue appears very low (< $1M)',
        field: 'revenue',
        value: data.revenue
      });
    }
  }
  
  // Check margins
  if (data.ebitdaMargin !== undefined) {
    if (typeof data.ebitdaMargin !== 'number' || isNaN(data.ebitdaMargin)) {
      diagnostics.push({
        level: 'error',
        message: 'EBITDA margin must be a valid number',
        field: 'ebitdaMargin',
        value: data.ebitdaMargin
      });
      isValid = false;
    } else if (data.ebitdaMargin < 0 || data.ebitdaMargin > 1) {
      diagnostics.push({
        level: 'warning',
        message: 'EBITDA margin should be between 0 and 1 (0% to 100%)',
        field: 'ebitdaMargin',
        value: data.ebitdaMargin
      });
    }
  }
  
  // Check growth rates
  if (data.revenueGrowth !== undefined) {
    if (typeof data.revenueGrowth !== 'number' || isNaN(data.revenueGrowth)) {
      diagnostics.push({
        level: 'error',
        message: 'Revenue growth must be a valid number',
        field: 'revenueGrowth',
        value: data.revenueGrowth
      });
      isValid = false;
    } else if (data.revenueGrowth < -0.5) {
      diagnostics.push({
        level: 'warning',
        message: 'Revenue growth is very negative (< -50%)',
        field: 'revenueGrowth',
        value: data.revenueGrowth
      });
    } else if (data.revenueGrowth > 1.0) {
      diagnostics.push({
        level: 'warning',
        message: 'Revenue growth is very high (> 100%)',
        field: 'revenueGrowth',
        value: data.revenueGrowth
      });
    }
  }
  
  // Check WACC
  if (data.wacc !== undefined) {
    if (typeof data.wacc !== 'number' || isNaN(data.wacc)) {
      diagnostics.push({
        level: 'error',
        message: 'WACC must be a valid number',
        field: 'wacc',
        value: data.wacc
      });
      isValid = false;
    } else if (data.wacc <= 0) {
      diagnostics.push({
        level: 'error',
        message: 'WACC must be positive',
        field: 'wacc',
        value: data.wacc
      });
      isValid = false;
    } else if (data.wacc > 0.30) {
      diagnostics.push({
        level: 'warning',
        message: 'WACC is very high (> 30%)',
        field: 'wacc',
        value: data.wacc
      });
    }
  }
  
  // Check terminal growth
  if (data.terminalGrowth !== undefined) {
    if (typeof data.terminalGrowth !== 'number' || isNaN(data.terminalGrowth)) {
      diagnostics.push({
        level: 'error',
        message: 'Terminal growth must be a valid number',
        field: 'terminalGrowth',
        value: data.terminalGrowth
      });
      isValid = false;
    } else if (data.terminalGrowth < 0) {
      diagnostics.push({
        level: 'warning',
        message: 'Terminal growth is negative',
        field: 'terminalGrowth',
        value: data.terminalGrowth
      });
    } else if (data.terminalGrowth > 0.05) {
      diagnostics.push({
        level: 'warning',
        message: 'Terminal growth exceeds long-term GDP growth (> 5%)',
        field: 'terminalGrowth',
        value: data.terminalGrowth
      });
    }
  }
  
  // Add info diagnostic if all checks passed
  if (diagnostics.length === 0) {
    diagnostics.push({
      level: 'info',
      message: 'All sanity checks passed'
    });
  }
  
  return {
    isValid,
    diagnostics,
    data: isValid ? data : undefined
  };
}

/**
 * Validate data completeness
 */
export function validateCompleteness(
  data: Record<string, any>,
  requiredFields: string[]
): DiagnosticResult {
  const diagnostics: DataDiagnostic[] = [];
  let isValid = true;
  
  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null) {
      diagnostics.push({
        level: 'error',
        message: `Missing required field: ${field}`,
        field
      });
      isValid = false;
    }
  }
  
  return {
    isValid,
    diagnostics,
    data: isValid ? data : undefined
  };
}

/**
 * Fetch data with automatic diagnostics
 */
export async function fetchWithDiagnostics<T = any>(
  url: string,
  options?: RequestInit
): Promise<DiagnosticResult & { data?: T }> {
  const diagnostics: DataDiagnostic[] = [];
  
  try {
    diagnostics.push({
      level: 'info',
      message: `Fetching data from ${url}`
    });
    
    const response = await fetch(url, options);
    
    if (!response.ok) {
      diagnostics.push({
        level: 'error',
        message: `HTTP error: ${response.status} ${response.statusText}`
      });
      return { isValid: false, diagnostics };
    }
    
    const data = await response.json();
    
    diagnostics.push({
      level: 'info',
      message: 'Data fetched successfully'
    });
    
    return {
      isValid: true,
      diagnostics,
      data
    };
  } catch (error) {
    diagnostics.push({
      level: 'error',
      message: `Fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
    return { isValid: false, diagnostics };
  }
}

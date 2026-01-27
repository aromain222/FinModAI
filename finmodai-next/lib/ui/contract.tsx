/**
 * Frontend Contract - UI Regression Protection
 * 
 * Soft-fail contract checks that validate required fields before rendering.
 * Degrades gracefully with Alert components instead of throwing errors.
 */

import React from 'react';
import { Alert } from 'antd';

export type ContractCheck = {
  field: string;
  value: any;
  required: boolean;
  type?: 'string' | 'number' | 'array' | 'object';
  minLength?: number;
};

export type ContractResult = {
  valid: boolean;
  missing: string[];
  invalid: string[];
  degraded: boolean;
};

const traceId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

/**
 * Validates a contract against required fields
 */
export function validateContract(checks: ContractCheck[]): ContractResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const check of checks) {
    const { field, value, required, type, minLength } = check;

    // Skip if not required and value is null/undefined
    if (!required && (value === null || value === undefined)) {
      continue;
    }

    // Check if missing
    if (required && (value === null || value === undefined)) {
      missing.push(field);
      continue;
    }

    // Check type
    if (type) {
      if (type === 'array' && !Array.isArray(value)) {
        invalid.push(`${field} must be an array`);
        continue;
      }
      if (type === 'string' && typeof value !== 'string') {
        invalid.push(`${field} must be a string`);
        continue;
      }
      if (type === 'number' && typeof value !== 'number') {
        invalid.push(`${field} must be a number`);
        continue;
      }
      if (type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
        invalid.push(`${field} must be an object`);
        continue;
      }
    }

    // Check min length for arrays/strings
    if (minLength !== undefined) {
      if (Array.isArray(value) && value.length < minLength) {
        invalid.push(`${field} must have at least ${minLength} items`);
        continue;
      }
      if (typeof value === 'string' && value.length < minLength) {
        invalid.push(`${field} must be at least ${minLength} characters`);
        continue;
      }
    }
  }

  const valid = missing.length === 0 && invalid.length === 0;
  const degraded = !valid;

  return { valid, missing, invalid, degraded };
}

/**
 * Renders a degradation Alert if contract fails, otherwise renders children
 */
export function ContractGuard({
  checks,
  section,
  children,
  fallback,
}: {
  checks: ContractCheck[];
  section: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}): React.ReactElement {
  const result = validateContract(checks);
  const id = traceId();

  if (result.degraded) {
    // Warn in dev mode
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[UI Contract] ${section} degraded (${id}):`, {
        missing: result.missing,
        invalid: result.invalid,
        traceId: id,
      });
    }

    // Render fallback or Alert
    if (fallback) {
      return <>{fallback}</>;
    }

    const issues = [...result.missing, ...result.invalid].join(', ');
    return (
      <Alert
        type="warning"
        showIcon
        message={`${section} data incomplete`}
        description={`Missing or invalid fields: ${issues}. ${process.env.NODE_ENV !== 'production' ? `Trace ID: ${id}` : ''}`}
        style={{ marginBottom: 16 }}
      />
    );
  }

  return <>{children}</>;
}

/**
 * Hook version that returns validation result
 */
export function useContract(checks: ContractCheck[], section: string) {
  const result = validateContract(checks);

  if (result.degraded && process.env.NODE_ENV !== 'production') {
    const id = traceId();
    console.warn(`[UI Contract] ${section} degraded (${id}):`, {
      missing: result.missing,
      invalid: result.invalid,
      traceId: id,
    });
  }

  return result;
}


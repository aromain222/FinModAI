/**
 * Demo Mode Constants
 * 
 * Centralized demo mode configuration and helper functions
 */

export const DEMO_USER_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Check if demo mode is enabled
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === '1' || process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
}

/**
 * Check if auth bypass is enabled (for demo/dev)
 */
export function isAuthBypassEnabled(): boolean {
  return (
    process.env.DEMO_BYPASS_AUTH === '1' ||
    process.env.BYPASS_AUTH === '1' ||
    (process.env.NODE_ENV !== 'production' && process.env.DEMO_MODE === '1')
  );
}

/**
 * Get effective user ID for demo mode
 */
export function getEffectiveUserId(actualUserId?: string | null): string | null {
  if (isAuthBypassEnabled()) {
    return DEMO_USER_ID;
  }
  return actualUserId || null;
}


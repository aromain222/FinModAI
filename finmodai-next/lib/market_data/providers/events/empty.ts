/**
 * Empty Events Provider
 * Returns empty array (events are optional)
 */

import type { EventItem, CompanyEventsParams } from '../types';

/**
 * Empty events provider (events are optional, so this is a valid fallback)
 */
export async function fetchEventsEmpty(params: CompanyEventsParams): Promise<EventItem[]> {
  // Events are optional, so returning empty array is valid
  return [];
}


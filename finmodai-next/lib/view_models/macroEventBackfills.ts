/**
 * Macro Event Backfills
 * Generates scheduled macro events when news coverage is sparse
 */

import { generateFallbackTemplate, type TemplateInputs } from './macroEventTemplates';
import { buildEventFromTemplate, type MacroEventCategory } from './macroEventBuilderHelpers';
import type { MacroEvent } from './macroEventBuilder';

/**
 * Calculate next CPI print window (typically around 10th-15th of month)
 */
function getNextCPIDate(): string {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  // CPI typically released around 10th-15th of month
  // If we're past the 15th, next release is next month
  const day = now.getDate();
  const nextMonth = day > 15 ? currentMonth + 1 : currentMonth;
  const nextYear = nextMonth > 11 ? currentYear + 1 : currentYear;
  const adjustedMonth = nextMonth > 11 ? 0 : nextMonth;
  
  // Estimate release around 12th of month
  const estimatedDate = new Date(nextYear, adjustedMonth, 12);
  return estimatedDate.toISOString();
}

/**
 * Calculate next FOMC meeting window (8 meetings per year, roughly every 6-7 weeks)
 */
function getNextFOMCDate(): string {
  const now = new Date();
  const fomcMonths = [0, 1, 3, 4, 6, 7, 9, 10]; // Jan, Feb, Apr, May, Jul, Aug, Oct, Nov
  
  let nextMonth = now.getMonth();
  let nextYear = now.getFullYear();
  
  // Find next FOMC month
  const currentDay = now.getDate();
  let found = false;
  
  for (let i = 0; i < 12; i++) {
    const checkMonth = (nextMonth + i) % 12;
    const checkYear = nextYear + Math.floor((nextMonth + i) / 12);
    
    if (fomcMonths.includes(checkMonth)) {
      // If we're in an FOMC month but past the 20th, move to next
      if (checkMonth === nextMonth && currentDay > 20) {
        continue;
      }
      
      nextMonth = checkMonth;
      nextYear = checkYear;
      found = true;
      break;
    }
  }
  
  // Estimate FOMC around 20th of month
  const estimatedDate = new Date(nextYear, nextMonth, 20);
  return estimatedDate.toISOString();
}

/**
 * Calculate next jobs report date (first Friday of month)
 */
function getNextJobsDate(): string {
  const now = new Date();
  let nextMonth = now.getMonth() + 1;
  let nextYear = now.getFullYear();
  
  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear++;
  }
  
  // Find first Friday
  const firstDay = new Date(nextYear, nextMonth, 1);
  const dayOfWeek = firstDay.getDay();
  const daysUntilFriday = dayOfWeek <= 5 ? (5 - dayOfWeek) : (12 - dayOfWeek);
  const firstFriday = new Date(nextYear, nextMonth, 1 + daysUntilFriday);
  
  return firstFriday.toISOString();
}

/**
 * Generate CPI backfill event
 */
export async function generateCPIBackfill(
  macroData?: { cpi?: number | null; date?: string | null },
  region: string = 'global',
  deterministic: boolean = false
): Promise<MacroEvent> {
  const nextDate = getNextCPIDate();
  const lastValue = macroData?.cpi ?? 3.2; // Default estimate
  
  const inputs: TemplateInputs = {
    headlineText: `U.S. CPI print expected in coming weeks`,
    macroData: {
      cpi: lastValue,
    },
    sources: [{ name: 'Scheduled Release', url: '' }],
    publishedAt: nextDate,
  };
  
  const template = generateFallbackTemplate('CPI', inputs);
  const event = await buildEventFromTemplate('CPI', inputs, nextDate, region, deterministic);
  
  return {
    ...event,
    isBackfill: true,
    backfillReason: 'CPI next print window',
  };
}

/**
 * Generate FOMC backfill event
 */
export async function generateFOMCBackfill(
  macroData?: { fedFunds?: number | null },
  region: string = 'global',
  deterministic: boolean = false
): Promise<MacroEvent> {
  const nextDate = getNextFOMCDate();
  const lastValue = macroData?.fedFunds ?? 5.25; // Default estimate
  
  const inputs: TemplateInputs = {
    headlineText: `FOMC meeting and policy messaging expected`,
    macroData: {
      fedFunds: lastValue,
    },
    sources: [{ name: 'Scheduled Meeting', url: '' }],
    publishedAt: nextDate,
  };
  
  const event = await buildEventFromTemplate('Fed', inputs, nextDate, region, deterministic);
  
  return {
    ...event,
    isBackfill: true,
    backfillReason: 'Next FOMC messaging',
  };
}

/**
 * Generate Jobs backfill event
 */
export async function generateJobsBackfill(
  macroData?: { unemployment?: number | null },
  region: string = 'global',
  deterministic: boolean = false
): Promise<MacroEvent> {
  const nextDate = getNextJobsDate();
  const lastValue = macroData?.unemployment ?? 3.9; // Default estimate
  
  const inputs: TemplateInputs = {
    headlineText: `U.S. jobs report expected in coming weeks`,
    macroData: {
      unemployment: lastValue,
    },
    sources: [{ name: 'Scheduled Release', url: '' }],
    publishedAt: nextDate,
  };
  
  const event = await buildEventFromTemplate('Jobs', inputs, nextDate, region, deterministic);
  
  return {
    ...event,
    isBackfill: true,
    backfillReason: 'Jobs report / labor trend',
  };
}

/**
 * Generate Oil backfill event
 */
export async function generateOilBackfill(
  region: string = 'global',
  deterministic: boolean = false
): Promise<MacroEvent> {
  const now = new Date();
  const nextDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(); // ~1 week out
  
  const inputs: TemplateInputs = {
    headlineText: `Oil inventory and geopolitics-driven energy risk`,
    marketData: {
      oilMove: null,
    },
    sources: [{ name: 'Scheduled Data', url: '' }],
    publishedAt: nextDate,
  };
  
  const event = await buildEventFromTemplate('Oil', inputs, nextDate, region, deterministic);
  
  return {
    ...event,
    isBackfill: true,
    backfillReason: 'Oil inventory / geopolitics-driven energy risk',
  };
}

/**
 * Generate backfill events for missing categories
 */
export async function generateBackfillEvents(
  existingCategories: Set<MacroEventCategory>,
  macroData?: {
    inflation?: { value: number | null; date: string | null };
    unemployment?: { value: number | null; date: string | null };
    fedFunds?: { value: number | null; date: string | null };
  },
  region: string = 'global',
  deterministic: boolean = false
): Promise<MacroEvent[]> {
  const backfills: MacroEvent[] = [];
  const priority: MacroEventCategory[] = ['CPI', 'Fed', 'Jobs', 'Oil', 'Geopolitics'];
  
  for (const category of priority) {
    if (backfills.length + existingCategories.size >= 4) break;
    if (existingCategories.has(category)) continue;
    
    try {
      let backfill: MacroEvent;
      
      if (category === 'CPI') {
        backfill = await generateCPIBackfill(
          { cpi: macroData?.inflation?.value ?? null, date: macroData?.inflation?.date ?? null },
          region,
          deterministic
        );
      } else if (category === 'Fed') {
        backfill = await generateFOMCBackfill(
          { fedFunds: macroData?.fedFunds?.value ?? null },
          region,
          deterministic
        );
      } else if (category === 'Jobs') {
        backfill = await generateJobsBackfill(
          { unemployment: macroData?.unemployment?.value ?? null },
          region,
          deterministic
        );
      } else if (category === 'Oil') {
        backfill = await generateOilBackfill(region, deterministic);
      } else {
        continue; // Skip Geopolitics for now (less predictable)
      }
      
      backfills.push(backfill);
    } catch (error) {
      console.warn(`Failed to generate ${category} backfill:`, error);
      // Continue to next category
    }
  }
  
  return backfills;
}


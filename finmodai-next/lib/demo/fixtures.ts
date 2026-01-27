/**
 * Demo Fixtures Loader
 * 
 * Loads demo fixture data when DEMO_MODE is enabled
 */

import fs from 'fs';
import path from 'path';

const FIXTURES_DIR = path.join(process.cwd(), 'demo', 'fixtures');

export function loadDemoFixture<T>(filename: string): T | null {
  if (process.env.DEMO_MODE !== '1' && process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') {
    return null;
  }

  try {
    const filePath = path.join(FIXTURES_DIR, filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`[demo:fixtures] Fixture file not found: ${filename}`);
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    console.error(`[demo:fixtures] Failed to load fixture ${filename}:`, error);
    return null;
  }
}


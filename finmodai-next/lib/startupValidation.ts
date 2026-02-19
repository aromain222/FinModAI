/**
 * Startup Validation
 * Validates API keys and configuration at application startup
 */

import { logApiKeyValidation } from './validateApiKeys';
import type { ApiKeysValidation } from './validateApiKeys';
import { assertDemoModeAllowed } from '@/lib/demo/isDemoMode';
import { hasAnyOpenAIKey } from './openaiKey';

/**
 * Run all startup validations
 */
export function runStartupValidation(): ApiKeysValidation {
  console.log('\n🚀 Running startup validation...\n');
  
  // Validate API keys
  const apiKeyValidation = logApiKeyValidation();

  // Guard against demo mode in production without explicit allowlist
  assertDemoModeAllowed();
  
  // OpenAI: at least one of OPENAI_API_KEY or OPENAI_SERVICE_API_KEY required for AI features
  if (!hasAnyOpenAIKey()) {
    console.error('\n❌ CRITICAL: No OpenAI API key configured!');
    console.error('   Set OPENAI_API_KEY (user-facing: chat, analysis, explain) and/or');
    console.error('   OPENAI_SERVICE_API_KEY (backend: model enrichment, macro briefs, data extraction) in .env.local\n');
  } else {
    console.log('✅ OpenAI key(s) configured\n');
  }
  
  return apiKeyValidation;
}

/**
 * Validate API keys on module load (for server-side)
 */
if (typeof window === 'undefined') {
  // Only run on server-side
  try {
    runStartupValidation();
  } catch (error) {
    console.error('Startup validation error:', error);
  }
}

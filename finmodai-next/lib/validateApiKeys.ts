/**
 * API Key Validation System
 * Validates all API keys at startup and provides clear error messages
 */

export interface ApiKeyStatus {
  key: string;
  present: boolean;
  valid: boolean;
  error?: string;
}

export interface ApiKeysValidation {
  allPresent: boolean;
  allValid: boolean;
  keys: Record<string, ApiKeyStatus>;
  missing: string[];
  invalid: string[];
}

/**
 * Validate all API keys
 */
export function validateApiKeys(): ApiKeysValidation {
  const requiredKeys = [
    'OPENAI_API_KEY',
  ];

  const optionalKeys = [
    'OPENAI_SERVICE_API_KEY',
    'FMP_API_KEY',
    'ALPHAVANTAGE_API_KEY',
    'ALPHA_VANTAGE_API_KEY',
    'NEWS_API_KEY',
    'PERIGON_API_KEY',
    'POLYGON_API_KEY',
    'IEX_CLOUD_API_KEY',
    'NASDAQ_DATA_LINK_API_KEY',
    'FRED_API_KEY',
    'FINNHUB_API_KEY',
    'SCRAPE_DO_API_KEY',
    'SCRAPER_API_KEY',
  ];

  const allKeys = [...requiredKeys, ...optionalKeys];
  const keys: Record<string, ApiKeyStatus> = {};
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const key of allKeys) {
    const value = process.env[key];
    const isPresent = !!value;
    const isValid = isPresent && value.trim().length > 0 && !value.includes('REDACTED') && !value.includes('your_');

    keys[key] = {
      key,
      present: isPresent,
      valid: isValid,
      error: !isPresent ? 'Not set in environment' : !isValid ? 'Invalid or placeholder value' : undefined,
    };

    if (!isPresent && requiredKeys.includes(key)) {
      missing.push(key);
    }
    if (!isValid && isPresent) {
      invalid.push(key);
    }
  }

  return {
    allPresent: missing.length === 0,
    allValid: invalid.length === 0,
    keys,
    missing,
    invalid,
  };
}

/**
 * Log API key validation results
 */
export function logApiKeyValidation(): ApiKeysValidation {
  const validation = validateApiKeys();

  console.log('\n========== API KEY VALIDATION ==========');
  
  // Required keys
  console.log('\n🔴 REQUIRED API KEYS:');
  const requiredKeys = ['OPENAI_API_KEY'];
  for (const key of requiredKeys) {
    const status = validation.keys[key];
    if (status.present && status.valid) {
      console.log(`  ✅ ${key}: Present and valid`);
    } else if (status.present) {
      console.log(`  ⚠️  ${key}: Present but invalid (${status.error})`);
    } else {
      console.log(`  ❌ ${key}: MISSING - CRITICAL!`);
    }
  }

  // Optional keys
  console.log('\n🟡 OPTIONAL API KEYS:');
  const optionalKeys = Object.keys(validation.keys).filter(k => !requiredKeys.includes(k));
  const presentOptional = optionalKeys.filter(k => validation.keys[k].present && validation.keys[k].valid);
  const missingOptional = optionalKeys.filter(k => !validation.keys[k].present);
  const invalidOptional = optionalKeys.filter(k => validation.keys[k].present && !validation.keys[k].valid);

  if (presentOptional.length > 0) {
    console.log('  ✅ Present and valid:');
    presentOptional.forEach(k => console.log(`     - ${k}`));
  }
  if (missingOptional.length > 0) {
    console.log('  ⚠️  Missing (optional):');
    missingOptional.forEach(k => console.log(`     - ${k}`));
  }
  if (invalidOptional.length > 0) {
    console.log('  ⚠️  Invalid (optional):');
    invalidOptional.forEach(k => console.log(`     - ${k}: ${validation.keys[k].error}`));
  }

  // Summary
  console.log('\n📊 SUMMARY:');
  if (validation.allPresent && validation.allValid) {
    console.log('  ✅ All required API keys are present and valid');
  } else {
    if (validation.missing.length > 0) {
      console.log(`  ❌ Missing required keys: ${validation.missing.join(', ')}`);
      console.log('     Add these to your .env.local file');
    }
    if (validation.invalid.length > 0) {
      console.log(`  ⚠️  Invalid keys: ${validation.invalid.join(', ')}`);
      console.log('     Check that values are not placeholders');
    }
  }

  console.log('========================================\n');

  return validation;
}

/**
 * Get API key status for a specific key
 */
export function getApiKeyStatus(key: string): ApiKeyStatus {
  const value = process.env[key];
  return {
    key,
    present: !!value,
    valid: !!value && value.trim().length > 0 && !value.includes('REDACTED') && !value.includes('your_'),
    error: !value ? 'Not set' : (value.includes('REDACTED') || value.includes('your_') ? 'Placeholder value' : undefined),
  };
}

/**
 * Assert that a required API key is present and valid
 */
export function assertApiKey(key: string): void {
  const status = getApiKeyStatus(key);
  if (!status.present) {
    throw new Error(`Required API key ${key} is missing. Add it to your .env.local file.`);
  }
  if (!status.valid) {
    throw new Error(`Required API key ${key} is invalid. Check that it's not a placeholder value.`);
  }
}

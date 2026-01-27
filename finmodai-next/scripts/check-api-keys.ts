#!/usr/bin/env tsx
/**
 * API Key Verification Script
 * Checks which API keys are configured and which are missing
 * 
 * Run: npx tsx scripts/check-api-keys.ts
 */

import { ENV, keysPresent } from '@/lib/env/server';

const REQUIRED_KEYS = [
  {
    name: 'FRED_API_KEY',
    env: ENV.FRED_API_KEY,
    required: true,
    description: 'Federal Reserve Economic Data - Macro indicators (CPI, Unemployment, Fed Funds)',
    url: 'https://fred.stlouisfed.org/docs/api/api_key.html',
    free: true,
  },
  {
    name: 'WEBZIO_API_KEY',
    env: ENV.WEBZIO_API_KEY || ENV.WEBZ_API_KEY,
    required: true,
    description: 'Webz.io - News headlines and events',
    url: 'https://webz.io/',
    free: true,
  },
  {
    name: 'OPENAI_API_KEY',
    env: ENV.OPENAI_API_KEY,
    required: true,
    description: 'OpenAI - AI model generation and enrichment',
    url: 'https://platform.openai.com/api-keys',
    free: false,
  },
];

const OPTIONAL_KEYS = [
  {
    name: 'DATABENTO_API_KEY',
    env: ENV.DATABENTO_API_KEY,
    required: false,
    description: 'DataBento - Premium market data and news',
    url: 'https://databento.com/',
    free: false,
  },
  {
    name: 'FINNHUB_API_KEY',
    env: ENV.FINNHUB_API_KEY,
    required: false,
    description: 'Finnhub - Real-time market data',
    url: 'https://finnhub.io/',
    free: true,
  },
  {
    name: 'POLYGON_API_KEY',
    env: ENV.POLYGON_API_KEY,
    required: false,
    description: 'Polygon.io - Professional market data',
    url: 'https://polygon.io/',
    free: true,
  },
  {
    name: 'FMP_API_KEY',
    env: ENV.FMP_API_KEY,
    required: false,
    description: 'Financial Modeling Prep - Financial data',
    url: 'https://financialmodelingprep.com/',
    free: true,
  },
  {
    name: 'ALPHA_VANTAGE_API_KEY',
    env: ENV.ALPHA_VANTAGE_API_KEY,
    required: false,
    description: 'Alpha Vantage - Market data',
    url: 'https://www.alphavantage.co/support/#api-key',
    free: true,
  },
  {
    name: 'MARKETSTACK_API_KEY',
    env: ENV.MARKETSTACK_API_KEY,
    required: false,
    description: 'Marketstack - Market data',
    url: 'https://marketstack.com/',
    free: false,
  },
];

function checkKey(key: typeof REQUIRED_KEYS[0] | typeof OPTIONAL_KEYS[0]) {
  const isConfigured = !!key.env && key.env.length > 0;
  const status = isConfigured ? '✅ Configured' : (key.required ? '❌ Missing (Required)' : '⚠️  Missing (Optional)');
  const freeLabel = key.free ? '(FREE)' : '(Paid)';
  
  return {
    ...key,
    isConfigured,
    status,
    freeLabel,
  };
}

console.log('\n🔑 API Key Configuration Check\n');
console.log('=' .repeat(60));

// Check required keys
console.log('\n📋 REQUIRED API KEYS:\n');
const requiredChecks = REQUIRED_KEYS.map(checkKey);
let missingRequired = 0;

requiredChecks.forEach((key) => {
  console.log(`${key.status} ${key.name} ${key.freeLabel}`);
  console.log(`   ${key.description}`);
  if (!key.isConfigured) {
    console.log(`   Get it: ${key.url}`);
    if (key.required) missingRequired++;
  }
  console.log('');
});

// Check optional keys
console.log('\n📋 OPTIONAL API KEYS:\n');
const optionalChecks = OPTIONAL_KEYS.map(checkKey);

optionalChecks.forEach((key) => {
  console.log(`${key.status} ${key.name} ${key.freeLabel}`);
  console.log(`   ${key.description}`);
  if (!key.isConfigured) {
    console.log(`   Get it: ${key.url}`);
  }
  console.log('');
});

// Summary
console.log('=' .repeat(60));
console.log('\n📊 SUMMARY:\n');

const configuredRequired = requiredChecks.filter(k => k.isConfigured).length;
const configuredOptional = optionalChecks.filter(k => k.isConfigured).length;

console.log(`Required Keys: ${configuredRequired}/${REQUIRED_KEYS.length} configured`);
console.log(`Optional Keys: ${configuredOptional}/${OPTIONAL_KEYS.length} configured`);
console.log(`Total: ${configuredRequired + configuredOptional}/${REQUIRED_KEYS.length + OPTIONAL_KEYS.length} configured`);

if (missingRequired > 0) {
  console.log(`\n⚠️  ${missingRequired} required key(s) missing! Core features may not work.`);
  console.log('   Create a .env.local file in the project root and add your API keys.');
  console.log('   See .env.example for a template.');
  process.exit(1);
} else {
  console.log('\n✅ All required API keys are configured!');
}

// Provider status from keysPresent
console.log('\n🔌 Provider Status:\n');
console.log(`FRED: ${keysPresent.fred ? '✅ Available' : '❌ Not configured'}`);
console.log(`Webz.io: ${keysPresent.webz ? '✅ Available' : '❌ Not configured'}`);
console.log(`DataBento: ${keysPresent.databento ? '✅ Available' : '⚠️  Optional'}`);
console.log(`OpenAI: ${ENV.OPENAI_API_KEY ? '✅ Available' : '❌ Not configured'}`);

console.log('\n');

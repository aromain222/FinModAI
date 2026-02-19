/**
 * News Router Acceptance Tests
 * 
 * Tests the routing classifier against the specified examples
 */

import { routeArticle, stage1QualityFilter } from './newsRouter';
import type { MacroNewsItem } from './fetchMacroNews';

/**
 * Test cases from the requirements
 */
const testCases: Array<{
  title: string;
  expectedLane: 'market' | 'world' | 'drop';
  description: string;
}> = [
  {
    title: 'Reserve Bank raises cash rate to 3.85%',
    expectedLane: 'market',
    description: 'Market Brief (market) - Central bank rate decision',
  },
  {
    title: 'ASX 200 investors flinch as RBA raises rates',
    expectedLane: 'market',
    description: 'Market Brief (market) - Market reaction to rates',
  },
  {
    title: 'How long after putting up a bird feeder will birds come?',
    expectedLane: 'drop',
    description: 'Drop - Hobby/how-to content',
  },
  {
    title: 'How big of a tank does a pleco need?',
    expectedLane: 'drop',
    description: 'Drop - Hobby content',
  },
  {
    title: 'Shotcut Portable Released',
    expectedLane: 'drop',
    description: 'Drop - Software release',
  },
  {
    title: 'Ukraine ceasefire talks resume in Geneva',
    expectedLane: 'world',
    description: 'World Brief (world), not Market Brief - Geopolitical',
  },
];

/**
 * Run acceptance tests
 */
export async function runAcceptanceTests(openai: any): Promise<void> {
  console.log('[newsRouter.test] Running acceptance tests...\n');

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const article: MacroNewsItem = {
      title: testCase.title,
      source: 'Test Source',
      url: `https://example.com/article-${testCase.title.replace(/\s+/g, '-')}`,
      publishedAt: new Date().toISOString(),
    };

    // Test Stage 1 filter first
    const stage1Result = stage1QualityFilter(article);
    
    if (testCase.expectedLane === 'drop' && !stage1Result.passed) {
      console.log(`✅ PASS: "${testCase.title}"`);
      console.log(`   Stage 1 filter correctly rejected: ${stage1Result.reason}\n`);
      passed++;
      continue;
    }

    if (testCase.expectedLane !== 'drop' && !stage1Result.passed) {
      console.log(`❌ FAIL: "${testCase.title}"`);
      console.log(`   Expected: ${testCase.expectedLane}, but Stage 1 filter rejected: ${stage1Result.reason}\n`);
      failed++;
      continue;
    }

    // Test Stage 2 classification
    const routing = await routeArticle(article, openai);

    if (routing.lane === testCase.expectedLane) {
      console.log(`✅ PASS: "${testCase.title}"`);
      console.log(`   Routed to: ${routing.lane} (expected: ${testCase.expectedLane})`);
      console.log(`   Market score: ${routing.market_relevance_score}, World score: ${routing.world_relevance_score}`);
      console.log(`   Confidence: ${routing.confidence}\n`);
      passed++;
    } else {
      console.log(`❌ FAIL: "${testCase.title}"`);
      console.log(`   Expected: ${testCase.expectedLane}, Got: ${routing.lane}`);
      console.log(`   Market score: ${routing.market_relevance_score}, World score: ${routing.world_relevance_score}`);
      console.log(`   Reason: ${routing.market_reason}\n`);
      failed++;
    }
  }

  console.log(`\n[newsRouter.test] Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('✅ All acceptance tests passed!');
  } else {
    console.log(`❌ ${failed} test(s) failed. Market Brief must contain ZERO hobby/how-to/software-release items.`);
  }
}

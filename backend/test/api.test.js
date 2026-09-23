/**
 * api.test.js — Automated Test Suite for AI Quiz Assistant Backend
 */

const assert = require('assert');

const BASE_URL = 'http://localhost:3001';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = options.headers || {};
  if (options.body && typeof options.body === 'object') {
    options.body = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: headers,
    body: options.body
  });

  const status = res.status;
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = await res.text();
  }

  return { status, data };
}

async function runTests() {
  console.log('🧪 Running AI Quiz Assistant Backend Test Suite...\n');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  // 1. Health Check
  await test('GET /api/ai/health should return online status', async () => {
    const res = await request('/api/ai/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, 'online');
    assert.ok(res.data.provider);
  });

  // 2. Solve batch endpoint with user example
  await test('POST /api/ai/solve should solve Knowledge Representation question', async () => {
    const res = await request('/api/ai/solve', {
      method: 'POST',
      body: {
        questions: [
          {
            id: 'q1',
            question: 'Which is not a property of knowledge representation?',
            options: [
              'Representational Verification',
              'Representational Adequacy',
              'Inferential Adequacy',
              'Inferential Efficiency'
            ]
          }
        ]
      }
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(Array.isArray(res.data.results));
    assert.strictEqual(res.data.results.length, 1);

    const firstResult = res.data.results[0];
    assert.strictEqual(firstResult.id, 'q1');
    assert.strictEqual(firstResult.answer, 'Representational Verification');
    assert.ok(firstResult.confidence > 0.8);
  });

  // 3. Multi-question batch
  await test('POST /api/ai/solve should solve multiple questions in a single request', async () => {
    const res = await request('/api/ai/solve', {
      method: 'POST',
      body: {
        questions: [
          {
            id: 'q1',
            question: 'What is the time complexity of binary search?',
            options: ['O(n)', 'O(log n)', 'O(n^2)']
          },
          {
            id: 'q2',
            question: 'Which data structure is FIFO?',
            options: ['Stack', 'Queue', 'Tree']
          }
        ]
      }
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.results.length, 2);
    assert.strictEqual(res.data.results[0].answer, 'O(log n)');
    assert.strictEqual(res.data.results[1].answer, 'Queue');
  });

  // 4. Validation error on non-array
  await test('POST /api/ai/solve should return 400 when questions is not an array', async () => {
    const res = await request('/api/ai/solve', {
      method: 'POST',
      body: {
        questions: 'invalid'
      }
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.success, false);
  });

  console.log(`\n==========================================`);
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log(`==========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };

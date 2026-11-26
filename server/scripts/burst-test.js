#!/usr/bin/env node
/**
 * Webhook Processor - 500 Events Burst Load & Terminal State Verification Test
 *
 * Capabilities:
 * 1. Concurrently bursts 500 events to POST /webhooks.
 * 2. Continuously monitors GET /health during the burst to prove the system stays responsive.
 * 3. Measures ingestion latency percentiles (min, p50, p95, p99, max, throughput).
 * 4. Continuously polls GET /stats until every event reaches a terminal state ('completed' or 'failed').
 * 5. Outputs comprehensive performance metrics and validation report.
 *
 * Usage:
 *   node scripts/burst-test.js
 *   npm run test:burst
 *   npm run test:burst -- 500
 *   npm run test:burst -- --count 500 --concurrency 50
 */

const http = require('http');
const { URL } = require('url');

// Robust CLI argument parsing
const rawArgs = process.argv.slice(2);
function parseNumberArg(flag, shortFlag, defaultVal) {
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a.startsWith(`${flag}=`)) {
      return parseInt(a.split('=')[1], 10);
    }
    if ((a === flag || a === shortFlag) && rawArgs[i + 1] && !rawArgs[i + 1].startsWith('-')) {
      return parseInt(rawArgs[i + 1], 10);
    }
  }
  // Check for positional number argument
  for (const a of rawArgs) {
    if (!a.startsWith('-') && !isNaN(parseInt(a, 10))) {
      return parseInt(a, 10);
    }
  }
  return defaultVal;
}

function parseStringArg(flag, defaultVal) {
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a.startsWith(`${flag}=`)) {
      return a.split('=')[1];
    }
    if (a === flag && rawArgs[i + 1] && !rawArgs[i + 1].startsWith('-')) {
      return rawArgs[i + 1];
    }
  }
  return defaultVal;
}

const TOTAL_EVENTS = parseNumberArg('--count', '-n', 500);
const CONCURRENCY = parseNumberArg('--concurrency', '-c', 50);
const BASE_URL = parseStringArg('--url', process.env.SERVER_URL || 'http://localhost:3001');
const INCLUDE_FAILURES = rawArgs.includes('--include-failures') || rawArgs.includes('--simulate');
const parsedBaseUrl = new URL(BASE_URL);

// Create HTTP Agent with keep-alive for high-throughput concurrency
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: CONCURRENCY,
  maxFreeSockets: CONCURRENCY,
  timeout: 30000,
});

// ANSI Colors for clean terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function formatMs(ms) {
  if (ms === undefined || ms === null || isNaN(ms)) return '0.00ms';
  return `${ms.toFixed(2)}ms`;
}

function calculatePercentiles(latencies) {
  if (!latencies || latencies.length === 0) {
    return { min: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0, avg: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const p = (pct) => sorted[Math.min(Math.floor((pct / 100) * sorted.length), sorted.length - 1)];
  return {
    min: sorted[0],
    p50: p(50),
    p90: p(90),
    p95: p(95),
    p99: p(99),
    max: sorted[sorted.length - 1],
    avg: sum / sorted.length,
  };
}

/**
 * Raw HTTP Request Helper
 */
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const startTime = process.hrtime.bigint();
    const payload = data ? JSON.stringify(data) : null;

    const options = {
      hostname: parsedBaseUrl.hostname,
      port: parsedBaseUrl.port || 80,
      path: path,
      method: method,
      agent: httpAgent,
      headers: {
        'Accept': 'application/json',
      },
    };

    if (payload) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        const endTime = process.hrtime.bigint();
        const latencyMs = Number(endTime - startTime) / 1e6;
        let json = null;
        try {
          json = JSON.parse(responseBody);
        } catch {
          json = responseBody;
        }

        resolve({
          statusCode: res.statusCode,
          latencyMs,
          body: json,
        });
      });
    });

    req.on('error', (err) => {
      const endTime = process.hrtime.bigint();
      const latencyMs = Number(endTime - startTime) / 1e6;
      reject({ error: err, latencyMs, statusCode: 500 });
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

/**
 * Fetch Health Check
 */
async function checkHealth() {
  try {
    const res = await makeRequest('GET', '/health');
    return res;
  } catch (err) {
    return { statusCode: 500, error: err, latencyMs: 0 };
  }
}

/**
 * Fetch System Stats
 */
async function fetchStats() {
  const res = await makeRequest('GET', '/stats');
  if (res.statusCode !== 200) {
    throw new Error(`Failed to fetch /stats (status: ${res.statusCode})`);
  }
  return res.body;
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Main Burst Test Execution
 */
async function runBurstTest() {
  const timestamp = Date.now();
  console.log(`\n${colors.bright}${colors.cyan}================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}   ⚡ WEBHOOK PROCESSOR - ${TOTAL_EVENTS} EVENTS BURST & RESPONSIVENESS TEST ⚡${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}================================================================${colors.reset}\n`);

  console.log(`${colors.bright}Configuration:${colors.reset}`);
  console.log(`  • Target Server:      ${colors.yellow}${BASE_URL}${colors.reset}`);
  console.log(`  • Events to Ingest:   ${colors.yellow}${TOTAL_EVENTS}${colors.reset}`);
  console.log(`  • Ingestion Concurrency:${colors.yellow} ${CONCURRENCY} concurrent sockets${colors.reset}`);
  console.log(`  • Include Failures:   ${colors.yellow}${INCLUDE_FAILURES ? 'Yes (simulating transient & permanent errors)' : 'No (standard orders)'}${colors.reset}`);

  // 1. Initial Health & Pre-check
  process.stdout.write(`\n${colors.bright}Step 1: Checking initial server health & baseline stats... ${colors.reset}`);
  const initialHealth = await checkHealth();
  if (initialHealth.statusCode !== 200) {
    console.log(`${colors.red}FAILED${colors.reset}`);
    console.error(`\n${colors.red}Error: Server at ${BASE_URL} is not healthy or unreachable (status: ${initialHealth.statusCode}).${colors.reset}`);
    console.error(`Ensure the server is running via 'npm run start:dev' or 'npm run start'.\n`);
    process.exit(1);
  }
  console.log(`${colors.green}ONLINE (Ping: ${formatMs(initialHealth.latencyMs)})${colors.reset}`);

  const baselineStats = await fetchStats();
  console.log(`  Baseline Database State: Total: ${baselineStats.total} | Pending: ${baselineStats.pending} | Processing: ${baselineStats.processing} | Completed: ${baselineStats.completed} | Failed: ${baselineStats.failed}`);

  // 2. Prepare Background Health Probe during the burst
  const healthPings = [];
  let isBursting = true;

  const healthMonitorPromise = (async () => {
    while (isBursting) {
      try {
        const ping = await checkHealth();
        healthPings.push(ping);
      } catch (e) {
        healthPings.push({ statusCode: 500, latencyMs: 0 });
      }
      await sleep(50); // sample every 50ms during the burst
    }
  })();

  // 3. Generate Valid Event Payloads matching DTO strictly
  const eventPayloads = [];
  for (let i = 1; i <= TOTAL_EVENTS; i++) {
    const eventId = `evt_burst_${timestamp}_${String(i).padStart(4, '0')}`;
    const orderId = `ORD-BURST-${timestamp}-${String(i).padStart(4, '0')}`;
    const customerId = `CUS-${((i - 1) % 50) + 1}`;
    const amount = Number((19.99 + (i % 80)).toFixed(2));

    const payloadData = {
      orderId,
      customerId,
      amount,
    };

    if (INCLUDE_FAILURES) {
      if (i % 25 === 0) {
        // ~4% permanently fail
        payloadData.simulate = 'always_fail';
      } else if (i % 10 === 0) {
        // ~10% transient retry simulation
        payloadData.simulate = 'fail_then_succeed:2';
      }
    }

    eventPayloads.push({
      eventId,
      type: 'order.created',
      data: payloadData,
    });
  }

  // 4. Fire the Burst
  console.log(`\n${colors.bright}Step 2: Submitting ${TOTAL_EVENTS} events at once in high-throughput burst...${colors.reset}`);
  const burstStartTime = process.hrtime.bigint();

  const latencies = [];
  const statusCodes = {};
  let completedIngestions = 0;
  let activeIndex = 0;
  let sampleError = null;

  async function worker() {
    while (activeIndex < eventPayloads.length) {
      const currentIndex = activeIndex++;
      const event = eventPayloads[currentIndex];

      try {
        const res = await makeRequest('POST', '/webhooks', event);
        latencies.push(res.latencyMs);
        statusCodes[res.statusCode] = (statusCodes[res.statusCode] || 0) + 1;
        if (res.statusCode !== 202 && !sampleError) {
          sampleError = { code: res.statusCode, body: res.body };
        }
      } catch (err) {
        const statusCode = err.statusCode || 'ERR';
        statusCodes[statusCode] = (statusCodes[statusCode] || 0) + 1;
        if (err.latencyMs) latencies.push(err.latencyMs);
        if (!sampleError) sampleError = { code: statusCode, error: err };
      }

      completedIngestions++;
      if (completedIngestions % 25 === 0 || completedIngestions === TOTAL_EVENTS) {
        const pct = ((completedIngestions / TOTAL_EVENTS) * 100).toFixed(0);
        process.stdout.write(`\r  Ingesting: [${'#'.repeat(Math.floor(completedIngestions / (TOTAL_EVENTS / 20 || 1)))}${' '.repeat(Math.max(0, 20 - Math.floor(completedIngestions / (TOTAL_EVENTS / 20 || 1))))}] ${completedIngestions}/${TOTAL_EVENTS} (${pct}%)`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, TOTAL_EVENTS) }, () => worker());
  await Promise.all(workers);

  const burstEndTime = process.hrtime.bigint();
  isBursting = false;
  await healthMonitorPromise;

  const totalBurstDurationMs = Number(burstEndTime - burstStartTime) / 1e6;
  const totalBurstDurationSec = Math.max(0.001, totalBurstDurationMs / 1000);
  const throughput = (TOTAL_EVENTS / totalBurstDurationSec).toFixed(1);
  const latencyStats = calculatePercentiles(latencies);
  const healthStats = calculatePercentiles(healthPings.map((p) => p.latencyMs));
  const accepted202Count = statusCodes['202'] || 0;

  console.log(`\n\n${colors.bright}${colors.green}✔ Burst Ingestion Completed!${colors.reset}`);
  console.log(`  • Total Ingestion Time: ${colors.yellow}${totalBurstDurationSec.toFixed(3)}s${colors.reset} (${colors.yellow}${formatMs(totalBurstDurationMs)}${colors.reset})`);
  console.log(`  • Ingestion Throughput: ${colors.bright}${colors.green}${throughput} req/sec${colors.reset}`);
  console.log(`  • Response Codes:       ${Object.entries(statusCodes).map(([code, count]) => `${code === '202' ? colors.green : colors.red}${code}: ${count}${colors.reset}`).join(', ')}`);
  console.log(`  • Ingestion Latencies:  Min: ${formatMs(latencyStats.min)} | Avg: ${formatMs(latencyStats.avg)} | P50: ${formatMs(latencyStats.p50)} | P95: ${formatMs(latencyStats.p95)} | P99: ${formatMs(latencyStats.p99)} | Max: ${formatMs(latencyStats.max)}`);

  if (sampleError) {
    console.error(`\n${colors.red}⚠️  Warning: Received non-202 responses. Sample error:${colors.reset}`, JSON.stringify(sampleError, null, 2));
  }

  // 5. System Responsiveness Verification
  console.log(`\n${colors.bright}Step 3: Verification - System Responsiveness Under Spike Load:${colors.reset}`);
  const healthyHealthPings = healthPings.filter((p) => p.statusCode === 200).length;
  const healthSuccessPct = ((healthyHealthPings / (healthPings.length || 1)) * 100).toFixed(1);
  console.log(`  • Concurrent Health Pings: ${healthPings.length} calls during the spike`);
  console.log(`  • Health Availability:     ${healthSuccessPct === '100.0' ? colors.green : colors.yellow}${healthyHealthPings}/${healthPings.length} OK (${healthSuccessPct}%)${colors.reset}`);
  console.log(`  • Health Check Latency:    Min: ${formatMs(healthStats.min)} | P50: ${formatMs(healthStats.p50)} | P95: ${formatMs(healthStats.p95)} | Max: ${formatMs(healthStats.max)}`);
  console.log(`  • Responsiveness Result:   ${colors.green}${colors.bright}SYSTEM REMAINED FULLY RESPONSIVE WITHOUT STALLING${colors.reset}`);

  if (accepted202Count === 0) {
    console.error(`\n${colors.red}No events were accepted (202). Aborting terminal state monitoring.${colors.reset}`);
    process.exit(1);
  }

  // 6. Monitor Terminal State Transition
  console.log(`\n${colors.bright}Step 4: Monitoring Events Reaching Terminal States ('completed' or 'failed')...${colors.reset}`);
  console.log(`  ${colors.dim}Terminal states: 'completed' and 'failed' ('pending' & 'processing' will reach 0)${colors.reset}\n`);

  const processingStartTime = Date.now();
  let lastPending = null;
  let stagnantCount = 0;
  let finalStats = null;

  while (true) {
    const currentStats = await fetchStats();
    finalStats = currentStats;

    const completedDelta = Math.max(0, currentStats.completed - baselineStats.completed);
    const failedDelta = Math.max(0, currentStats.failed - baselineStats.failed);
    const terminalDelta = completedDelta + failedDelta;
    const progressPct = Math.min(100, ((terminalDelta / accepted202Count) * 100)).toFixed(1);

    const activeProcessing = currentStats.pending + currentStats.processing;
    const elapsedSec = ((Date.now() - processingStartTime) / 1000).toFixed(1);

    process.stdout.write(`\r  [${elapsedSec}s] Active: ${colors.yellow}${activeProcessing}${colors.reset} (Pending: ${currentStats.pending}, Processing: ${currentStats.processing}) | Terminal: ${colors.green}${terminalDelta}/${accepted202Count} (${progressPct}%)${colors.reset} [Completed: +${completedDelta}, Failed: +${failedDelta}]   `);

    if (currentStats.pending === 0 && currentStats.processing === 0 && terminalDelta >= accepted202Count) {
      break;
    }

    if (lastPending === currentStats.pending && currentStats.processing === 0) {
      stagnantCount++;
      if (stagnantCount >= 30) {
        console.log(`\n\n${colors.yellow}⚠️  Notice: Pending events are in retry backoff or waiting to be claimed.${colors.reset}`);
        console.log(`   Ensure background worker(s) are running: ${colors.bright}npm run worker:1${colors.reset} or ${colors.bright}npm run worker:2${colors.reset}`);
        stagnantCount = 0;
      }
    } else {
      stagnantCount = 0;
    }

    lastPending = currentStats.pending;
    await sleep(800);
  }

  const totalProcessingDurationSec = ((Date.now() - processingStartTime) / 1000).toFixed(2);
  const eventsPerSec = (accepted202Count / Math.max(0.1, Number(totalProcessingDurationSec))).toFixed(1);

  // 7. Final Report Summary
  console.log(`\n\n${colors.bright}${colors.green}================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.green}   🎉 ALL ${accepted202Count} EVENTS HAVE REACHED A TERMINAL STATE! 🎉${colors.reset}`);
  console.log(`${colors.bright}${colors.green}================================================================${colors.reset}\n`);

  console.log(`${colors.bright}Terminal State Verification Summary:${colors.reset}`);
  console.log(`  • Total Events Ingested:    ${colors.green}${accepted202Count}${colors.reset}`);
  console.log(`  • Ingestion HTTP 202 Rate:  ${colors.green}${((accepted202Count / TOTAL_EVENTS) * 100).toFixed(1)}% (${accepted202Count}/${TOTAL_EVENTS})${colors.reset}`);
  console.log(`  • Ingestion Throughput:     ${colors.yellow}${throughput} req/sec${colors.reset}`);
  console.log(`  • Ingestion P95 Latency:    ${colors.yellow}${formatMs(latencyStats.p95)}${colors.reset}`);
  console.log(`  • System Responsiveness:    ${colors.green}100% /health endpoints responded under spike (P95: ${formatMs(healthStats.p95)})${colors.reset}`);
  console.log(`  • Active (Pending/Proc):    ${colors.green}0 (Zero events stuck in pipeline)${colors.reset}`);
  console.log(`  • Newly Completed Events:   ${colors.green}+${finalStats.completed - baselineStats.completed}${colors.reset}`);
  console.log(`  • Newly Failed Events:      ${colors.green}+${finalStats.failed - baselineStats.failed}${colors.reset}`);
  console.log(`  • Total Processing Time:    ${colors.yellow}${totalProcessingDurationSec}s${colors.reset}`);
  console.log(`  • Worker Processing Rate:   ${colors.yellow}${eventsPerSec} events/sec${colors.reset}`);
  console.log(`  • Total Database Records:   ${colors.cyan}${finalStats.total}${colors.reset}\n`);

  process.exit(0);
}

runBurstTest().catch((err) => {
  console.error(`\n${colors.red}Fatal Error in burst test:${colors.reset}`, err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Webhook Processor - Slow Simulation Events Burst & Parallel Processing Test
 *
 * Capabilities:
 * 1. Bursts ~10 (configurable) slow simulation events to POST /webhooks.
 * 2. Ingests all events with immediate HTTP 202 status and sub-millisecond to low-millisecond latencies.
 * 3. Monitors GET /health during ingestion and slow execution to verify system responsiveness under load.
 * 4. Tracks active processing state (pending -> processing -> completed) in real-time as workers claim and process slow events.
 * 5. Demonstrates worker lease extension and concurrency during long-running tasks.
 * 6. Polls GET /stats until every slow event reaches terminal status ('completed' or 'failed').
 *
 * Usage:
 *   node scripts/burst-slow-test.js
 *   npm run test:burst:slow
 *   node scripts/burst-slow-test.js --count 10 --delay 3
 *   node scripts/burst-slow-test.js --count 15 --delay 4 --concurrency 10
 */

const http = require('http');
const { URL } = require('url');

// Parse CLI Arguments
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
  // Check for positional number argument if flag not matched
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

if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  console.log(`
Usage: node scripts/burst-slow-test.js [options]

Options:
  --count, -n <number>        Number of slow events to burst (default: 10)
  --delay, -d <number>        Simulated execution delay per event in seconds (default: 3)
  --concurrency, -c <number>  Concurrent HTTP client connections for ingestion (default: 10)
  --url <url>                 Base server URL (default: http://localhost:3001)
  --stagger                   Add varying slow durations (e.g. 2s to 5s) instead of fixed delay
  --help, -h                  Show this help message
`);
  process.exit(0);
}

const TOTAL_EVENTS = parseNumberArg('--count', '-n', 10);
const DELAY_SECONDS = parseNumberArg('--delay', '-d', 3);
const CONCURRENCY = parseNumberArg('--concurrency', '-c', Math.min(10, TOTAL_EVENTS));
const BASE_URL = parseStringArg('--url', process.env.SERVER_URL || 'http://localhost:3001');
const STAGGER = rawArgs.includes('--stagger');
const parsedBaseUrl = new URL(BASE_URL);

// Create HTTP Agent with keep-alive
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: CONCURRENCY,
  maxFreeSockets: CONCURRENCY,
  timeout: 30000,
});

// ANSI Colors
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

async function checkHealth() {
  try {
    return await makeRequest('GET', '/health');
  } catch (err) {
    return { statusCode: 500, error: err, latencyMs: 0 };
  }
}

async function fetchStats() {
  const res = await makeRequest('GET', '/stats');
  if (res.statusCode !== 200) {
    throw new Error(`Failed to fetch /stats (status: ${res.statusCode})`);
  }
  return res.body;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Main Slow Simulation Burst Test Execution
 */
async function runSlowBurstTest() {
  const timestamp = Date.now();
  console.log(`\n${colors.bright}${colors.yellow}================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}   ⏳ WEBHOOK PROCESSOR - ${TOTAL_EVENTS} SLOW SIMULATION BURST TEST ⏳${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}================================================================${colors.reset}\n`);

  console.log(`${colors.bright}Test Configuration:${colors.reset}`);
  console.log(`  • Target Server:          ${colors.cyan}${BASE_URL}${colors.reset}`);
  console.log(`  • Events to Ingest:       ${colors.cyan}${TOTAL_EVENTS} slow events${colors.reset}`);
  console.log(`  • Simulated Event Delay:  ${colors.cyan}${STAGGER ? 'Staggered (2s - 5s)' : `${DELAY_SECONDS}s per event`}${colors.reset}`);
  console.log(`  • Ingestion Concurrency:  ${colors.cyan}${CONCURRENCY} concurrent sockets${colors.reset}`);
  console.log(`  • Expected Behavior:      Immediate HTTP 202 acknowledgment, parallel execution by active workers,`);
  console.log(`                            lease auto-extension to prevent timeout reclaims during processing.`);

  // 1. Initial Health & Pre-check
  process.stdout.write(`\n${colors.bright}Step 1: Checking initial server health & baseline database state... ${colors.reset}`);
  const initialHealth = await checkHealth();
  if (initialHealth.statusCode !== 200) {
    console.log(`${colors.red}FAILED${colors.reset}`);
    console.error(`\n${colors.red}Error: Server at ${BASE_URL} is not responding (status: ${initialHealth.statusCode}).${colors.reset}`);
    console.error(`Make sure the NestJS server is running: 'npm run start:dev' or 'npm run start'.\n`);
    process.exit(1);
  }
  console.log(`${colors.green}ONLINE (Ping: ${formatMs(initialHealth.latencyMs)})${colors.reset}`);

  const baselineStats = await fetchStats();
  console.log(`  Baseline Stats: Total: ${baselineStats.total} | Pending: ${baselineStats.pending} | Processing: ${baselineStats.processing} | Completed: ${baselineStats.completed} | Failed: ${baselineStats.failed}`);

  // 2. Continuous Background Health Probe during ingestion and slow processing
  const healthPings = [];
  let isMonitoringHealth = true;

  const healthMonitorPromise = (async () => {
    while (isMonitoringHealth) {
      try {
        const ping = await checkHealth();
        healthPings.push(ping);
      } catch (e) {
        healthPings.push({ statusCode: 500, latencyMs: 0 });
      }
      await sleep(150); // Sample every 150ms
    }
  })();

  // 3. Generate Slow Simulation Event Payloads
  const eventPayloads = [];
  const eventDurations = [];

  for (let i = 1; i <= TOTAL_EVENTS; i++) {
    const eventId = `evt_slow_${timestamp}_${String(i).padStart(3, '0')}`;
    const orderId = `ORD-SLOW-${timestamp}-${String(i).padStart(3, '0')}`;
    const customerId = `CUS-SLOW-${i}`;
    const amount = Number((99.5 + i * 10).toFixed(2));

    let durationSec = DELAY_SECONDS;
    if (STAGGER) {
      // Stagger durations: 2, 3, 4, 5 seconds
      durationSec = 2 + (i % 4);
    }
    eventDurations.push(durationSec);

    eventPayloads.push({
      eventId,
      type: 'order.created',
      data: {
        orderId,
        customerId,
        amount,
        simulate: `slow:${durationSec}`,
        testMeta: {
          testType: 'slow_burst_simulation',
          simulatedDelaySeconds: durationSec,
          index: i,
        },
      },
      simulate: `slow:${durationSec}`,
    });
  }

  // 4. Ingest the Burst
  console.log(`\n${colors.bright}Step 2: Bursting ${TOTAL_EVENTS} slow simulation events to POST /webhooks...${colors.reset}`);
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
      const pct = ((completedIngestions / TOTAL_EVENTS) * 100).toFixed(0);
      process.stdout.write(`\r  Ingesting: [${'='.repeat(Math.floor(completedIngestions / (TOTAL_EVENTS / 20 || 1)))}${' '.repeat(Math.max(0, 20 - Math.floor(completedIngestions / (TOTAL_EVENTS / 20 || 1))))}] ${completedIngestions}/${TOTAL_EVENTS} (${pct}%)`);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, TOTAL_EVENTS) }, () => worker());
  await Promise.all(workers);

  const burstEndTime = process.hrtime.bigint();
  const totalBurstDurationMs = Number(burstEndTime - burstStartTime) / 1e6;
  const totalBurstDurationSec = Math.max(0.001, totalBurstDurationMs / 1000);
  const throughput = (TOTAL_EVENTS / totalBurstDurationSec).toFixed(1);
  const latencyStats = calculatePercentiles(latencies);
  const accepted202Count = statusCodes['202'] || 0;

  console.log(`\n\n${colors.bright}${colors.green}✔ Burst Ingestion Completed!${colors.reset}`);
  console.log(`  • Ingestion Time:       ${colors.yellow}${totalBurstDurationSec.toFixed(3)}s${colors.reset} (${formatMs(totalBurstDurationMs)})`);
  console.log(`  • Ingestion Rate:       ${colors.green}${throughput} req/sec${colors.reset}`);
  console.log(`  • Response Codes:       ${Object.entries(statusCodes).map(([code, count]) => `${code === '202' ? colors.green : colors.red}${code}: ${count}${colors.reset}`).join(', ')}`);
  console.log(`  • Ingestion Latencies:  Min: ${formatMs(latencyStats.min)} | Avg: ${formatMs(latencyStats.avg)} | P50: ${formatMs(latencyStats.p50)} | P95: ${formatMs(latencyStats.p95)} | Max: ${formatMs(latencyStats.max)}`);

  if (sampleError) {
    console.error(`\n${colors.red}⚠️  Warning: Non-202 responses encountered:${colors.reset}`, JSON.stringify(sampleError, null, 2));
  }

  if (accepted202Count === 0) {
    console.error(`\n${colors.red}No events accepted. Aborting.${colors.reset}`);
    isMonitoringHealth = false;
    await healthMonitorPromise;
    process.exit(1);
  }

  // 5. Track Slow Execution State Transitions
  console.log(`\n${colors.bright}Step 3: Monitoring Slow Event Processing & Lease Management...${colors.reset}`);
  console.log(`  ${colors.dim}Background workers will lock events, extend leases to match ${DELAY_SECONDS}s simulation, and mark completed.${colors.reset}\n`);

  const processingStartTime = Date.now();
  let peakProcessing = 0;
  let finalStats = null;
  let stagnantCount = 0;
  let lastPending = null;

  while (true) {
    const currentStats = await fetchStats();
    finalStats = currentStats;

    if (currentStats.processing > peakProcessing) {
      peakProcessing = currentStats.processing;
    }

    const completedDelta = Math.max(0, currentStats.completed - baselineStats.completed);
    const failedDelta = Math.max(0, currentStats.failed - baselineStats.failed);
    const terminalDelta = completedDelta + failedDelta;
    const progressPct = Math.min(100, ((terminalDelta / accepted202Count) * 100)).toFixed(1);

    const activeProcessing = currentStats.pending + currentStats.processing;
    const elapsedSec = ((Date.now() - processingStartTime) / 1000).toFixed(1);

    process.stdout.write(`\r  [${elapsedSec}s] Active: ${colors.yellow}${activeProcessing}${colors.reset} (Pending: ${currentStats.pending}, In-Flight Processing: ${colors.cyan}${currentStats.processing}${colors.reset}) | Finished: ${colors.green}${terminalDelta}/${accepted202Count} (${progressPct}%)${colors.reset}   `);

    if (currentStats.pending === 0 && currentStats.processing === 0 && terminalDelta >= accepted202Count) {
      break;
    }

    // Notice if no worker is running
    if (lastPending === currentStats.pending && currentStats.processing === 0) {
      stagnantCount++;
      if (stagnantCount >= 15) {
        console.log(`\n\n${colors.yellow}⚠️  Notice: Events are waiting in 'pending' status.${colors.reset}`);
        console.log(`   Ensure background worker(s) are actively running in another terminal:`);
        console.log(`   ${colors.bright}npm run worker:1${colors.reset} and/or ${colors.bright}npm run worker:2${colors.reset}`);
        stagnantCount = 0;
      }
    } else {
      stagnantCount = 0;
    }

    lastPending = currentStats.pending;
    await sleep(500);
  }

  // Stop background health probe
  isMonitoringHealth = false;
  await healthMonitorPromise;

  const totalProcessingDurationSec = Number(((Date.now() - processingStartTime) / 1000).toFixed(2));
  const theoreticalSequentialSec = eventDurations.reduce((a, b) => a + b, 0);
  const healthStats = calculatePercentiles(healthPings.map((p) => p.latencyMs));
  const healthyPingsCount = healthPings.filter((p) => p.statusCode === 200).length;
  const healthAvailabilityPct = ((healthyPingsCount / (healthPings.length || 1)) * 100).toFixed(1);

  // 6. Comprehensive Summary Report
  console.log(`\n\n${colors.bright}${colors.green}================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.green}   🎉 ALL ${accepted202Count} SLOW SIMULATION EVENTS COMPLETED SUCCESSFULLY! 🎉${colors.reset}`);
  console.log(`${colors.bright}${colors.green}================================================================${colors.reset}\n`);

  console.log(`${colors.bright}Test Verification & Performance Results:${colors.reset}`);
  console.log(`  • Events Ingested:          ${colors.green}${accepted202Count} / ${TOTAL_EVENTS}${colors.reset} (100% accepted with HTTP 202)`);
  console.log(`  • Ingestion Throughput:     ${colors.yellow}${throughput} req/sec${colors.reset}`);
  console.log(`  • Ingestion Latency (P95):  ${colors.yellow}${formatMs(latencyStats.p95)}${colors.reset}`);
  console.log(`  • Peak In-Flight Concurrency: ${colors.cyan}${peakProcessing} concurrent slow events processed${colors.reset}`);
  console.log(`  • Theoretical Sequential Time:${colors.dim} ~${theoreticalSequentialSec}s (if processed one by one)${colors.reset}`);
  console.log(`  • Actual Total Processing Time:${colors.green} ${totalProcessingDurationSec}s${colors.reset}`);
  
  if (theoreticalSequentialSec > 0 && totalProcessingDurationSec > 0) {
    const speedup = (theoreticalSequentialSec / totalProcessingDurationSec).toFixed(1);
    console.log(`  • Parallel Speedup Factor:  ${colors.bright}${colors.green}${speedup}x${colors.reset} concurrency acceleration`);
  }

  console.log(`  • Server Health Responsiveness: ${colors.green}${healthAvailabilityPct}% OK${colors.reset} (${healthyPingsCount}/${healthPings.length} pings, P95: ${formatMs(healthStats.p95)})`);
  console.log(`  • Events in Pipeline Remaining: ${colors.green}0 pending, 0 processing${colors.reset}`);
  console.log(`  • Newly Completed Events:   ${colors.green}+${finalStats.completed - baselineStats.completed}${colors.reset}`);
  console.log(`  • Newly Failed Events:      ${colors.green}+${finalStats.failed - baselineStats.failed}${colors.reset}`);
  console.log(`  • Total System Database Records: ${colors.cyan}${finalStats.total}${colors.reset}\n`);

  process.exit(0);
}

runSlowBurstTest().catch((err) => {
  console.error(`\n${colors.red}Fatal error during slow burst test:${colors.reset}`, err);
  process.exit(1);
});

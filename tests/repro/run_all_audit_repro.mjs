/**
 * Master Runner: Audit Verification & Reproduction Test Suite
 * 
 * Executes all 3 reproduction test suites:
 * - Suite 1: Backend DO & Concurrency Vulnerabilities
 * - Suite 2: Game Core Rules & Boundary Condition Vulnerabilities
 * - Suite 3: Frontend UI, FX & Animation Queue Vulnerabilities
 */

import { runBackendConcurrencyTests } from './test_r1_backend_concurrency.mjs';
import { runCoreRulesBoundaryTests } from './test_r2_core_rules_boundaries.mjs';
import { runFrontendQueueFxTests } from './test_r3_frontend_queue_fx.mjs';

const startTime = Date.now();

console.log('╔' + '═'.repeat(78) + '╗');
console.log('║' + ' '.repeat(14) + '人生大富翁 (O-Camp Monopoly Web) 完整漏洞驗證測試套件' + ' '.repeat(14) + '║');
console.log('║' + ' '.repeat(16) + 'Audit Verification & Reproduction Test Suite' + ' '.repeat(18) + '║');
console.log('╚' + '═'.repeat(78) + '╝\n');

let suite1Passed = false;
let suite2Passed = false;
let suite3Passed = false;

try {
  await runBackendConcurrencyTests();
  suite1Passed = true;
} catch (err) {
  console.error('\n✖ Suite 1 Failed:', err);
}

try {
  runCoreRulesBoundaryTests();
  suite2Passed = true;
} catch (err) {
  console.error('\n✖ Suite 2 Failed:', err);
}

try {
  runFrontendQueueFxTests();
  suite3Passed = true;
} catch (err) {
  console.error('\n✖ Suite 3 Failed:', err);
}

const elapsedMs = Date.now() - startTime;

console.log('\n' + '═'.repeat(80));
console.log('📊 AUDIT VULNERABILITY REPRODUCTION MATRIX & VERIFICATION REPORT');
console.log('═'.repeat(80));

const matrix = [
  // Suite 1: Backend DO
  { id: 'VULN-BE-01', name: 'Un-isolated Async Interleaving & Lost Updates', sev: 'CRITICAL', file: 'src/worker.js:600-633', status: suite1Passed ? '✔ REPRODUCED' : 'FAILED' },
  { id: 'VULN-BE-02', name: 'D1 DDL/SELECT Query Storm on WebSocket Path', sev: 'CRITICAL', file: 'src/worker.js:32-57,601', status: suite1Passed ? '✔ REPRODUCED' : 'FAILED' },
  { id: 'VULN-BE-03', name: 'Lack of DO State Rollback on D1 Batch Failure', sev: 'HIGH', file: 'src/worker.js:632,641-648', status: suite1Passed ? '✔ REPRODUCED' : 'FAILED' },
  { id: 'VULN-BE-04', name: 'Host endGame vs In-Flight Action Resuscitation', sev: 'HIGH', file: 'src/worker.js:629-633,637', status: suite1Passed ? '✔ REPRODUCED' : 'FAILED' },
  { id: 'VULN-BE-05', name: 'Missing actionId Deduplication / Idempotency', sev: 'MEDIUM', file: 'src/worker.js:619,632', status: suite1Passed ? '✔ REPRODUCED' : 'FAILED' },
  { id: 'VULN-BE-06', name: 'Hibernation Kicked Set Loss & Cold Offline Skip', sev: 'MEDIUM', file: 'src/worker.js:541,613,651', status: suite1Passed ? '✔ REPRODUCED' : 'FAILED' },

  // Suite 2: Core Rules
  { id: 'VULN-CORE-01', name: 'Insolvent Negative Cash & Unbacked Fiat Creation', sev: 'CRITICAL', file: 'src/game-core.js:115-120', status: suite2Passed ? '✔ REPRODUCED' : 'FAILED' },
  { id: 'VULN-CORE-02', name: 'Double Jail Decrement & Reroll Jailbreak Exploit', sev: 'HIGH', file: 'src/game-core.js:360-368', status: suite2Passed ? '✔ REPRODUCED' : 'FAILED' },
  { id: 'VULN-CORE-03', name: 'Unchecked Base Upgrade on Unassigned Base (pts loss)', sev: 'HIGH', file: 'src/game-core.js:253-262', status: suite2Passed ? '✔ REPRODUCED' : 'FAILED' },
  { id: 'VULN-CORE-04', name: 'Uncaught TypeError on Invalid Shop/Buff Indices', sev: 'HIGH', file: 'src/game-core.js:237-252', status: suite2Passed ? '✔ REPRODUCED' : 'FAILED' },
  { id: 'VULN-CORE-05', name: 'Pass Buff Multi-Toll Unlimited Waiver Exploit', sev: 'MEDIUM', file: 'src/game-core.js:145-168', status: suite2Passed ? '✔ REPRODUCED' : 'FAILED' },
  { id: 'VULN-CORE-06', name: 'Zero-Step Movement at START Tile Lap Bonus Bug', sev: 'MEDIUM', file: 'src/game-core.js:161-164', status: suite2Passed ? '✔ REPRODUCED' : 'FAILED' },
  { id: 'VULN-CORE-07', name: 'Wormhole Teleport Skips START Lap Bonus / NaN Crash', sev: 'MEDIUM', file: 'src/game-core.js:217-220', status: suite2Passed ? '✔ REPRODUCED' : 'FAILED' },

  // Suite 3: Frontend Queue & FX
  { id: 'VULN-FE-01', name: 'FIFO Animation Queue Head-of-Line Blocking Host', sev: 'CRITICAL', file: 'public/app.js:184-236', status: suite3Passed ? '✔ REPRODUCED' : 'FAILED' },
  { id: 'VULN-FE-02', name: 'Optimistic Action Unlock on Broadcast Rev Increment', sev: 'CRITICAL', file: 'public/app.js:650-657', status: suite3Passed ? '✔ REPRODUCED' : 'FAILED' },
  { id: 'VULN-FE-04', name: 'Zero-Step Jail Roll Coercion (0 || 1) Visual Glitch', sev: 'HIGH', file: 'public/app.js:585,594', status: suite3Passed ? '✔ REPRODUCED' : 'FAILED' },
  { id: 'VULN-FE-05', name: 'Event Log Diffing Collision Drops Consecutive Logs', sev: 'HIGH', file: 'public/app.js:602-613', status: suite3Passed ? '✔ REPRODUCED' : 'FAILED' },
  { id: 'VULN-FE-06', name: 'Missile Reticle Referencing Null Aftershock (Tile 0)', sev: 'MEDIUM', file: 'public/app.js:689-708', status: suite3Passed ? '✔ REPRODUCED' : 'FAILED' }
];

console.log('| ID           | Severity | Reproduction Status | Target File & Lines         | Flaw Description                                    |');
console.log('|--------------|----------|---------------------|-----------------------------|-----------------------------------------------------|');
matrix.forEach(m => {
  const idCol = m.id.padEnd(12);
  const sevCol = m.sev.padEnd(8);
  const statusCol = m.status.padEnd(19);
  const fileCol = m.file.padEnd(27);
  console.log(`| ${idCol} | ${sevCol} | ${statusCol} | ${fileCol} | ${m.name.padEnd(51)} |`);
});
console.log('═'.repeat(80));

const totalTests = matrix.length;
const passedCount = matrix.filter(m => m.status.includes('✔')).length;

console.log(`\n🎉 Verification Summary: ${passedCount}/${totalTests} Vulnerabilities Fully Reproduced & Verified across 3 Domains.`);
console.log(`⏱ Total Test Execution Duration: ${elapsedMs}ms`);

if (passedCount === totalTests) {
  console.log('✅ ALL AUDIT REPRODUCTION SUITES PASSED SUCCESSFULLY.\n');
  process.exit(0);
} else {
  console.error('❌ SOME REPRODUCTION SUITES FAILED.\n');
  process.exit(1);
}

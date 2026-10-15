import { spawnSync } from "node:child_process";
const [cmd, ...args] = process.argv.slice(2);
const times = [];
for (let i = 0; i < 30; i++) {
  const start = process.hrtime.bigint();
  spawnSync(cmd, args, { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, input: "{}" });
  times.push(Number(process.hrtime.bigint() - start) / 1e6);
}
times.sort((a, b) => a - b);
console.log(`p50 ${times[15].toFixed(0)} ms  p95 ${times[28].toFixed(0)} ms`);

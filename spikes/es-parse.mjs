import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
const start = process.hrtime.bigint();
let n = 0;
for await (const line of createInterface({ input: createReadStream(process.argv[2]) })) {
  JSON.parse(line);
  n++;
}
const s = Number(process.hrtime.bigint() - start) / 1e9;
console.log(`${n} events in ${s.toFixed(2)} s = ${(n / s).toFixed(0)} events/s`);

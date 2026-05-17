import fs from "node:fs";
import path from "node:path";

test("public status fallback does not present N/A metrics as service telemetry", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/app/support/status/page.tsx"),
    "utf8",
  );

  expect(source).not.toMatch(/uptime:\s*["']N\/A["']/);
  expect(source).not.toMatch(/latency:\s*["']N\/A["']/);
  expect(source).toMatch(/Live status temporarily unavailable|Status feed unavailable/i);
});

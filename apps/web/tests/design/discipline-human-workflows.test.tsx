import fs from "node:fs";
import path from "node:path";

test("discipline workspace avoids internal record-id copy", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/components/discipline/discipline-workspace.tsx"),
    "utf8",
  );

  expect(source).not.toMatch(/Student record ID|Class record ID|Academic term ID|Academic year ID/);
  expect(source).not.toMatch(/student_id\.slice\(0,\s*8\)/);
  expect(source).toMatch(/Search learner by name or admission number/i);
});

import fs from "node:fs";
import path from "node:path";

test("finance forms do not ask school staff for internal UUIDs", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/components/school/school-pages.tsx"),
    "utf8",
  );

  expect(source).not.toMatch(/Student UUID|Invoice UUID|Student ID<\/span>|Invoice ID<\/span>/);
  expect(source).toMatch(/Search name or admission number|Select invoice/i);
});

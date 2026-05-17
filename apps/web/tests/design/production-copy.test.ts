import fs from "node:fs";
import path from "node:path";

const demoLikeVisibleCopy = [
  /demo credentials/i,
  /test account/i,
  /seeded account/i,
  /seeded credential/i,
  /login as/i,
  /(^|[^.\w])password\s*=\s*["'][^"']+/im,
  /school-workspace-code/i,
  /orders@example\.invalid/i,
  /janet\.atieno@gmail\.com/i,
  /principal@school\.ac\.ke/i,
  /finance@school\.ac\.ke/i,
  /\+254 7XX XXX XXX/i,
  /00000000-0000-0000-0000-000000000000/i,
];

const unenforcedSecurityClaims = [
  /MFA ready/,
  /MFA optional/,
  /2FA supported/,
  /2FA, device verification/,
  /device verification, and managed sessions/,
  /Device verification/,
  /Trust this device/,
  /Remember this device/,
  /Keep this device signed in/,
  /device-aware secure access/,
];

describe("production-facing copy", () => {
  test("does not render demo-like personal contact or medical placeholders", () => {
    const source = getProductionSourceFiles()
      .map((filePath) => fs.readFileSync(filePath, "utf8"))
      .join("\n");

    for (const pattern of demoLikeVisibleCopy) {
      expect(source).not.toMatch(pattern);
    }
  });

  test("does not claim unfinished MFA or trusted-device controls are live", () => {
    const source = getProductionSourceFiles()
      .map((filePath) => fs.readFileSync(filePath, "utf8"))
      .join("\n");

    for (const pattern of unenforcedSecurityClaims) {
      expect(source).not.toMatch(pattern);
    }
  });

  test("library scanner copy uses learner name or admission number", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/library/library-workspace.tsx"),
      "utf8",
    );

    expect(source).not.toMatch(/Scan student ID|Student ID or admission barcode/i);
    expect(source).toMatch(/learner name or admission number/i);
  });
});

function getProductionSourceFiles() {
  const sourceRoot = path.join(process.cwd(), "src");
  const files: string[] = [];

  walk(sourceRoot, files);
  return files.filter((filePath) => /\.(ts|tsx)$/.test(filePath));
}

function walk(directory: string, files: string[]) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "__tests__") {
        continue;
      }

      walk(fullPath, files);
      continue;
    }

    files.push(fullPath);
  }
}

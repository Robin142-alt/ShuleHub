import fs from "node:fs";
import path from "node:path";

const sourceFiles = [
  "src/app/school/forgot-password/page.tsx",
  "src/app/internal/school/forgot-password/page.tsx",
  "src/app/portal/forgot-password/page.tsx",
  "src/app/internal/portal/forgot-password/page.tsx",
  "src/app/portal/reset-password/page.tsx",
  "src/app/internal/portal/reset-password/page.tsx",
  "src/app/forgot-password/page.tsx",
  "src/components/dashboard/topbar.tsx",
  "src/components/dashboard/erp-pages.tsx",
  "src/lib/dashboard/module-data.ts",
  "src/components/auth/school-login-view.tsx",
  "src/components/auth/public-school-login-view.tsx",
  "src/components/auth/portal-login-view.tsx",
  "src/components/auth/auth-security.tsx",
  "src/components/auth/auth-shell.tsx",
  "src/components/auth/auth-state-page.tsx",
  "src/components/auth/auth-state-view.tsx",
  "src/components/auth/superadmin-login-view.tsx",
  "src/app/internal/superadmin/login/page.tsx",
  "src/app/superadmin/login/page.tsx",
  "src/app/internal/superadmin/reset-password/page.tsx",
  "src/app/superadmin/reset-password/page.tsx",
  "src/lib/auth/types.ts",
  "src/components/platform/superadmin-pages.tsx",
  "src/components/school/school-pages.tsx",
  "src/components/support/support-center-workspace.tsx",
  "src/components/support/platform-support-workspace.tsx",
  "src/components/modules/admissions/admissions-module-screen.tsx",
  "src/components/modules/inventory/inventory-module-screen.tsx",
  "src/components/storekeeper/storekeeper-workspace.tsx",
  "src/app/api/inventory/stock-issues/route.ts",
  "src/app/api/inventory/stock-receipts/route.ts",
];

const demoLikeVisibleCopy = [
  /NEXT_PUBLIC_/i,
  /environment variable/i,
  /API is not configured/i,
  /created through the live backend/i,
  /live backend/i,
  /school-workspace-code/i,
  /placeholder: "Nairobi"/i,
  /placeholder="STAT"/i,
  /placeholder="Stationery"/i,
  /placeholder="Academic Office"/i,
  /placeholder="Admin Store, Block A"/i,
  /Daily issue to class teachers/i,
  /placeholder="ITEM-CODE-001"/i,
  /placeholder="Grade 6 complete"/i,
  /orders@example\.invalid/i,
  /janet\.atieno@gmail\.com/i,
  /principal@school\.ac\.ke/i,
  /finance@school\.ac\.ke/i,
  /0712 345 678/i,
  /\+254 722 911 404/i,
  /\+254 7XX XXX XXX/i,
  /\bClinical officer\b/i,
  /\bMother\b/i,
  /\bPeanuts\b/i,
  /\bAsthma\b/i,
  /\bMara House\b/i,
  /\bEastern Bypass\b/i,
  /\bScience Lab\b/i,
  /Dropped during practical/i,
  /placeholder="3600"/i,
  /placeholder="Grade 7"/i,
  /placeholder="Hope"/i,
  /saved locally/i,
  /00000000-0000-0000-0000-000000000000/i,
  /email or phone/i,
  /phone number or admission number/i,
  /email, phone, or admission number/i,
  /phone number your school uses/i,
  /registered phone number/i,
  /work email or phone number/i,
  /admission number or phone/i,
  /identifierLabel: "Parent phone number"/i,
  /password or PIN/i,
  /forgot password or PIN/i,
  /sampled CBC subjects/i,
  /87\.4%/i,
  /Tuition still drives/i,
  /1,148/i,
  /Mid-term CAT/i,
  /Invigilation rota/i,
  /Grade 7 Hope/i,
  /Grade 5 Joy/i,
  /Mr\. Otieno/i,
  /Ms\. Njoroge/i,
  /27 teachers active/i,
  /Two pending approvals/i,
  /Good afternoon\. Please clear the outstanding fee balance/i,
  /\?\? "Science"/i,
  /\?\? "Social Studies"/i,
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
    const source = sourceFiles
      .map((filePath) => fs.readFileSync(path.join(process.cwd(), filePath), "utf8"))
      .join("\n");

    for (const pattern of demoLikeVisibleCopy) {
      expect(source).not.toMatch(pattern);
    }
  });

  test("does not claim unfinished MFA or trusted-device controls are live", () => {
    const source = sourceFiles
      .map((filePath) => fs.readFileSync(path.join(process.cwd(), filePath), "utf8"))
      .join("\n");

    for (const pattern of unenforcedSecurityClaims) {
      expect(source).not.toMatch(pattern);
    }
  });
});

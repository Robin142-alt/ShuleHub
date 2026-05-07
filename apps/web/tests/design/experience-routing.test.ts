import {
  evaluateExperienceRouting,
  PORTAL_SESSION_COOKIE,
  resolveExperienceHost,
  SCHOOL_SESSION_COOKIE,
  serializeExperienceSession,
  SUPERADMIN_SESSION_COOKIE,
} from "@/lib/auth/experience-routing";

describe("experience routing", () => {
  test("resolves superadmin hosts into the platform experience", () => {
    expect(resolveExperienceHost("superadmin.shulehub.test")).toEqual({
      experience: "superadmin",
      host: "superadmin.shulehub.test",
      tenantSlug: null,
    });
  });

  test("resolves school subdomains into the tenant experience", () => {
    expect(resolveExperienceHost("barakaacademy.shulehub.test")).toEqual({
      experience: "school",
      host: "barakaacademy.shulehub.test",
      tenantSlug: "barakaacademy",
    });
  });

  test("resolves portal hosts into the family experience", () => {
    expect(resolveExperienceHost("portal.shulehub.test")).toEqual({
      experience: "portal",
      host: "portal.shulehub.test",
      tenantSlug: null,
    });
  });

  test("resolves loopback IP hosts into the public experience", () => {
    expect(resolveExperienceHost("127.0.0.1:3005")).toEqual({
      experience: "public",
      host: "127.0.0.1",
      tenantSlug: null,
    });
  });

  test("resolves hosted vercel app domains into the public experience", () => {
    expect(resolveExperienceHost("shule-hub-erp.vercel.app")).toEqual({
      experience: "public",
      host: "shule-hub-erp.vercel.app",
      tenantSlug: null,
    });
  });

  test("redirects a superadmin host root request to the superadmin login without a session", () => {
    expect(
      evaluateExperienceRouting({
        host: "superadmin.shulehub.test",
        pathname: "/",
        cookies: {},
      }),
    ).toEqual({
      action: "redirect",
      location: "/login",
      headers: {
        "x-platform-experience": "superadmin",
      },
    });
  });

  test("rewrites superadmin dashboard requests into the internal platform namespace", () => {
    expect(
      evaluateExperienceRouting({
        host: "superadmin.shulehub.test",
        pathname: "/dashboard",
        cookies: {},
      }),
    ).toEqual({
      action: "redirect",
      location: "/login",
      headers: {
        "x-platform-experience": "superadmin",
      },
    });
  });

  test("rewrites school dashboard requests into the internal tenant namespace once authenticated", () => {
    expect(
      evaluateExperienceRouting({
        host: "greenfield.shulehub.test",
        pathname: "/dashboard",
        cookies: {
          [SCHOOL_SESSION_COOKIE]: serializeExperienceSession({
            experience: "school",
            homePath: "/dashboard",
            role: "principal",
            tenantSlug: "greenfield",
            userLabel: "Principal",
          }),
        },
      }),
    ).toEqual({
      action: "next",
      rewrittenPath: "/internal/school/dashboard",
      headers: {
        "x-platform-experience": "school",
        "x-tenant-slug": "greenfield",
      },
    });
  });

  test("allows authenticated storekeeper sessions to open dedicated inventory routes", () => {
    expect(
      evaluateExperienceRouting({
        host: "amani-prep.shulehub.test",
        pathname: "/inventory/dashboard",
        cookies: {
          [SCHOOL_SESSION_COOKIE]: serializeExperienceSession({
            experience: "school",
            homePath: "/inventory/dashboard",
            role: "storekeeper",
            tenantSlug: "amani-prep",
            userLabel: "Storekeeper Amani Prep",
          }),
        },
      }),
    ).toEqual({
      action: "next",
      headers: {
        "x-platform-experience": "school",
        "x-tenant-slug": "amani-prep",
      },
    });
  });

  test("denies dedicated inventory routes to non-storekeeper school sessions", () => {
    expect(
      evaluateExperienceRouting({
        host: "amani-prep.shulehub.test",
        pathname: "/inventory/dashboard",
        cookies: {
          [SCHOOL_SESSION_COOKIE]: serializeExperienceSession({
            experience: "school",
            homePath: "/school/bursar",
            role: "bursar",
            tenantSlug: "amani-prep",
            userLabel: "Bursar",
          }),
        },
      }),
    ).toEqual({
      action: "redirect",
      location: "/forbidden",
      headers: {
        "x-platform-experience": "school",
        "x-tenant-slug": "amani-prep",
      },
    });
  });

  test("redirects authenticated school sessions away from the login page to their role home", () => {
    expect(
      evaluateExperienceRouting({
        host: "barakaacademy.shulehub.test",
        pathname: "/school/login",
        cookies: {
          [SCHOOL_SESSION_COOKIE]: serializeExperienceSession({
            experience: "school",
            homePath: "/dashboard",
            role: "bursar",
            tenantSlug: "barakaacademy",
            userLabel: "Bursar",
          }),
        },
      }),
    ).toEqual({
      action: "redirect",
      location: "/dashboard",
      headers: {
        "x-platform-experience": "school",
        "x-tenant-slug": "barakaacademy",
      },
    });
  });

  test("redirects authenticated portal users away from the login page to their viewer home", () => {
    expect(
      evaluateExperienceRouting({
        host: "portal.shulehub.test",
        pathname: "/portal/login",
        cookies: {
          [PORTAL_SESSION_COOKIE]: serializeExperienceSession({
            experience: "portal",
            homePath: "/dashboard",
            viewer: "parent",
            userLabel: "Parent",
          }),
        },
      }),
    ).toEqual({
      action: "redirect",
      location: "/dashboard",
      headers: {
        "x-platform-experience": "portal",
      },
    });
  });

  test("redirects authenticated superadmin users away from the login page to the platform home", () => {
    expect(
      evaluateExperienceRouting({
        host: "superadmin.shulehub.test",
        pathname: "/superadmin/login",
        cookies: {
          [SUPERADMIN_SESSION_COOKIE]: serializeExperienceSession({
            experience: "superadmin",
            homePath: "/dashboard",
            userLabel: "Platform owner",
          }),
        },
      }),
    ).toEqual({
      action: "redirect",
      location: "/dashboard",
      headers: {
        "x-platform-experience": "superadmin",
      },
    });
  });

  test("rewrites public login routes into the portal internal namespace", () => {
    expect(
      evaluateExperienceRouting({
        host: "portal.shulehub.test",
        pathname: "/login",
        cookies: {},
      }),
    ).toEqual({
      action: "next",
      rewrittenPath: "/internal/portal/login",
      headers: {
        "x-platform-experience": "portal",
      },
    });
  });

  test("leaves legacy dashboard routes alone on local public hosts", () => {
    expect(
      evaluateExperienceRouting({
        host: "127.0.0.1:3005",
        pathname: "/dashboard/admin",
        cookies: {},
      }),
    ).toEqual({
      action: "next",
      headers: {
        "x-platform-experience": "public",
      },
    });
  });

  test("leaves public compatibility login routes alone on hosted vercel domains", () => {
    expect(
      evaluateExperienceRouting({
        host: "shule-hub-erp.vercel.app",
        pathname: "/superadmin/login",
        cookies: {},
      }),
    ).toEqual({
      action: "next",
      headers: {
        "x-platform-experience": "public",
      },
    });
  });
});

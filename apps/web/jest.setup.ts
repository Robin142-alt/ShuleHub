import "@testing-library/jest-dom";

import { TextDecoder, TextEncoder } from "node:util";
import React from "react";

import {
  resetRouterMocks,
  routerPrefetchMock,
  routerPushMock,
  routerReplaceMock,
} from "./tests/design/router-mock";

Object.assign(global, {
  TextEncoder,
  TextDecoder,
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }),
});

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: jest.fn(),
});

class ResizeObserverMock {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}

class IntersectionObserverMock {
  root = null;
  rootMargin = "";
  thresholds = [];

  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
  takeRecords = jest.fn(() => []);
}

Object.assign(global, {
  ResizeObserver: ResizeObserverMock,
  IntersectionObserver: IntersectionObserverMock,
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: routerReplaceMock,
    prefetch: routerPrefetchMock,
  }),
  usePathname: () => "/dashboard/admin",
  notFound: jest.fn(),
  redirect: jest.fn(),
}));

jest.mock("next/link", () => {
  const LinkMock = React.forwardRef(
    (
      {
        href,
        children,
        ...props
      }: {
        href: string | { pathname?: string };
        children: React.ReactNode;
      },
      ref: React.Ref<HTMLAnchorElement>,
    ) =>
      React.createElement(
        "a",
        {
          ...props,
          href: typeof href === "string" ? href : href.pathname ?? "#",
          ref,
        },
        children,
      ),
  );

  LinkMock.displayName = "NextLinkMock";

  return LinkMock;
});

beforeEach(() => {
  resetRouterMocks();
  document.body.style.overflow = "";
  document.cookie.split(";").forEach((cookie) => {
    const [rawName] = cookie.split("=");
    const name = rawName?.trim();

    if (!name) {
      return;
    }

    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  });
});

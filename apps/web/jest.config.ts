import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

const customJestConfig = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  roots: ["<rootDir>/tests/design"],
  testMatch: ["**/*.test.ts?(x)"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^.+\\.module\\.(css|sass|scss)$": "identity-obj-proxy",
    "^.+\\.(css|sass|scss)$": "<rootDir>/tests/design/style-mock.ts",
  },
  collectCoverageFrom: [
    "src/components/dashboard/**/*.{ts,tsx}",
    "src/lib/dashboard/**/*.{ts,tsx}",
  ],
};

export default createJestConfig(customJestConfig);

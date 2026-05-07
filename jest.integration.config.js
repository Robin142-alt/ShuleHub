module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/apps/api/test'],
  testEnvironment: 'node',
  maxWorkers: 1,
  testMatch: ['**/*.integration-spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  clearMocks: true,
  restoreMocks: true,
};

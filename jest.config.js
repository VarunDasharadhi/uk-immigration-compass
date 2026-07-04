export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    // Strip the .js extension from ESM-style relative imports so ts-jest can
    // resolve the .ts source (e.g. './cache.js' -> './cache').
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/$1',
    '^@components/(.*)$': '<rootDir>/components/$1',
    '^@services/(.*)$': '<rootDir>/services/$1',
    '^@types/(.*)$': '<rootDir>/types.ts',
    '^@utils/(.*)$': '<rootDir>/utils/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/setupTests.ts'],
  collectCoverageFrom: [
    '*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'contexts/**/*.{ts,tsx}',
    'services/**/*.{ts,tsx}',
    '!*.d.ts',
    '!main.tsx',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};

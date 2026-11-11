// babel-preset-expo is a dependency of expo, not a top-level package.
const babelPresetExpo = require.resolve('babel-preset-expo', { paths: [require.resolve('expo/package.json')] });

/**
 * Two projects:
 * - app: domain, data (SQLite via better-sqlite3) and UI tests under jest-expo.
 * - db: Supabase migrations + RLS tests on PGlite (real Postgres compiled to WASM, plain Node).
 * testRegex instead of globs: the repo may live under a dot-folder (.claude/worktrees), which globs skip.
 */
module.exports = {
  projects: [
    {
      displayName: 'app',
      preset: 'jest-expo',
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
      testRegex: String.raw`src[\/].*__tests__[\/].*\.test\.tsx?$`,
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|react-native-gifted-charts|gifted-charts-core|i18next|react-i18next))',
      ],
    },
    {
      displayName: 'db',
      testEnvironment: 'node',
      testRegex: String.raw`tests[\/]db[\/].*\.test\.ts$`,
      transform: { '^.+\.ts$': ['babel-jest', { presets: [babelPresetExpo] }] },
    },
  ],
  testTimeout: 30000,
};

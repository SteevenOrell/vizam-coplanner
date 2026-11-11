import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock.js'));
// Real UUIDs in tests (the native module is not available under Jest).
jest.mock('expo-crypto', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  randomUUID: () => require('crypto').randomUUID(),
}));

jest.mock('expo-notifications', () => ({
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'undetermined', canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted', canAskAgain: true })),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  AndroidImportance: { DEFAULT: 3, HIGH: 6 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

// expo-router: navigation calls are recorded on routerMock; params come from setRouteParams (src/test/render.tsx).
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { routerMock } = require('./src/test/routerMock');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  const Passthrough = ({ children }: { children?: unknown }) => children ?? null;
  return {
    router: routerMock,
    useRouter: () => routerMock,
    useLocalSearchParams: () => (globalThis as { __routeParams?: Record<string, string> }).__routeParams ?? {},
    useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]),
    Redirect: () => null,
    Link: Passthrough,
    Stack: Object.assign(Passthrough, { Screen: () => null }),
    Tabs: Object.assign(Passthrough, { Screen: () => null }),
  };
});

// UI flows that save through SQLite can exceed the default 1 s waitFor on a cold run.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('@testing-library/react-native').configure({ asyncUtilTimeout: 5000 });

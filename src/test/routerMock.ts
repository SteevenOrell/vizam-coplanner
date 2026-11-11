/** Shared expo-router mock state (see jest.setup.ts). Reset between tests by jest's clearMocks in each suite. */
export const routerMock = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
  dismiss: jest.fn(),
  canGoBack: jest.fn(() => true),
  setParams: jest.fn(),
};

// Reanimated test helpers (fake timers friendly animations, toHaveAnimatedStyle).
require('react-native-reanimated').setUpTests();

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Gesture Handler installs its UI runtime bindings with Worklets' getUIRuntimeHolder,
// which throws under Jest. Hand it an empty holder so suites with the tab bar can run.
jest.mock('react-native-worklets', () => {
  const actual = jest.requireActual('react-native-worklets');
  return { __esModule: true, ...actual, getUIRuntimeHolder: () => ({}) };
});

/* global jest */

jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-permissions', () => ({
  checkNotifications: jest.fn(() =>
    Promise.resolve({ status: 'granted', settings: {} }),
  ),
  requestNotifications: jest.fn(() =>
    Promise.resolve({ status: 'granted', settings: {} }),
  ),
  RESULTS: {
    UNAVAILABLE: 'unavailable',
    DENIED: 'denied',
    LIMITED: 'limited',
    GRANTED: 'granted',
    BLOCKED: 'blocked',
  },
}));

jest.mock('react-native-vision-camera', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    Camera: React.forwardRef((props, ref) =>
      React.createElement(View, {
        ...props,
        ref,
        testID: props.testID || 'mock-camera',
      }),
    ),
    useCameraDevice: jest.fn(() => ({ id: 'mock-camera-device' })),
    useCameraPermission: jest.fn(() => ({
      hasPermission: true,
      requestPermission: jest.fn(() => Promise.resolve(true)),
    })),
    useCodeScanner: jest.fn(config => config),
  };
});

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(() => Promise.resolve({ didCancel: true, assets: [] })),
  launchImageLibrary: jest.fn(() =>
    Promise.resolve({ didCancel: true, assets: [] }),
  ),
}));

jest.mock('react-native-webrtc', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    RTCView: props => React.createElement(View, props),
    mediaDevices: {
      getUserMedia: jest.fn(() => Promise.resolve({ getTracks: () => [] })),
      enumerateDevices: jest.fn(() => Promise.resolve([])),
    },
    RTCPeerConnection: jest.fn(() => ({
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addTrack: jest.fn(),
      createOffer: jest.fn(() => Promise.resolve({})),
      createAnswer: jest.fn(() => Promise.resolve({})),
      setLocalDescription: jest.fn(() => Promise.resolve()),
      setRemoteDescription: jest.fn(() => Promise.resolve()),
      addIceCandidate: jest.fn(() => Promise.resolve()),
      close: jest.fn(),
    })),
    RTCIceCandidate: jest.fn(candidate => candidate),
    RTCSessionDescription: jest.fn(description => description),
  };
});

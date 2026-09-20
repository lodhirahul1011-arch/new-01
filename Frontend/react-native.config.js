module.exports = {
  dependencies: {
    'rn-qr-generator': {
      platforms: {
        android: {
          sourceDir: '../node_modules/rn-qr-generator/android',
        },
      },
    },
    'react-native-worklets-core': {
      platforms: {
        android: null,
      },
    },
  },
};

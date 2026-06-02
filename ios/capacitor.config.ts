import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.milestonepediatrics.taskmatrix',
  appName: 'TaskMatrix',
  webDir: 'www',

  server: {
    hostname: 'localhost',
  },
  ios: {
    contentInset: 'never',
    allowsLinkPreview: false,
  },
  plugins: {
  },
};

export default config;

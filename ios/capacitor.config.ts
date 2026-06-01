import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.milestonepediatrics.taskmatrix',
  appName: 'TaskMatrix',
  webDir: 'www',

  server: {
    hostname: 'localhost',
  },
  ios: {
    contentInset: 'always',
    allowsLinkPreview: false,
  },
  plugins: {
  },
};

export default config;

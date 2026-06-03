import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.milestonepediatrics.taskmatrix',
  appName: 'TaskMatrix',
  webDir: 'www',

  // Paint the native area behind the webview dark so overscroll / safe-area
  // reveals (and the gap behind a position:fixed body) never flash white in
  // dark mode. Matches the dark theme's --bg-body start color (#0f172a).
  backgroundColor: '#0f172a',

  server: {
    hostname: 'localhost',
  },
  ios: {
    contentInset: 'always',
    allowsLinkPreview: false,
    backgroundColor: '#0f172a',
  },
  plugins: {
  },
};

export default config;

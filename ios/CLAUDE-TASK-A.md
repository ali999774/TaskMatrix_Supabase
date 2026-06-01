# Claude Code Task A — Capacitor iOS Scaffold

**Run this in Claude Code on Antigravity. Copy the entire section below.**

---

## Task: Set up Capacitor iOS project for TaskMatrix

Working directory: `~/Dev/apps/Task-Matrix/ios/`

All source files are already created:
- `www/index.html` — adapted PWA with Face ID overlay
- `www/sw.js` — service worker
- `capacitor.config.ts` — Capacitor config (appId: `com.milestonepediatrics.taskmatrix`)
- `package.json` — dependencies

### Steps

1. **Install dependencies:**
```bash
cd ~/Dev/apps/Task-Matrix/ios && npm install
```

2. **Build the web assets** (ensure `www/` is complete):
```bash
ls -la ~/Dev/apps/Task-Matrix/ios/www/
```

3. **Add iOS platform:**
```bash
cd ~/Dev/apps/Task-Matrix/ios && npx cap add ios
```

4. **Install native plugins:**
```bash
cd ~/Dev/apps/Task-Matrix/ios && npm install @capacitor-community/biometric-auth @capacitor/haptics
npx cap sync ios
```

5. **Configure iOS project:**
   - Open `ios/App/Podfile` — verify it exists
   - Run `cd ios/App && pod install` if Podfile exists

6. **Verify everything:**
```bash
cd ~/Dev/apps/Task-Matrix/ios && npx cap doctor ios
```

### Expected output
- `ios/` directory with Xcode project
- `npx cap doctor` passes all checks
- No errors during `npm install` or `cap add`

### Report back
Paste the terminal output from steps 1-6, especially:
- Any errors during `npm install`
- The output of `npx cap doctor ios`
- The contents of `ios/App/App/` (confirming the AppDelegate exists)

---

## Notes
- Node.js 22 is available via Volta
- The Apple Developer Team ID is `85e28156-0d01-4f7f-be4e-3107f4c76e6f`
- Bundle ID: `com.milestonepediatrics.taskmatrix`
- This is a personal app — no Google OAuth, no multi-user

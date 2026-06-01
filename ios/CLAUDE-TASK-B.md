# Claude Code Task B — Xcode Entitlements + TestFlight Build

**Run this AFTER Task A succeeds. Copy the entire section below.**

---

## Task: Configure Xcode project and build for TestFlight

Working directory: `~/Dev/apps/Task-Matrix/ios/`

### Steps

1. **Open Xcode project:**
```bash
cd ~/Dev/apps/Task-Matrix/ios && npx cap open ios
```

2. **Configure Signing & Capabilities in Xcode:**
   - Select the `App` target → **Signing & Capabilities**
   - Team: Select your Apple Developer team (ID: `75FZCD8C64`)
   - Bundle Identifier: `com.milestonepediatrics.taskmatrix`
   - Check "Automatically manage signing"

3. **Add required capabilities:**
   - Click "+ Capability" → **Keychain Sharing** (required for biometric auth)
   - The Keychain Groups should auto-populate

4. **Add Face ID usage description:**
   - Open `ios/App/App/Info.plist`
   - Add this entry:
   ```xml
   <key>NSFaceIDUsageDescription</key>
   <string>TaskMatrix uses Face ID to protect your tasks</string>
   ```

5. **Verify the app builds:**
   - In Xcode: Product → Build (⌘B)
   - Select a simulator target (iPhone 16 Pro)
   - Fix any build errors

6. **Archive for TestFlight:**
   - In Xcode: Product → Archive
   - After archive completes → Distribute App → TestFlight → Upload
   - Follow the upload wizard

7. **After upload:**
   - Go to https://appstoreconnect.apple.com
   - Navigate to TestFlight → TaskMatrix
   - Wait for processing (~15-30 minutes)
   - Add yourself as an internal tester
   - Install via TestFlight app on your iPhone

### Report back
- Any Xcode build errors (with full error text)
- Confirmation that Archive succeeded
- The App Store Connect status (processing / ready to test)

---

## Notes
- If you get provisioning profile errors: Xcode → Settings → Accounts → Download Manual Profiles
- If Archive fails with "missing entitlement": verify Keychain Sharing capability is added
- The `@capacitor-community/biometric-auth` plugin needs Keychain Sharing entitlement
- First build may take 5-10 minutes for indexing

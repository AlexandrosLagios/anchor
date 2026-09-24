---
name: run-android
description: Use when you need to run the app on the Android emulator, see a change on screen, take a screenshot, run the Maestro flows, or diagnose an app that does not start. Covers the one-command start, the verification loop, and the traps that stall the emulator and the dev build.
---

# run-android

## Start the app

1. Run `npm run android` in the background. The command boots the first AVD when no emulator runs, builds the dev build, installs it, starts Metro on port 8090, and opens the app.
2. Wait for the `Android Bundled` line in the output. The first build takes about 5 minutes. An incremental build takes about 15 seconds.
3. When the dev build is already installed and no native code changed, run `npm start` instead. Then relaunch the app. The dev client reconnects to the last Metro server.

Do not use Expo Go. Expo CLI 57.0.27 launches `host.exp.exponent/.experience.HomeActivity`, and Expo Go 57.0.9 does not contain that activity.

## Verify a change

- To capture the screen, run `adb exec-out screencap -p > <scratchpad>/shot.png`, then read the image.
- To list the visible text, run `adb shell uiautomator dump /sdcard/ui.xml`, then `adb shell cat /sdcard/ui.xml`.
- To run the UI flows, run `npm run e2e`. A flow in `.maestro/` starts with `launchApp` and needs Metro to run.
- To read JavaScript logs, run `adb logcat -d -s ReactNativeJS`.

A new Maestro flow waits for its first screen with `extendedWaitUntil` and a 30-second timeout. A cold JavaScript reload takes up to 20 seconds, and `assertVisible` fails before the screen renders.

## Traps

| Symptom | Cause | Fix |
| --- | --- | --- |
| `SDK location not found` from Gradle | `ANDROID_HOME` is not set. | Use `npm run android`. The script falls back to `$HOME/Library/Android/sdk`. |
| Every intent fails with `unable to resolve Intent`, and the screen shows the Google logo | The emulator is stuck. `adb shell dumpsys user` shows `State: BOOTING`, although `sys.boot_completed` is `1`. | Run `adb reboot`. Wait for `State: RUNNING_UNLOCKED`. |
| Metro asks for another port, or a different app loads | Another project uses port 8081. | Keep port 8090. The `start` and `android` scripts set the port. |
| A native module is missing at runtime | The installed dev build predates the dependency. | Run `npm run android` again to rebuild. |

Never kill an emulator or a Metro process that another project started. Check the owner first with `lsof -iTCP -sTCP:LISTEN -P` and `ps`.

# Firebase Emulator tests

These tests target only the local Firestore Emulator; they do not connect to a production Firebase project.

Requirements: Node.js 22, Java runtime, and Firebase CLI.

From the repository root, run:

```bash
npm install
firebase emulators:start --only firestore
```

In a second terminal:

```bash
npm run test:rules
npm run test:functions:build
```

The rules suite checks tenant isolation, inactive membership denial, client-side write denial, and published public-page reads. Tests have not been executed just because these files were added; record actual command output before marking them as passing.


## Browser bootstrap guard

The browser-side emulator bootstrap is loaded by `public/index.html`, but it does not replace the demo adapters yet.

- Demo remains the default: open the app without a query parameter.
- The emulator bootstrap can be explicitly requested only on a local hostname with `?backend=firebase-emulator`.
- It uses the fixed demo project ID `demo-alansm-booking` and local Auth, Firestore and Functions emulator ports 9099, 8080 and 5001.
- Preview/production hostnames are rejected. No production Firebase configuration is included.
- The dashboard and login/register forms remain demo-only until the next integration phase.

Run the guard tests with:

```bash
npm run test:firebase-emulator
```

Start all required local emulators with:

```bash
firebase emulators:start --project demo-alansm-booking --only auth,firestore,functions
```

Then open the local app with `?backend=firebase-emulator`. This initializes the SDK connections only; it does not yet authenticate users or persist dashboard changes.

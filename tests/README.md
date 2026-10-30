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

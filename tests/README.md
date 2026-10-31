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

The browser bootstrap now connects Firebase Authentication and the workspace onboarding flow to local emulators. The dashboard remains demo-only; it is deliberately not shown as a real Firebase workspace.

- Demo remains the default: open the app without a query parameter.
- The emulator bootstrap can be explicitly requested only on a local hostname with `?backend=firebase-emulator`.
- It uses the fixed demo project ID `demo-alansm-booking` and local Auth, Firestore and Functions emulator ports 9099, 8080 and 5001.
- Preview/production hostnames are rejected. No production Firebase configuration is included.
- Login, registration, email verification and tenant creation use Auth/Functions Emulator only.
- A successful Firebase session is shown in a safe status screen; it is not routed into the fictitious demo dashboard.

Run the guard and adapter tests with:

```bash
npm run test:firebase-emulator
```

Start the app and emulators in separate terminals from the repository root:

```bash
# Terminal 1: install Functions dependencies once
npm --prefix functions install
npm --prefix functions run build

# Terminal 2: start local Auth, Firestore and Functions emulators
npx firebase-tools emulators:start --project demo-alansm-booking --only auth,firestore,functions

# Terminal 3: serve the browser app
python -m http.server 3000 --directory public
```

Open `http://localhost:3000/?backend=firebase-emulator`. The Emulator UI is at `http://127.0.0.1:4000/`. Create a test account through the app, mark its email as verified in the Auth Emulator UI, and use the app's **Já confirmei o e-mail** action. Tenant creation is performed through the `createTenant` callable Function; the app then reads the session through `getSession`.

Do not use personal/customer data. This is a local integration test, not a production setup. The operational dashboard and persistent catalog/agenda mutations are still not connected.


## Remote Firebase Development (tablet preview)

The remote development path is opt-in and is restricted to the dedicated Cloudflare Pages preview host:
`firebase-emulator-bootstrap.alansm-booking-preview.pages.dev`.

- Open the preview with `?backend=firebase-development` to request remote Firebase Development.
- Demo remains the default when no backend query is present.
- The configuration endpoint returns Firebase web-app configuration only when Cloudflare Preview variables explicitly mark the environment as `development`.
- Missing configuration fails closed with HTTP 503; other hostnames are rejected.
- Required Cloudflare **Preview** variables: `FIREBASE_ENVIRONMENT=development`, `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, and `FIREBASE_APP_ID`. Optional: `FIREBASE_MESSAGING_SENDER_ID`.
- Do not add these variables to Cloudflare Production. Do not use a production Firebase project ID.
- Firebase Auth, Firestore rules/indexes and callable Functions still need to be configured/deployed to the dedicated development Firebase project before account tests can work. This repository does not deploy Firebase resources automatically.

Tests: `npm run test:firebase-config`.

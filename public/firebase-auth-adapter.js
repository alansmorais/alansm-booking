(() => {
  "use strict";

  function createFirebaseAuthAdapter({ auth, createUserWithEmailAndPassword,
    signInWithEmailAndPassword, signOut, updateProfile, sendEmailVerification, reload }) {
    const required = [auth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
      signOut, updateProfile, sendEmailVerification, reload];
    if (required.some((item) => typeof item !== "function" && item == null)) {
      throw new TypeError("Firebase Auth SDK incompleto.");
    }

    function currentUser() {
      return auth.currentUser || null;
    }

    return Object.freeze({
      mode: "firebase",
      isConfigured: true,
      async register({ email, password, displayName }) {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName && credential.user) {
          await updateProfile(credential.user, { displayName });
        }
        return credential.user;
      },
      async signIn({ email, password }) {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        return credential.user;
      },
      async sendEmailVerification() {
        const user = currentUser();
        if (!user) throw new Error("Faça login antes de confirmar o e-mail.");
        return sendEmailVerification(user);
      },
      async reloadCurrentUser() {
        const user = currentUser();
        if (!user) return null;
        await reload(user);
        return currentUser();
      },
      async signOut() {
        await signOut(auth);
        return { signedOut: true, mode: "firebase" };
      },
      getCurrentUser() {
        return currentUser();
      }
    });
  }

  window.BookingFirebaseAuth = Object.freeze({ createFirebaseAuthAdapter });
})();

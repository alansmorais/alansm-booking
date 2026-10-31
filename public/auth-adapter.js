(() => {
  "use strict";

  const NOT_CONNECTED =
    "A autenticação ainda não está ligada ao Firebase. Nenhuma informação foi enviada ou guardada.";

  function createDemoAdapter() {
    return Object.freeze({
      mode: "demo",
      isConfigured: false,
      async signIn() {
        throw new Error(NOT_CONNECTED);
      },
      async register() {
        throw new Error(NOT_CONNECTED);
      },
      async signOut() {
        return { signedOut: true, mode: "demo" };
      },
      async getCurrentUser() {
        return null;
      }
    });
  }

  window.BookingAuth = Object.freeze({ createDemoAdapter });
})();

(() => {
  "use strict";

  const gate = document.getElementById("authGate");
  if (!gate) return;

  const tabs = [...gate.querySelectorAll("[data-auth-tab]")];
  const login = gate.querySelector("#authLoginForm");
  const register = gate.querySelector("#authRegisterForm");
  const title = gate.querySelector("#authTitle");
  const notice = gate.querySelector("#authNotice");
  const noticeTitle = gate.querySelector("#authNoticeTitle");
  const noticeText = gate.querySelector("#authNoticeText");
  const status = gate.querySelector("#authStatus");
  const businessName = register.querySelector('[name="businessName"]');
  const slug = register.querySelector('[name="slug"]');
  const slugPreview = gate.querySelector("#slugPreview");
  const demoButton = gate.querySelector("#enterDemo");
  let slugEdited = false;
  let firebaseAuth = null;
  let firebaseWorkspace = null;
  let onboarding = null;
  let firebaseMode = false;
  let firebaseModeName = "Firebase";

  function notify(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 4200);
  }

  function setNotice(heading, message, kind = "info") {
    noticeTitle.textContent = heading;
    noticeText.textContent = message;
    notice.dataset.kind = kind;
  }

  function selectTab(tab) {
    const isRegister = tab === "register";
    tabs.forEach((button) => {
      const active = button.dataset.authTab === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    login.hidden = isRegister;
    register.hidden = !isRegister;
    title.textContent = isRegister ? "Crie o espaço da sua empresa" : "Bem-vindo ao AlanSM Booking";
  }

  function updateSlugPreview() {
    const value = window.BookingOnboarding.normalizeSlug(slug.value);
    slugPreview.textContent = value
      ? "Link previsto: /" + value
      : "O endereço será usado no link público da sua empresa.";
  }

  function readRegistration() {
    const values = Object.fromEntries(new FormData(register).entries());
    return {
      displayName: String(values.displayName || "").trim(),
      email: String(values.email || "").trim().toLowerCase(),
      password: String(values.password || ""),
      businessName: String(values.businessName || "").trim(),
      slug: window.BookingOnboarding.normalizeSlug(values.slug || values.businessName)
    };
  }

  function showFirebaseStatus(heading, message, actions = []) {
    status.hidden = false;
    status.replaceChildren();
    const strong = document.createElement("strong");
    strong.textContent = heading;
    const paragraph = document.createElement("p");
    paragraph.textContent = message;
    status.append(strong, paragraph);
    actions.forEach(({ label, action, secondary = false }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = secondary ? "secondary-btn" : "primary-btn";
      button.textContent = label;
      button.addEventListener("click", action);
      status.append(button);
    });
    login.hidden = true;
    register.hidden = true;
    gate.querySelector(".auth-tabs").hidden = true;
    demoButton.hidden = true;
  }

  function showAuthForms() {
    status.hidden = true;
    login.hidden = false;
    gate.querySelector(".auth-tabs").hidden = false;
    demoButton.hidden = false;
    selectTab("login");
  }

  function compatAuthAdapter(auth) {
    return window.BookingFirebaseAuth.createFirebaseAuthAdapter({
      auth,
      createUserWithEmailAndPassword: (instance, email, password) => instance.createUserWithEmailAndPassword(email, password),
      signInWithEmailAndPassword: (instance, email, password) => instance.signInWithEmailAndPassword(email, password),
      signOut: (instance) => instance.signOut(),
      updateProfile: (user, profile) => user.updateProfile(profile),
      sendEmailVerification: (user) => user.sendEmailVerification(),
      reload: (user) => user.reload()
    });
  }

  function compatFunctionsAdapter(functions) {
    return window.BookingFirebaseWorkspace.createFirebaseWorkspaceAdapter({
      functions,
      authAdapter: firebaseAuth,
      httpsCallable: (instance, name) => instance.httpsCallable(name)
    });
  }

  async function showVerifiedAccount() {
    const user = firebaseAuth.getCurrentUser();
    const session = await firebaseWorkspace.getSession();
    const tenants = Array.isArray(session.tenants) ? session.tenants : [];
    if (!tenants.length) {
      showFirebaseStatus(
        "E-mail confirmado · falta criar a empresa",
        "A conta está autenticada no ambiente Firebase de desenvolvimento. Informe os dados da empresa para concluir a criação do workspace.",
        [{
          label: "Informar dados da empresa",
          action: () => {
            showAuthForms();
            selectTab("register");
            register.querySelector('[name="displayName"]').value = user.displayName || "";
            register.querySelector('[name="email"]').value = user.email || "";
            register.querySelector('[name="password"]').required = false;
            register.querySelector('[name="password"]').placeholder = "Não é necessário preencher novamente";
            register.querySelector('[name="password"]').disabled = true;
            register.querySelector('[name="businessName"]').focus();
          }
        }, {
          label: "Terminar sessão",
          secondary: true,
          action: async () => { await firebaseAuth.signOut(); showAuthForms(); setNotice("Sessão terminada", "Pode entrar novamente com uma conta de teste do ambiente conectado."); }
        }]
      );
      return;
    }
    const list = tenants.map((tenant) => tenant.name + " (" + tenant.role + ")").join(", ");
    showFirebaseStatus(
      "Autenticação Firebase conectada",
      "Sessão: " + (user.email || "utilizador") + ". Empresas: " + list + ". A criação e a leitura da sessão já usam Cloud Functions no Emulator. O painel operacional ainda não está integrado ao Firestore; por segurança, os dados de demonstração não serão apresentados como dados reais.",
      [{
        label: "Terminar sessão",
        action: async () => {
          await firebaseAuth.signOut();
          showAuthForms();
          setNotice("Sessão terminada", "A conta foi desconectada do Firebase Emulator.");
        }
      }]
    );
  }

  async function initializeFirebaseMode() {
    const runtime = window.BookingFirebaseRuntime;
    if (!runtime) throw new Error("O runtime Firebase não foi carregado.");
    await runtime.ready;
    if (!["firebase-emulator", "firebase-development"].includes(runtime.mode) || !runtime.auth || !runtime.functions) {
      throw new Error("O ambiente Firebase solicitado não está disponível ou não foi configurado.");
    }
    firebaseAuth = compatAuthAdapter(runtime.auth);
    firebaseWorkspace = compatFunctionsAdapter(runtime.functions);
    onboarding = window.BookingOnboarding.createOnboardingFlow({ auth: firebaseAuth, workspace: firebaseWorkspace });
    firebaseMode = true;
    firebaseModeName = runtime.mode === "firebase-development" ? "Firebase Development" : "Firebase Emulator";
    setNotice(firebaseModeName, runtime.mode === "firebase-development"
      ? "Login e registo usam o projeto Firebase separado de desenvolvimento. Não utilize dados reais ou de produção."
      : "Login e registo usam exclusivamente os emuladores locais. Nenhuma conta ou palavra-passe é enviada para Firebase de produção.", "success");
    demoButton.hidden = true;
    const user = firebaseAuth.getCurrentUser();
    if (user) {
      if (user.emailVerified) await showVerifiedAccount();
      else showFirebaseStatus("Confirmação de e-mail pendente", runtime.mode === "firebase-development" ? "Confirme o e-mail usando a mensagem enviada pelo Firebase e depois volte para continuar." : "A conta existe apenas no Auth Emulator. Confirme o e-mail no painel do emulador e depois volte para continuar.", [{
        label: "Já confirmei o e-mail",
        action: async () => {
          try {
            const refreshed = await firebaseAuth.reloadCurrentUser();
            if (!refreshed?.emailVerified) throw new Error("O Firebase ainda indica que o e-mail não foi confirmado.");
            await showVerifiedAccount();
          } catch (error) { notify(error.message); }
        }
      }]);
    }
  }

  slug.addEventListener("input", () => { slugEdited = true; updateSlugPreview(); });
  businessName.addEventListener("input", () => {
    if (!slugEdited) slug.value = window.BookingOnboarding.normalizeSlug(businessName.value);
    updateSlugPreview();
  });
  tabs.forEach((button) => button.addEventListener("click", () => selectTab(button.dataset.authTab)));

  demoButton?.addEventListener("click", () => {
    if (firebaseMode) return;
    gate.hidden = true;
    document.body.classList.add("demo-entered");
  });

  login.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!firebaseMode) {
      notify("Login indisponível no modo demonstração. Use o botão para entrar na demonstração local.");
      return;
    }
    const values = new FormData(login);
    try {
      await firebaseAuth.signIn({
        email: String(values.get("email") || "").trim().toLowerCase(),
        password: String(values.get("password") || "")
      });
      const user = firebaseAuth.getCurrentUser();
      if (!user.emailVerified) {
        showFirebaseStatus("Confirmação de e-mail pendente", "Confirme o e-mail usando a mensagem enviada pelo Firebase e depois continue.", [{
          label: "Já confirmei o e-mail",
          action: async () => {
            try {
              const refreshed = await firebaseAuth.reloadCurrentUser();
              if (!refreshed?.emailVerified) throw new Error("O e-mail ainda não aparece como confirmado. Abra o link recebido e tente novamente.");
              await showVerifiedAccount();
            } catch (error) { notify(error.message); }
          }
        }]);
      } else {
        await showVerifiedAccount();
      }
    } catch (error) { notify(error.message || "Não foi possível entrar."); }
  });

  register.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!firebaseMode) {
      notify("O registo só funciona quando um ambiente Firebase autorizado está conectado.");
      return;
    }
    const values = readRegistration();
    try {
      const currentUser = firebaseAuth.getCurrentUser();
      const result = currentUser?.emailVerified
        ? await onboarding.completeAfterVerification(values)
        : await onboarding.registerAndCreateWorkspace(values);
      if (result.status === "verification-required") {
        showFirebaseStatus(
          "Conta de teste criada · confirme o e-mail",
          "O utilizador " + values.email + " foi criado no Firebase Development. Abra a mensagem de confirmação enviada para esse endereço e depois volte aqui. A empresa ainda não foi criada.",
          [{
            label: "Já confirmei o e-mail",
            action: async () => {
              try {
                const refreshed = await firebaseAuth.reloadCurrentUser();
                if (!refreshed?.emailVerified) throw new Error("O Firebase ainda não marcou este e-mail como confirmado. Abra o link recebido e tente novamente.");
                const completed = await onboarding.completeAfterVerification(values);
                if (completed.status === "complete") await showVerifiedAccount();
              } catch (error) { notify(error.message); }
            }
          }]
        );
      }
    } catch (error) { notify(error.message || "Não foi possível criar a conta."); }
  });

  window.BookingInvitationPage?.mount({
    gate,
    search: window.location.search,
    onChooseAccess: selectTab
  });

  selectTab("login");
  let mode = null;
  try {
    mode = window.BookingFirebaseConfig?.resolveMode({
      search: window.location.search,
      hostname: window.location.hostname
    });
  } catch (error) {
    setNotice("Emulador bloqueado", error.message, "error");
    tabs.forEach((button) => { button.disabled = true; });
    login.querySelectorAll("input,button").forEach((element) => { element.disabled = true; });
    register.querySelectorAll("input,button").forEach((element) => { element.disabled = true; });
    demoButton.hidden = true;
  }
  if (mode?.mode === "firebase-emulator" || mode?.mode === "firebase-development") {
    initializeFirebaseMode().catch((error) => {
      setNotice("Emulador não iniciado", error.message + " A demonstração não será aberta automaticamente.", "error");
      tabs.forEach((button) => { button.disabled = true; });
      login.querySelectorAll("input,button").forEach((element) => { element.disabled = true; });
      register.querySelectorAll("input,button").forEach((element) => { element.disabled = true; });
      demoButton.hidden = true;
    });
  } else if (mode?.mode === "demo") {
    setNotice("Modo demonstração", "Os dados são fictícios e ficam apenas neste navegador. Para testar autenticação, inicie os emuladores locais e use ?backend=firebase-emulator em localhost.");
  }
})();
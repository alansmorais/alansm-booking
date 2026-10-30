(() => {
  const gate = document.getElementById("authGate");
  if (!gate) return;

  const auth = window.BookingAuth.createDemoAdapter();
  const tabs = [...gate.querySelectorAll("[data-auth-tab]")];
  const login = gate.querySelector("#authLoginForm");
  const register = gate.querySelector("#authRegisterForm");
  const title = gate.querySelector("#authTitle");
  const businessName = register.querySelector('[name="businessName"]');
  const slug = register.querySelector('[name="slug"]');
  const slugPreview = gate.querySelector("#slugPreview");
  let slugEdited = false;

  slug.addEventListener("input", () => {
    slugEdited = true;
    updateSlugPreview();
  });
  businessName.addEventListener("input", () => {
    if (!slugEdited) {
      slug.value = window.BookingOnboarding.normalizeSlug(businessName.value);
    }
    updateSlugPreview();
  });

  function updateSlugPreview() {
    const value = window.BookingOnboarding.normalizeSlug(slug.value);
    slugPreview.textContent = value
      ? "Link previsto: /" + value
      : "O endereço será usado no link público da sua empresa.";
  }

  function notify(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 4200);
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
    title.textContent = isRegister
      ? "Crie o espaço da sua empresa"
      : "Bem-vindo ao AlanSM Booking";
  }

  tabs.forEach((button) =>
    button.addEventListener("click", () => selectTab(button.dataset.authTab))
  );

  gate.querySelector("#enterDemo")?.addEventListener("click", () => {
    gate.hidden = true;
    document.body.classList.add("demo-entered");
  });

  login.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await auth.signIn();
    } catch (error) {
      login.reset();
      notify(error.message);
    }
  });

  register.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await auth.register();
    } catch (error) {
      register.reset();
      notify(error.message);
    }
  });

  window.BookingInvitationPage?.mount({
    gate,
    search: window.location.search,
    onChooseAccess: selectTab
  });

  selectTab("login");
})();

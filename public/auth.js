(() => {
  const gate=document.getElementById("authGate");
  if(!gate)return;
  const tabs=[...gate.querySelectorAll("[data-auth-tab]")];
  const login=gate.querySelector("#authLoginForm");
  const register=gate.querySelector("#authRegisterForm");
  const title=gate.querySelector("#authTitle");
  function selectTab(tab){
    const isRegister=tab==="register";
    tabs.forEach(button=>{
      const active=button.dataset.authTab===tab;
      button.classList.toggle("active",active);
      button.setAttribute("aria-selected",String(active));
    });
    login.hidden=isRegister;
    register.hidden=!isRegister;
    title.textContent=isRegister?"Crie o espaço da sua empresa":"Bem-vindo ao AlanSM Booking";
  }
  tabs.forEach(button=>button.addEventListener("click",()=>selectTab(button.dataset.authTab)));
  gate.querySelector("#enterDemo")?.addEventListener("click",()=>{
    gate.hidden=true;
    document.body.classList.add("demo-entered");
  });
  [login,register].forEach(form=>form.addEventListener("submit",event=>{
    event.preventDefault();
    form.reset();
    const message="A autenticação Firebase ainda não está ligada. Nenhum dado foi enviado ou guardado. Utilize a demonstração local por enquanto.";
    const toast=document.getElementById("toast");
    if(toast){toast.textContent=message;toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),4200);}
  }));
  selectTab("login");
})();

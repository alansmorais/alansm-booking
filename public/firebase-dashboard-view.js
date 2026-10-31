(() => {
  "use strict";
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[char]));
  const dateISO = (date) => date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
  const addDays = (date, amount) => { const next=new Date(date); next.setDate(next.getDate()+amount); return next; };
  const money = (minor,currency) => Number.isSafeInteger(minor)&&currency
    ? new Intl.NumberFormat("pt-BR",{style:"currency",currency}).format(minor/100) : "—";
  async function mount({tenant,user,dashboard,onSignOut}={}) {
    if (!tenant || !dashboard) throw new Error("Empresa ou painel Firebase inválido.");
    const content=document.getElementById("content");
    const shell=document.querySelector(".app-shell");
    if (!content || !shell) throw new Error("A área do painel não foi encontrada.");
    shell.hidden=false;
    const sidebar=document.getElementById("sidebar");
    if(sidebar) sidebar.hidden=true;
    shell.style.gridTemplateColumns="minmax(0,1fr)";
    const modePill=document.querySelector(".demo-pill");
    if(modePill) modePill.textContent="FIREBASE · LEITURA";
    const footer=document.querySelector(".footer");
    if(footer) footer.innerHTML="<span>AlanSM Booking · Firebase</span><span>Consulta autenticada · somente leitura.</span>";
    const workspaceName=document.getElementById("workspaceName");
    const workspaceRole=document.getElementById("workspaceRole");
    if(workspaceName) workspaceName.textContent=tenant.name;
    if(workspaceRole) workspaceRole.textContent="Acesso: "+(tenant.role||"membro");
    const today=new Date();
    const end=addDays(today,6);
    const startDate=dateISO(today), endDate=dateISO(end);
    content.innerHTML='<section class="firebase-readonly"><div class="firebase-readonly-head"><div><span class="firebase-readonly-kicker">DADOS AUTENTICADOS</span><h1>'+escape(tenant.name)+'</h1><p>Consulta segura · sem edição ou gravação nesta versão</p></div><button type="button" id="firebaseReadOnlySignOut" class="secondary-btn">Terminar sessão</button></div><div class="firebase-readonly-state" role="status">A carregar catálogo, horários e agenda da empresa…</div><div id="firebaseReadOnlyData"></div></section>';
    document.getElementById("firebaseReadOnlySignOut").addEventListener("click",onSignOut);
    const state=content.querySelector(".firebase-readonly-state");
    const data=content.querySelector("#firebaseReadOnlyData");
    try {
      const catalog=await dashboard.loadCatalog({tenantId:tenant.tenantId});
      const schedule=await dashboard.loadSchedule({tenantId:tenant.tenantId,startDate,endDate});
      const startAtMs=new Date(startDate+"T00:00:00").getTime();
      const endAtMs=new Date(endDate+"T23:59:59.999").getTime();
      const agenda=await dashboard.loadAgenda({tenantId:tenant.tenantId,startAtMs,endAtMs});
      const appts=agenda.appointments||[];
      const professionals=catalog.professionals||[];
      const services=catalog.services||[];
      const blocks=schedule.blocks||[];
      data.innerHTML=
        '<div class="firebase-readonly-stats"><article><strong>'+appts.length+'</strong><span>Agendamentos no período</span></article><article><strong>'+professionals.length+'</strong><span>Profissionais</span></article><article><strong>'+services.length+'</strong><span>Serviços</span></article><article><strong>'+blocks.length+'</strong><span>Bloqueios</span></article></div>'+
        '<section class="firebase-readonly-section"><h2>Agenda · '+escape(startDate)+' a '+escape(endDate)+'</h2>'+
        (appts.length?'<div class="firebase-readonly-table-wrap"><table><thead><tr><th>Data</th><th>Hora</th><th>Serviço</th><th>Profissional</th><th>Estado</th><th>Valor</th></tr></thead><tbody>'+appts.map(a=>'<tr><td>'+escape(a.date)+'</td><td>'+escape(a.time)+'</td><td>'+escape(a.service)+'</td><td>'+escape(a.professional)+'</td><td>'+escape(a.status)+'</td><td>'+escape(money(a.priceMinor,a.currency))+'</td></tr>').join("")+'</tbody></table></div>':'<p class="firebase-readonly-empty">Não há agendamentos neste período.</p>')+'</section>'+
        '<div class="firebase-readonly-columns"><section class="firebase-readonly-section"><h2>Profissionais</h2>'+(professionals.length?'<ul>'+professionals.map(p=>'<li>'+escape(p[0])+' <span>'+escape(p[3])+'</span></li>').join("")+'</ul>':'<p class="firebase-readonly-empty">Nenhum profissional cadastrado.</p>')+'</section>'+
        '<section class="firebase-readonly-section"><h2>Serviços</h2>'+(services.length?'<ul>'+services.map(s=>'<li>'+escape(s[0])+' <span>'+escape(s[1]+' min')+' · '+escape(s[2])+'</span></li>').join("")+'</ul>':'<p class="firebase-readonly-empty">Nenhum serviço cadastrado.</p>')+'</section></div>'+
        '<section class="firebase-readonly-section"><h2>Horários e disponibilidade</h2><p>Fuso horário: '+escape(schedule.timezone||"não informado")+'.'+(schedule.truncated?' Alguns registos foram limitados pela consulta.':'')+'</p><p>Os horários e bloqueios foram carregados do workspace autorizado.</p></section>';
      state.textContent="Dados carregados do Firebase. Esta tela é somente leitura.";
      state.dataset.kind="success";
    } catch(error) {
      state.textContent="Não foi possível carregar os dados: "+(error.message||"erro desconhecido")+". Atualize a página ou volte a entrar.";
      state.dataset.kind="error";
      throw error;
    }
  }
  const style=document.createElement("style");
  style.textContent='.firebase-readonly{max-width:1200px;margin:0 auto;padding:28px}.firebase-readonly-head{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:22px}.firebase-readonly-kicker{font-size:11px;letter-spacing:.12em;color:#64748b;font-weight:800}.firebase-readonly-head h1{margin:8px 0 4px}.firebase-readonly-head p,.firebase-readonly-section p{color:#64748b}.firebase-readonly-state{padding:14px 16px;border-radius:12px;background:#eff6ff;color:#1e40af;margin-bottom:20px}.firebase-readonly-state[data-kind=success]{background:#ecfdf5;color:#047857}.firebase-readonly-state[data-kind=error]{background:#fef2f2;color:#b91c1c}.firebase-readonly-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:20px}.firebase-readonly-stats article,.firebase-readonly-section{background:var(--card,#fff);border:1px solid #e5e7eb;border-radius:14px;padding:18px}.firebase-readonly-stats strong{display:block;font-size:26px}.firebase-readonly-stats span,.firebase-readonly-section li span{display:block;color:#64748b;font-size:13px}.firebase-readonly-section{margin-bottom:18px;overflow:hidden}.firebase-readonly-section h2{font-size:17px;margin:0 0 14px}.firebase-readonly-table-wrap{overflow-x:auto}.firebase-readonly table{width:100%;border-collapse:collapse;text-align:left;font-size:13px}.firebase-readonly th,.firebase-readonly td{padding:11px;border-bottom:1px solid #e5e7eb;white-space:nowrap}.firebase-readonly th{color:#64748b}.firebase-readonly ul{list-style:none;padding:0;margin:0}.firebase-readonly li{padding:10px 0;border-bottom:1px solid #e5e7eb}.firebase-readonly li span{display:inline;margin-left:8px}.firebase-readonly-columns{display:grid;grid-template-columns:1fr 1fr;gap:18px}.firebase-readonly-empty{color:#64748b;padding:12px 0}@media(max-width:700px){.firebase-readonly{padding:16px}.firebase-readonly-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.firebase-readonly-columns{grid-template-columns:1fr}.firebase-readonly-head{align-items:flex-start;flex-direction:column}}';
  document.head.append(style);
  window.BookingFirebaseDashboardView=Object.freeze({mount});
})();
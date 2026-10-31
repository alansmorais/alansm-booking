(() => {
  "use strict";
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[char]));
  const dateInZone = (date, timeZone) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return get("year")+"-"+get("month")+"-"+get("day");
  };
  const shiftDate = (date, amount) => {
    const [year,month,day] = date.split("-").map(Number);
    return new Date(Date.UTC(year,month-1,day+amount)).toISOString().slice(0,10);
  };
  const tenantMidnight = (date, timeZone) => {
    const [year,month,day] = date.split("-").map(Number);
    const target = Date.UTC(year,month-1,day);
    let guess = target;
    for (let attempt=0; attempt<4; attempt++) {
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23" }).formatToParts(new Date(guess));
      const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
      const represented = Date.UTC(get("year"),get("month")-1,get("day"),get("hour"),get("minute"),get("second"));
      const delta = target-represented;
      guess += delta;
      if (delta === 0) break;
    }
    return guess;
  };
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
    const tenantTimeZone=tenant.timezone||"UTC";
    const startDate=dateInZone(new Date(),tenantTimeZone);
    const endDate=shiftDate(startDate,6);
    content.innerHTML='<section class="firebase-readonly"><div class="firebase-readonly-head"><div><span class="firebase-readonly-kicker">DADOS AUTENTICADOS</span><h1>'+escape(tenant.name)+'</h1><p>Consulta segura · sem edição ou gravação nesta versão</p></div><button type="button" id="firebaseReadOnlySignOut" class="secondary-btn">Terminar sessão</button></div><div class="firebase-readonly-state" role="status">A carregar catálogo, horários e agenda da empresa…</div><div id="firebaseReadOnlyData"></div></section>';
    document.getElementById("firebaseReadOnlySignOut").addEventListener("click",onSignOut);
    const state=content.querySelector(".firebase-readonly-state");
    const data=content.querySelector("#firebaseReadOnlyData");
    try {
      const catalog=await dashboard.loadCatalog({tenantId:tenant.tenantId});
      const schedule=await dashboard.loadSchedule({tenantId:tenant.tenantId,startDate,endDate});
      const startAtMs=tenantMidnight(startDate,tenantTimeZone);
      const endAtMs=tenantMidnight(shiftDate(endDate,1),tenantTimeZone);
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

      if (["owner","admin"].includes(tenant.role) && workspace?.getCatalogForManagement && workspace?.saveCatalogItem) {
        const panel=document.createElement("section");
        panel.className="firebase-readonly-section firebase-management";
        panel.innerHTML='<h2>Gestão de serviços e profissionais</h2><p>As alterações são guardadas pelo Firebase. Os registos são desativados, nunca apagados.</p><div class="firebase-management-status" role="status">A carregar cadastros…</div><div class="firebase-management-list"></div><form class="firebase-management-form"><h3>Novo cadastro</h3><input type="hidden" name="itemId"><label>Tipo<select name="kind"><option value="service">Serviço</option><option value="professional">Profissional</option></select></label><label>Nome<input name="name" minlength="2" maxlength="100" required></label><div class="firebase-service-fields"><label>Duração (minutos)<input name="durationMinutes" type="number" min="15" max="480" step="15" value="30"></label><label>Preço<input name="price" type="number" min="0" step="0.01" value="0"></label><label>Moeda<input name="currency" maxlength="3" pattern="[A-Z]{3}" value="'+escape(tenant.currency||"PLN")+'"></label></div><div class="firebase-professional-fields" hidden><label>Cor<input name="color" type="color" value="#2563EB"></label></div><div class="firebase-management-actions"><button class="primary-btn" type="submit">Guardar cadastro</button><button class="secondary-btn" type="button" data-reset>Limpar</button></div></form>';
        data.append(panel);
        const managerStatus=panel.querySelector(".firebase-management-status");
        const managerList=panel.querySelector(".firebase-management-list");
        const managerForm=panel.querySelector(".firebase-management-form");
        const kindField=managerForm.elements.kind;
        const toggleFields=()=>{panel.querySelector(".firebase-service-fields").hidden=kindField.value!=="service";panel.querySelector(".firebase-professional-fields").hidden=kindField.value!=="professional";};
        const resetForm=()=>{managerForm.reset();managerForm.elements.itemId.value="";managerForm.elements.currency.value=tenant.currency||"PLN";panel.querySelector("h3").textContent="Novo cadastro";toggleFields();};
        let managed={professionals:[],services:[]};
        const renderManaged=()=>{
          managerList.replaceChildren();
          [["services","Serviços","service"],["professionals","Profissionais","professional"]].forEach(([key,label,kind])=>{
            const group=document.createElement("div");group.className="firebase-management-group";
            const heading=document.createElement("h3");heading.textContent=label;group.append(heading);
            if(!managed[key].length){const empty=document.createElement("p");empty.textContent="Nenhum cadastro.";group.append(empty);}
            managed[key].forEach(item=>{
              const row=document.createElement("div");row.className="firebase-management-row";
              const info=document.createElement("div");const name=document.createElement("strong");name.textContent=item.name||"Sem nome";
              const detail=document.createElement("span");detail.textContent=kind==="service"?(item.durationMinutes||"—")+" min · "+money(item.priceMinor,item.currency):"Cor "+(item.color||"padrão");
              const statusLabel=document.createElement("small");statusLabel.textContent=item.status==="active"?"Ativo":"Inativo";info.append(name,detail,statusLabel);
              const actions=document.createElement("div");actions.className="firebase-management-row-actions";
              const edit=document.createElement("button");edit.type="button";edit.className="secondary-btn";edit.textContent="Editar";edit.dataset.edit=kind;edit.dataset.id=item.id;actions.append(edit);
              if(item.status==="active"){const deactivate=document.createElement("button");deactivate.type="button";deactivate.className="secondary-btn";deactivate.textContent="Desativar";deactivate.dataset.deactivate=kind;deactivate.dataset.id=item.id;actions.append(deactivate);}
              row.append(info,actions);group.append(row);
            });
            managerList.append(group);
          });
        };
        const reloadManaged=async()=>{
          managerStatus.textContent="A carregar cadastros…";
          const result=await workspace.getCatalogForManagement({tenantId:tenant.tenantId});
          managed={professionals:Array.isArray(result.professionals)?result.professionals:[],services:Array.isArray(result.services)?result.services:[]};
          renderManaged();managerStatus.textContent="Cadastros atualizados.";
        };
        kindField.addEventListener("change",toggleFields);
        managerForm.querySelector("[data-reset]").addEventListener("click",resetForm);
        managerForm.addEventListener("submit",async event=>{
          event.preventDefault();const button=managerForm.querySelector('button[type="submit"]');button.disabled=true;managerStatus.textContent="A guardar…";
          try{
            const values=new FormData(managerForm);const kind=String(values.get("kind"));
            const payload={tenantId:tenant.tenantId,kind,itemId:String(values.get("itemId")||""),name:String(values.get("name")||"").trim()};
            if(kind==="service"){payload.durationMinutes=Number(values.get("durationMinutes"));payload.priceMinor=Math.round(Number(values.get("price"))*100);payload.currency=String(values.get("currency")||"").trim().toUpperCase();}
            else payload.color=String(values.get("color")||"#2563EB");
            await workspace.saveCatalogItem(payload);resetForm();await reloadManaged();managerStatus.textContent="Cadastro guardado com sucesso.";
          }catch(error){managerStatus.textContent="Não foi possível guardar: "+(error.message||"erro desconhecido");}
          finally{button.disabled=false;}
        });
        managerList.addEventListener("click",async event=>{
          const edit=event.target.closest("[data-edit]");const deactivate=event.target.closest("[data-deactivate]");
          if(edit){
            const kind=edit.dataset.edit;const item=(kind==="service"?managed.services:managed.professionals).find(entry=>entry.id===edit.dataset.id);if(!item)return;
            resetForm();kindField.value=kind;managerForm.elements.itemId.value=item.id;managerForm.elements.name.value=item.name||"";
            if(kind==="service"){managerForm.elements.durationMinutes.value=item.durationMinutes||30;managerForm.elements.price.value=Number.isSafeInteger(item.priceMinor)?(item.priceMinor/100).toFixed(2):"0";managerForm.elements.currency.value=item.currency||tenant.currency||"PLN";}
            else managerForm.elements.color.value=item.color||"#2563EB";
            panel.querySelector("form h3").textContent="Editar cadastro";toggleFields();managerForm.scrollIntoView({behavior:"smooth",block:"center"});
          }else if(deactivate){
            if(!window.confirm("Desativar este cadastro? O histórico será preservado."))return;
            deactivate.disabled=true;managerStatus.textContent="A desativar…";
            try{await workspace.saveCatalogItem({tenantId:tenant.tenantId,kind:deactivate.dataset.deactivate,itemId:deactivate.dataset.id,active:false});await reloadManaged();managerStatus.textContent="Cadastro desativado. Histórico preservado.";}
            catch(error){managerStatus.textContent="Não foi possível desativar: "+(error.message||"erro desconhecido");deactivate.disabled=false;}
          }
        });
        try{await reloadManaged();}catch(error){managerStatus.textContent="Não foi possível carregar a gestão: "+(error.message||"erro desconhecido");}
      }
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

  const managementStyle=document.createElement("style");
  managementStyle.textContent='.firebase-management [hidden]{display:none!important}.firebase-management>p{color:#64748b}.firebase-management-status{padding:10px 12px;background:#f1f5f9;border-radius:9px;margin:12px 0;color:#334155;font-size:13px}.firebase-management-list{display:grid;grid-template-columns:1fr 1fr;gap:16px}.firebase-management-group h3,.firebase-management-form h3{font-size:15px;margin:10px 0}.firebase-management-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #e5e7eb}.firebase-management-row strong,.firebase-management-row span,.firebase-management-row small{display:block}.firebase-management-row span,.firebase-management-row small{font-size:12px;color:#64748b;margin-top:3px}.firebase-management-row-actions,.firebase-management-actions{display:flex;gap:8px;flex-wrap:wrap}.firebase-management-form{border-top:1px solid #e5e7eb;margin-top:18px;padding-top:18px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.firebase-management-form h3{grid-column:1/-1}.firebase-management-form label{display:grid;gap:6px;font-size:13px;color:#475569}.firebase-management-form input,.firebase-management-form select{min-width:0;width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:var(--card,#fff);color:inherit}.firebase-management-actions{grid-column:1/-1}.firebase-management button:disabled{opacity:.55;cursor:wait}@media(max-width:700px){.firebase-management-list{grid-template-columns:1fr}.firebase-management-form{grid-template-columns:1fr}.firebase-management-row{align-items:flex-start;flex-direction:column}}';
  document.head.append(managementStyle);
  document.head.append(style);
  window.BookingFirebaseDashboardView=Object.freeze({mount});
})();
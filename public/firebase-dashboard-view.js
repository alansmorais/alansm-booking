(() => {
  "use strict";
  // Authenticated management view; all writes are delegated to tenant-scoped callable functions.
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
  async function mount({tenant,user,workspace,dashboard,onSignOut}={}) {
    if (!tenant || !dashboard) throw new Error("Empresa ou painel Firebase inválido.");
    if (["owner","admin"].includes(tenant.role) && (!workspace?.getCatalogForManagement || !workspace?.saveCatalogItem)) throw new Error("A gestão do catálogo não está disponível neste workspace.");
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
    content.innerHTML='<section class="firebase-readonly"><div class="firebase-readonly-head"><div><span class="firebase-readonly-kicker">DADOS AUTENTICADOS</span><h1>'+escape(tenant.name)+'</h1><p>Consulta segura · gestão disponível para proprietários e administradores</p></div><button type="button" id="firebaseReadOnlySignOut" class="secondary-btn">Terminar sessão</button></div><div class="firebase-readonly-state" role="status">A carregar catálogo, horários e agenda da empresa…</div><div id="firebaseReadOnlyData"></div></section>';
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
      if (["owner","admin"].includes(tenant.role) && workspace?.saveScheduleSettings && workspace?.saveScheduleException && workspace?.saveScheduleBlock) {
        const schedulePanel=document.createElement("section");
        schedulePanel.className="firebase-readonly-section firebase-management firebase-schedule-management";
        schedulePanel.innerHTML='<h2>Gestão de horários e disponibilidade</h2><p>Configure o horário semanal, feriados, ausências e bloqueios. As alterações são registadas no Firebase.</p><div class="firebase-management-status" data-schedule-status role="status">Pronto para editar.</div><form class="firebase-management-form" data-week-form><h3>Horário semanal</h3><label>Aplicar a<select name="scope"><option value="company">Empresa</option><option value="professional">Profissional</option></select></label><label data-week-professional-wrap>Profissional<select name="professionalId"><option value="">Selecione</option></select></label><div class="schedule-days" data-days></div><div class="firebase-management-actions"><button class="primary-btn" type="submit">Guardar horário semanal</button></div></form><form class="firebase-management-form" data-exception-form><h3>Fecho ou ausência</h3><label>Tipo<select name="kind"><option value="companyClosure">Fecho da empresa</option><option value="professionalAbsence">Ausência de profissional</option></select></label><label>Profissional<select name="professionalId"><option value="">Selecione</option></select></label><label>Data inicial<input name="startDate" type="date" required></label><label>Data final<input name="endDate" type="date"></label><label>Motivo<input name="reason" maxlength="240" placeholder="Feriado, férias…"></label><div class="firebase-management-actions"><button class="primary-btn" type="submit">Guardar indisponibilidade</button></div></form><form class="firebase-management-form" data-block-form><h3>Bloquear horário</h3><label>Data<input name="date" type="date" required></label><label>Início<input name="start" type="time" required></label><label>Fim<input name="end" type="time" required></label><label>Profissional<select name="professionalId"><option value="">Toda a empresa</option></select></label><label>Motivo<input name="reason" maxlength="240" placeholder="Pausa, compromisso…"></label><div class="firebase-management-actions"><button class="primary-btn" type="submit">Criar bloqueio</button></div></form><div class="schedule-current"><h3>Bloqueios existentes</h3><div data-block-list></div></div>';
        data.append(schedulePanel);
        const scheduleStatus=schedulePanel.querySelector("[data-schedule-status]");
        const weekForm=schedulePanel.querySelector("[data-week-form]");
        const exceptionForm=schedulePanel.querySelector("[data-exception-form]");
        const blockForm=schedulePanel.querySelector("[data-block-form]");
        const daysHost=schedulePanel.querySelector("[data-days]");
        const scheduleCatalog=await workspace.getCatalogForManagement({tenantId:tenant.tenantId});
        const scheduleProfessionals=Array.isArray(scheduleCatalog.professionals)?scheduleCatalog.professionals:[];
        const weekScope=weekForm.elements.scope;
        const weekProfessional=weekForm.elements.professionalId;
        weekProfessional.innerHTML='<option value="">Selecione</option>'+scheduleProfessionals.filter(item=>item.status==="active").map(item=>'<option value="'+escape(item.id)+'">'+escape(item.name)+'</option>').join("");
        const dayNames=["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
        const renderWeekDays=()=>{
          const source=weekScope.value==="company"?schedule.raw?.companySchedule:(schedule.raw?.professionalSchedules?.[weekProfessional.value]||{});
          daysHost.innerHTML=dayNames.map((day,index)=>{
            const periods=source?.[String(index)]||[];
            const period=periods[0]||{};
            return '<div class="schedule-day-row"><label class="schedule-day-enabled"><input type="checkbox" name="enabled_'+index+'" '+(periods.length?'checked':'')+'> '+day+'</label><label>Abre<input type="time" name="start_'+index+'" value="'+escape(period.start||"09:00")+'"></label><label>Fecha<input type="time" name="end_'+index+'" value="'+escape(period.end||"18:00")+'"></label></div>';
          }).join("");
        };
        const toggleWeekScope=()=>{const professional=weekScope.value==="professional";weekForm.querySelector("[data-week-professional-wrap]").hidden=!professional;weekProfessional.required=professional;};
        weekScope.addEventListener("change",()=>{toggleWeekScope();renderWeekDays();});
        weekProfessional.addEventListener("change",renderWeekDays);
        toggleWeekScope();renderWeekDays();
        const fillProfessionalOptions=(select,includeCompany)=>{
          select.innerHTML=(includeCompany?'<option value="">Toda a empresa</option>':'<option value="">Selecione</option>')+
            scheduleProfessionals.filter(item=>item.status==="active").map(item=>'<option value="'+escape(item.id)+'">'+escape(item.name)+'</option>').join("");
        };
        fillProfessionalOptions(exceptionForm.elements.professionalId,false);
        fillProfessionalOptions(blockForm.elements.professionalId,true);
        const toggleExceptionProfessional=()=>{exceptionForm.elements.professionalId.disabled=exceptionForm.elements.kind.value!=="professionalAbsence";};
        exceptionForm.elements.kind.addEventListener("change",toggleExceptionProfessional);toggleExceptionProfessional();
        const refreshSchedule=async message=>{
          scheduleStatus.textContent=message||"A atualizar dados…";
          await mount({tenant,user,workspace,dashboard,onSignOut});
        };
        weekForm.addEventListener("submit",async event=>{
          event.preventDefault();const button=weekForm.querySelector('button[type="submit"]');button.disabled=true;scheduleStatus.textContent="A guardar horário…";
          try{
            const form=new FormData(weekForm);const days={};
            for(let day=0;day<=6;day++){days[String(day)]=form.get("enabled_"+day)?[{start:String(form.get("start_"+day)),end:String(form.get("end_"+day)),breaks:[]}]:[];}
            const scope=weekScope.value;
            if(scope==="professional"&&!weekProfessional.value)throw new Error("Selecione o profissional.");
            await workspace.saveScheduleSettings({tenantId:tenant.tenantId,scope,professionalId:scope==="professional"?weekProfessional.value:"",days});
            await refreshSchedule("Horário semanal guardado.");
          }catch(error){scheduleStatus.textContent="Não foi possível guardar o horário: "+(error.message||"erro desconhecido");button.disabled=false;}
        });
        exceptionForm.addEventListener("submit",async event=>{
          event.preventDefault();const button=exceptionForm.querySelector('button[type="submit"]');button.disabled=true;scheduleStatus.textContent="A guardar indisponibilidade…";
          try{
            const form=new FormData(exceptionForm);const kind=String(form.get("kind"));
            await workspace.saveScheduleException({tenantId:tenant.tenantId,kind,professionalId:String(form.get("professionalId")||""),startDate:String(form.get("startDate")),endDate:String(form.get("endDate")||form.get("startDate")),reason:String(form.get("reason")||"")});
            await refreshSchedule("Indisponibilidade guardada.");
          }catch(error){scheduleStatus.textContent="Não foi possível guardar: "+(error.message||"erro desconhecido");button.disabled=false;}
        });
        blockForm.addEventListener("submit",async event=>{
          event.preventDefault();const button=blockForm.querySelector('button[type="submit"]');button.disabled=true;scheduleStatus.textContent="A criar bloqueio…";
          try{
            const form=new FormData(blockForm);
            await workspace.saveScheduleBlock({tenantId:tenant.tenantId,date:String(form.get("date")),start:String(form.get("start")),end:String(form.get("end")),professionalId:String(form.get("professionalId")||""),reason:String(form.get("reason")||"")});
            await refreshSchedule("Bloqueio criado.");
          }catch(error){scheduleStatus.textContent="Não foi possível criar o bloqueio: "+(error.message||"erro desconhecido");button.disabled=false;}
        });
        const blockList=schedulePanel.querySelector("[data-block-list]");
        if(!blocks.length){blockList.textContent="Não existem bloqueios neste período.";}
        blocks.forEach(block=>{
          const row=document.createElement("div");row.className="firebase-management-row";
          const info=document.createElement("span");info.textContent=block.date+" · "+block.start+"–"+block.end+" · "+(block.professionalId||"Toda a empresa")+(block.label?" · "+block.label:"");
          const remove=document.createElement("button");remove.type="button";remove.className="secondary-btn";remove.textContent="Remover";
          remove.addEventListener("click",async()=>{if(!window.confirm("Remover este bloqueio?"))return;remove.disabled=true;scheduleStatus.textContent="A remover bloqueio…";try{await workspace.saveScheduleBlock({tenantId:tenant.tenantId,blockId:block.id,date:block.date,remove:true});await refreshSchedule("Bloqueio removido.");}catch(error){scheduleStatus.textContent="Não foi possível remover: "+(error.message||"erro desconhecido");remove.disabled=false;}});
          row.append(info,remove);blockList.append(row);
        });
      }
      if (["owner","admin"].includes(tenant.role) && workspace?.getMembers && workspace?.inviteMember && workspace?.updateMember) {
        const teamPanel=document.createElement("section");
        teamPanel.className="firebase-readonly-section firebase-management firebase-team-management";
        teamPanel.innerHTML='<h2>Equipe e acessos</h2><p>Convites são criados com validade de sete dias. A entrega é manual: copie o link e envie apenas ao endereço convidado.</p><div class="firebase-management-status" data-team-status role="status">A carregar equipe…</div><div data-team-list></div><form class="firebase-management-form" data-invite-form><h3>Convidar pessoa</h3><label>E-mail<input name="email" type="email" maxlength="254" required placeholder="pessoa@empresa.com"></label><label>Permissão<select name="role"><option value="staff">Equipe · operação</option>'+(tenant.role==="owner"?'<option value="admin">Administrador</option>':'')+'</select></label><div class="firebase-management-actions"><button class="primary-btn" type="submit">Criar convite</button></div></form><div data-invite-result hidden></div>';
        data.append(teamPanel);
        const teamStatus=teamPanel.querySelector("[data-team-status]");
        const teamList=teamPanel.querySelector("[data-team-list]");
        const inviteForm=teamPanel.querySelector("[data-invite-form]");
        const inviteResult=teamPanel.querySelector("[data-invite-result]");
        const loadTeam=async()=>{
          teamStatus.textContent="A carregar equipe…";
          const result=await workspace.getMembers({tenantId:tenant.tenantId});
          teamList.replaceChildren();
          const heading=document.createElement("h3");heading.textContent="Membros";teamList.append(heading);
          (result.members||[]).forEach(member=>{
            const row=document.createElement("div");row.className="firebase-management-row";
            const info=document.createElement("div");
            const name=document.createElement("strong");name.textContent=member.displayName||member.email||"Membro";
            const detail=document.createElement("span");detail.textContent=(member.email||"")+" · "+member.role+" · "+(member.status==="active"?"Ativo":"Suspenso");
            info.append(name,detail);row.append(info);
            if(member.role!=="owner" && !(tenant.role==="admin" && member.role==="admin")){
              const controls=document.createElement("div");controls.className="firebase-management-row-actions";
              const role=document.createElement("select");role.setAttribute("aria-label","Permissão de "+(member.email||"membro"));
              role.innerHTML='<option value="staff">Equipe</option>'+(tenant.role==="owner"?'<option value="admin">Administrador</option>':"");
              role.value=member.role==="admin"&&tenant.role==="owner"?"admin":"staff";
              const status=document.createElement("select");status.setAttribute("aria-label","Estado de "+(member.email||"membro"));
              status.innerHTML='<option value="active">Ativo</option><option value="suspended">Suspenso</option>';status.value=member.status==="suspended"?"suspended":"active";
              const save=document.createElement("button");save.type="button";save.className="secondary-btn";save.textContent="Guardar acesso";
              save.addEventListener("click",async()=>{save.disabled=true;teamStatus.textContent="A atualizar acesso…";try{await workspace.updateMember({tenantId:tenant.tenantId,memberUid:member.uid,role:role.value,status:status.value});await loadTeam();teamStatus.textContent="Acesso atualizado.";}catch(error){teamStatus.textContent="Não foi possível atualizar: "+(error.message||"erro desconhecido");save.disabled=false;}});
              controls.append(role,status,save);row.append(controls);
            }
            teamList.append(row);
          });
          const inviteHeading=document.createElement("h3");inviteHeading.textContent="Convites pendentes";teamList.append(inviteHeading);
          if(!(result.invitations||[]).length){const empty=document.createElement("p");empty.textContent="Não há convites pendentes.";teamList.append(empty);}
          (result.invitations||[]).forEach(invite=>{const row=document.createElement("div");row.className="firebase-management-row";const info=document.createElement("span");info.textContent=invite.email+" · "+invite.role+" · expira "+(invite.expiresAtMs?new Date(invite.expiresAtMs).toLocaleDateString("pt-BR"):"—");row.append(info);teamList.append(row);});
          teamStatus.textContent="Equipe atualizada.";
        };
        inviteForm.addEventListener("submit",async event=>{
          event.preventDefault();const button=inviteForm.querySelector('button[type="submit"]');button.disabled=true;teamStatus.textContent="A criar convite…";inviteResult.hidden=true;inviteResult.replaceChildren();
          try{
            const values=new FormData(inviteForm);
            const result=await workspace.inviteMember({tenantId:tenant.tenantId,email:String(values.get("email")||""),role:String(values.get("role")||"staff")});
            const link=new URL(window.location.href);link.search="";link.searchParams.set("tenantId",tenant.tenantId);link.searchParams.set("invite",result.invitationToken);
            const label=document.createElement("strong");label.textContent="Convite criado · entrega manual";
            const explanation=document.createElement("p");explanation.textContent="Envie este link somente para "+String(values.get("email")||"")+" antes de "+new Date(result.expiresAtMs).toLocaleString("pt-BR")+". O token é mostrado apenas agora.";
            const input=document.createElement("input");input.type="text";input.readOnly=true;input.value=link.toString();input.setAttribute("aria-label","Link do convite");
            const copy=document.createElement("button");copy.type="button";copy.className="secondary-btn";copy.textContent="Copiar link";copy.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(input.value);copy.textContent="Link copiado";}catch{input.select();teamStatus.textContent="Selecione e copie o link manualmente."; }});
            inviteResult.append(label,explanation,input,copy);inviteResult.hidden=false;inviteForm.reset();await loadTeam();teamStatus.textContent="Convite criado. Faça a entrega manual do link.";
          }catch(error){teamStatus.textContent="Não foi possível criar o convite: "+(error.message||"erro desconhecido");}
          finally{button.disabled=false;}
        });
        try{await loadTeam();}catch(error){teamStatus.textContent="Não foi possível carregar a equipe: "+(error.message||"erro desconhecido");}
      }

      if (typeof workspace?.getClients === "function" && typeof workspace?.saveClient === "function") {
        const panel=document.createElement("section");
        panel.className="firebase-readonly-section firebase-client-management";
        panel.innerHTML='<h2>Clientes</h2><p>Contactos guardados de forma privada dentro desta empresa. Apenas membros autorizados podem consultar estes dados.</p><div class="firebase-client-status" role="status">A carregar clientes…</div><div class="firebase-client-list"></div><form class="firebase-client-form"><h3>Novo cliente</h3><input type="hidden" name="clientId"><label>Nome<input name="name" minlength="2" maxlength="100" required></label><label>E-mail<input name="email" type="email" maxlength="254"></label><label>Telefone<input name="phone" type="tel" maxlength="40"></label><label>Observações<textarea name="notes" maxlength="500" rows="2"></textarea></label><div class="firebase-client-actions"><button class="primary-btn" type="submit">Guardar cliente</button><button class="secondary-btn" type="button" data-client-reset>Limpar</button></div></form>';
        data.append(panel);
        const clientStatus=panel.querySelector(".firebase-client-status");
        const clientList=panel.querySelector(".firebase-client-list");
        const clientForm=panel.querySelector(".firebase-client-form");
        const resetClient=()=>{clientForm.reset();clientForm.elements.clientId.value="";panel.querySelector("h3").textContent="Novo cliente";};
        const loadClients=async()=>{
          clientStatus.textContent="A carregar clientes…";
          const result=await workspace.getClients({tenantId:tenant.tenantId});
          clientList.replaceChildren();
          const clients=result.clients||[];
          if(!clients.length){const empty=document.createElement("p");empty.className="firebase-readonly-empty";empty.textContent="Ainda não há clientes cadastrados.";clientList.append(empty);}
          clients.forEach(client=>{
            const row=document.createElement("div");row.className="firebase-client-row";
            const info=document.createElement("div");const name=document.createElement("strong");name.textContent=client.name;
            const contact=document.createElement("span");contact.textContent=[client.email,client.phone].filter(Boolean).join(" · ")||"Sem contacto";
            const note=document.createElement("small");note.textContent=client.notes||"";
            info.append(name,contact,note);
            const actions=document.createElement("div");actions.className="firebase-client-row-actions";
            const edit=document.createElement("button");edit.type="button";edit.className="secondary-btn";edit.textContent="Editar";
            edit.addEventListener("click",()=>{clientForm.elements.clientId.value=client.id;clientForm.elements.name.value=client.name||"";clientForm.elements.email.value=client.email||"";clientForm.elements.phone.value=client.phone||"";clientForm.elements.notes.value=client.notes||"";panel.querySelector("h3").textContent="Editar cliente";clientForm.scrollIntoView({behavior:"smooth",block:"center"});});
            actions.append(edit);
            if(client.status==="active"){
              const deactivate=document.createElement("button");deactivate.type="button";deactivate.className="secondary-btn";deactivate.textContent="Desativar";
              deactivate.addEventListener("click",async()=>{deactivate.disabled=true;try{await workspace.saveClient({tenantId:tenant.tenantId,clientId:client.id,name:client.name,email:client.email,phone:client.phone,notes:client.notes,active:false});await loadClients();clientStatus.textContent="Cliente desativado."; }catch(error){clientStatus.textContent="Não foi possível desativar: "+(error.message||"erro desconhecido");deactivate.disabled=false;}});
              actions.append(deactivate);
            }
            row.append(info,actions);clientList.append(row);
          });
          clientStatus.textContent=(clients.length?"Clientes carregados: "+clients.length+". ":"Nenhum cliente cadastrado.")+(result.truncated?" A lista está limitada aos 200 registos mais recentes.":"");
        };
        clientForm.addEventListener("submit",async event=>{
          event.preventDefault();const button=clientForm.querySelector('button[type="submit"]');button.disabled=true;clientStatus.textContent="A guardar cliente…";
          const values=new FormData(clientForm);
          try{
            await workspace.saveClient({tenantId:tenant.tenantId,clientId:String(values.get("clientId")||""),name:String(values.get("name")||""),email:String(values.get("email")||""),phone:String(values.get("phone")||""),notes:String(values.get("notes")||""),active:true});
            resetClient();await loadClients();clientStatus.textContent="Cliente guardado com sucesso.";
          }catch(error){clientStatus.textContent="Não foi possível guardar: "+(error.message||"erro desconhecido");}
          finally{button.disabled=false;}
        });
        panel.querySelector("[data-client-reset]").addEventListener("click",resetClient);
        try{await loadClients();}catch(error){clientStatus.textContent="Não foi possível carregar clientes: "+(error.message||"erro desconhecido");}
      }
      state.textContent="Dados carregados do Firebase. Ações disponíveis conforme as permissões da sua conta.";
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
  const clientStyle=document.createElement("style");
  clientStyle.textContent='.firebase-client-management>p{color:#64748b}.firebase-client-list{display:grid;grid-template-columns:1fr 1fr;gap:10px}.firebase-client-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px;border:1px solid #e5e7eb;border-radius:10px}.firebase-client-row strong,.firebase-client-row span,.firebase-client-row small{display:block}.firebase-client-row span,.firebase-client-row small{font-size:12px;color:#64748b;margin-top:4px;overflow-wrap:anywhere}.firebase-client-row-actions,.firebase-client-actions{display:flex;gap:8px;flex-wrap:wrap}.firebase-client-status{padding:10px 12px;background:#f1f5f9;border-radius:9px;margin:12px 0;color:#334155;font-size:13px}.firebase-client-form{border-top:1px solid #e5e7eb;margin-top:18px;padding-top:18px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.firebase-client-form h3,.firebase-client-form label:nth-of-type(4),.firebase-client-actions{grid-column:1/-1}.firebase-client-form label{display:grid;gap:6px;font-size:13px;color:#475569}.firebase-client-form input,.firebase-client-form textarea{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:var(--card,#fff);color:inherit}.firebase-client-management button:disabled{opacity:.55;cursor:wait}@media(max-width:700px){.firebase-client-list,.firebase-client-form{grid-template-columns:1fr}.firebase-client-row{align-items:flex-start;flex-direction:column}}';
  document.head.append(clientStyle);
  const scheduleStyle=document.createElement("style");
  scheduleStyle.textContent='.schedule-days{grid-column:1/-1;display:grid;gap:8px}.schedule-day-row{display:grid;grid-template-columns:minmax(150px,1.4fr) 1fr 1fr;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid #e5e7eb}.schedule-day-row label{display:flex;align-items:center;gap:8px;font-size:13px;color:#475569}.schedule-day-row input[type=time]{min-width:0;width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:8px;background:var(--card,#fff);color:inherit}.schedule-day-enabled input{width:auto}.schedule-current{margin-top:18px}.schedule-current h3{font-size:15px}@media(max-width:700px){.schedule-day-row{grid-template-columns:1fr 1fr}.schedule-day-enabled{grid-column:1/-1}}';
  const teamStyle=document.createElement("style");
  teamStyle.textContent='.firebase-team-management [data-invite-result]{margin-top:16px;padding:14px;border:1px solid #cbd5e1;border-radius:10px;overflow-wrap:anywhere}.firebase-team-management [data-invite-result] p{font-size:13px;color:#64748b}.firebase-team-management [data-invite-result] input{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;margin:8px 0}.firebase-team-management [data-team-list]>h3{font-size:15px;margin:18px 0 8px}.firebase-team-management select{padding:8px;border:1px solid #cbd5e1;border-radius:8px;background:var(--card,#fff);color:inherit}';
  document.head.append(managementStyle);
  document.head.append(style);
  window.BookingFirebaseDashboardView=Object.freeze({mount});
})();
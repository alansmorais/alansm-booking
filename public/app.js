const availability=window.BookingAvailability;
const today=new Date();
const isoDate=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const addDays=(date,n)=>{const d=new Date(date+"T12:00:00");d.setDate(d.getDate()+n);return isoDate(d);};
const state={view:"overview",query:"",weekOffset:0,calendarProfessional:"Todos",appointments:[
{date:isoDate(today),time:"09:00",duration:30,name:"Lucas Ferreira",service:"Corte masculino",professional:"Rafael Costa",status:"Confirmado"},
{date:isoDate(today),time:"10:30",duration:60,name:"Mariana Alves",service:"Corte + barba",professional:"Rafael Costa",status:"Confirmado"},
{date:isoDate(today),time:"11:00",duration:40,name:"Pedro Santos",service:"Degradê",professional:"Bruno Lima",status:"Pendente"},
{date:isoDate(today),time:"14:30",duration:20,name:"Camila Rocha",service:"Sobrancelha",professional:"Ana Martins",status:"Confirmado"},
{date:addDays(isoDate(today),1),time:"09:30",duration:30,name:"João Mendes",service:"Corte masculino",professional:"Rafael Costa",status:"Confirmado"},
{date:addDays(isoDate(today),2),time:"10:00",duration:60,name:"Beatriz Lima",service:"Corte + barba",professional:"Bruno Lima",status:"Confirmado"}],
blocks:[{date:addDays(isoDate(today),1),start:"12:00",end:"14:00",professional:"Bruno Lima",label:"Compromisso externo"}],
companySchedule:{0:[],1:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],2:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],3:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],4:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],5:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],6:[{start:"09:00",end:"14:00",breaks:[]}]},
professionalSchedules:{"Rafael Costa":{0:[],1:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],2:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],3:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],4:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],5:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],6:[{start:"09:00",end:"14:00",breaks:[]}]},"Bruno Lima":{0:[],1:[{start:"10:00",end:"18:00",breaks:[{start:"13:00",end:"14:00"}]}],2:[{start:"10:00",end:"18:00",breaks:[{start:"13:00",end:"14:00"}]}],3:[{start:"10:00",end:"18:00",breaks:[{start:"13:00",end:"14:00"}]}],4:[{start:"10:00",end:"18:00",breaks:[{start:"13:00",end:"14:00"}]}],5:[{start:"10:00",end:"18:00",breaks:[{start:"13:00",end:"14:00"}]}],6:[]},"Ana Martins":{0:[],1:[{start:"09:00",end:"16:00",breaks:[]}],2:[{start:"09:00",end:"16:00",breaks:[]}],3:[{start:"09:00",end:"16:00",breaks:[]}],4:[{start:"09:00",end:"16:00",breaks:[]}],5:[{start:"09:00",end:"16:00",breaks:[]}],6:[{start:"09:00",end:"14:00",breaks:[]}]}},exceptions:[],professionalExceptions:[],
professionals:[["Rafael Costa","Barbeiro","12 agendamentos","Ativo"],["Bruno Lima","Barbeiro","8 agendamentos","Ativo"],["Ana Martins","Designer","6 agendamentos","Ativo"]],
services:[["Corte masculino",30,"R$ 45,00","Ativo"],["Corte + barba",60,"R$ 75,00","Ativo"],["Degradê",40,"R$ 55,00","Ativo"],["Sobrancelha",20,"R$ 25,00","Ativo"]],
clients:[["Lucas Ferreira","(11) 99999-1234","8 visitas"],["Mariana Alves","(11) 98888-2345","5 visitas"],["Pedro Santos","(11) 97777-3456","3 visitas"],["Camila Rocha","(11) 96666-4567","2 visitas"]]};

// Persistência temporária apenas para esta demonstração neste navegador.
const DEMO_STORAGE_KEY="alansm-booking-demo-v1";
const DEMO_PERSISTED_KEYS=["appointments","blocks","companySchedule","professionalSchedules","exceptions","professionalExceptions","professionals","services","clients"];
let demoStorageAvailable=true;
function restoreDemoState(){
 try{
  const raw=localStorage.getItem(DEMO_STORAGE_KEY);
  if(!raw)return;
  const saved=JSON.parse(raw);
  if(!saved||saved.version!==1||!saved.data||typeof saved.data!=="object")return;
  DEMO_PERSISTED_KEYS.forEach(key=>{
   const value=saved.data[key];
   if(value===undefined)return;
   const expected=Array.isArray(state[key])?"array":typeof state[key];
   if((expected==="array"&&Array.isArray(value))||(expected==="object"&&value&&typeof value==="object"&&!Array.isArray(value)))state[key]=value;
  });
 }catch(error){demoStorageAvailable=false;console.warn("Não foi possível recuperar a demonstração local.",error);}
}
function persistDemoState(){
 try{
  const data={};
  DEMO_PERSISTED_KEYS.forEach(key=>{data[key]=state[key];});
  localStorage.setItem(DEMO_STORAGE_KEY,JSON.stringify({version:1,savedAt:new Date().toISOString(),data}));
  demoStorageAvailable=true;
 }catch(error){demoStorageAvailable=false;console.warn("Não foi possível guardar a demonstração local.",error);toast("O navegador não conseguiu guardar os dados desta demonstração.");}
}
restoreDemoState();
const dataAdapter=window.BookingData.createDemoAdapter(state);
const workspaceAdapter=window.BookingWorkspace.createDemoWorkspaceAdapter({authAdapter:window.BookingAuth.createDemoAdapter(),dataAdapter});
let activeWorkspaceName="Barbearia Modelo";
let firebaseWorkspaceAdapter=null;
let firebaseWorkspaceSession=null;
let firebaseCatalog=null;
let firebaseLoadVersion=0;
let firebaseMode=false;
const workspaceSelect=document.getElementById("workspaceSelect");
const workspaceName=document.getElementById("workspaceName");
const workspaceRole=document.getElementById("workspaceRole");
const initialWorkspaceSession=workspaceAdapter.getSession();
(initialWorkspaceSession.tenants||[]).forEach(tenant=>{
 const option=document.createElement("option");
 option.value=tenant.id||tenant.tenantId;
 option.textContent=tenant.name;
 option.selected=option.value===(initialWorkspaceSession.selectedTenantId||option.value);
 workspaceSelect.appendChild(option);
});
const initialTenant=(initialWorkspaceSession.tenants||[]).find(tenant=>(tenant.id||tenant.tenantId)===workspaceSelect.value);
if(initialTenant){activeWorkspaceName=initialTenant.name;workspaceName.textContent=initialTenant.name;workspaceRole.textContent=initialTenant.role==="owner"?"Proprietário · Demonstração":"Acesso · Demonstração";}
workspaceSelect.addEventListener("change",async()=>{
 try{
  if(firebaseMode&&firebaseWorkspaceAdapter){
   const tenant=await firebaseWorkspaceAdapter.selectTenant(workspaceSelect.value);
   activeWorkspaceName=tenant.name;workspaceName.textContent=tenant.name;
   workspaceRole.textContent=(tenant.role==="owner"?"Proprietário":tenant.role==="admin"?"Administrador":"Equipa")+" · Firebase";
   firebaseCatalog=null;render();return;
  }
  const tenant=await workspaceAdapter.selectTenant(workspaceSelect.value);
  activeWorkspaceName=tenant.name;workspaceName.textContent=tenant.name;
  workspaceRole.textContent=(tenant.role==="owner"?"Proprietário":"Acesso")+" · Demonstração";
  render();toast("Espaço de trabalho alterado.");
 }catch(error){toast(error.message);workspaceSelect.value=workspaceAdapter.getSession().selectedTenantId||"";}
});
const titles={team:"Equipe e acessos",overview:"Visão geral",calendar:"Agenda semanal",appointments:"Agendamentos",professionals:"Profissionais",services:"Serviços",clients:"Clientes","public-page":"Página de reservas",settings:"Configurações"};
const content=document.getElementById("content");
const escapeHTML=value=>String(value??"").replace(/[&<>\"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
function heading(title,sub,action=""){return `<div class="page-heading"><div><div class="eyebrow">${escapeHTML(activeWorkspaceName)}</div><h1>${title}</h1><p>${sub}</p></div>${action}</div>`;}
function table(headers,rows){return `<div class="panel table-wrap"><table class="data-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join(""):`<tr><td colspan="${headers.length}" class="empty-state">Nenhum registo encontrado.</td></tr>`}</tbody></table></div>`;}
function overview(){return heading("Olá, Administrador 👋","Aqui está o resumo da sua operação.",'<button class="primary-btn" data-action="new-appointment">＋ Novo agendamento</button>')+`
<div class="stats-grid"><div class="stat-card"><div class="stat-top">Agendamentos na demonstração</div><div class="stat-value">${state.appointments.length}</div><div class="stat-foot">Registos fictícios desta sessão</div></div><div class="stat-card"><div class="stat-top">Profissionais</div><div class="stat-value">${state.professionals.length}</div><div class="stat-foot">Equipa de demonstração</div></div><div class="stat-card"><div class="stat-top">Serviços</div><div class="stat-value">${state.services.length}</div><div class="stat-foot">Com duração configurada</div></div><div class="stat-card"><div class="stat-top">Horário de funcionamento</div><div class="stat-value">09–18h</div><div class="stat-foot">Segunda a sexta · sábado até 14h</div></div></div>
<div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><h2>Próximos agendamentos</h2><p>Registos locais da demonstração</p></div><button class="text-link" data-view="calendar">Ver agenda →</button></div><div class="appointment-list">${state.appointments.slice().sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).slice(0,5).map(a=>`<div class="appointment"><span class="time">${escapeHTML(a.time)}</span><span class="client-avatar">${escapeHTML(a.name.split(" ").map(x=>x[0]).slice(0,2).join(""))}</span><span class="client-info"><strong>${escapeHTML(a.name)}</strong><small>${escapeHTML(a.service)} · ${escapeHTML(a.professional)}</small></span><span class="status">${escapeHTML(a.status)}</span></div>`).join("")}</div></section><section class="panel"><div class="panel-heading"><div><h2>Regras da agenda</h2><p>Configuração de demonstração</p></div></div><div class="schedule-rules"><p><strong>Seg–Sex</strong><span>09:00–18:00</span></p><p><strong>Intervalo</strong><span>12:00–13:00</span></p><p><strong>Sábado</strong><span>09:00–14:00</span></p><p><strong>Domingo</strong><span>Fechado</span></p></div></section></div><section class="panel settings-card schedule-editor"><div class="panel-heading"><div><h2>Férias, folgas e ausências</h2><p>Bloqueie a agenda de um profissional por uma data ou intervalo.</p></div></div><form id="professionalExceptionForm" class="exception-form"><label>Profissional <select name="professional">${state.professionals.map(p=>`<option>${escapeHTML(p[0])}</option>`).join("")}</select></label><label>De <input type="date" name="date" required></label><label>Até <input type="date" name="endDate"></label><label>Motivo <input name="label" maxlength="60" placeholder="Ex.: Férias / folga" required></label><button class="secondary-btn" type="submit">Adicionar ausência</button></form>${state.professionalExceptions.map((x,i)=>`<div class="setting-row"><div><strong>${escapeHTML(x.professional)} · ${escapeHTML(x.date.split("-").reverse().join("/"))}${x.endDate&&x.endDate!==x.date?" até "+escapeHTML(x.endDate.split("-").reverse().join("/")):""}</strong><small>${escapeHTML(x.label)}</small></div><button class="secondary-btn" data-action="remove-prof-exception" data-index="${i}">Remover</button></div>`).join("")||'<p class="empty-state">Nenhuma ausência individual cadastrada.</p>'}</section><div class="demo-banner">ⓘ Demonstração local: dados fictícios guardados apenas neste navegador. Não são reservas reais nem ficam sincronizados entre dispositivos.</div>`;}
function calendar(){const scheduleData=workspaceAdapter.getSchedule(),agenda=workspaceAdapter.getAgenda();const anchor=addDays(isoDate(today),state.weekOffset*7),dates=availability.weekDates(anchor),labels=["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"],fmt=d=>new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});const people=state.professionals.map(p=>p[0]),filter=state.calendarProfessional;const columns=dates.map((date,i)=>{const day=new Date(date+"T12:00:00").getDay(),hours=scheduleData.companySchedule[day]?.[0],items=agenda.filter(a=>a.date===date&&(filter==="Todos"||a.professional===filter)),blocked=scheduleData.blocks.filter(b=>b.date===date&&(filter==="Todos"||!b.professional||b.professional===filter));return `<div class="week-day ${!hours?"closed":""}"><div class="week-day-head"><strong>${labels[i]}</strong><span>${fmt(date)}</span></div>${!hours?'<div class="day-closed">Fechado</div>':`<div class="day-hours">${hours.start} – ${hours.end}</div>${items.length?items.sort((a,b)=>a.time.localeCompare(b.time)).map(a=>`<div class="calendar-event ${a.status==="Pendente"?"event-pending":""}"><strong>${escapeHTML(a.time)} · ${escapeHTML(a.name)}</strong><small>${escapeHTML(a.service)}<br>${escapeHTML(a.professional)} · ${a.duration} min</small></div>`).join(""):'<div class="day-empty">Sem reservas</div>'}${blocked.map(b=>`<div class="calendar-block"><strong>${escapeHTML(b.start)}–${escapeHTML(b.end)}</strong><small>${escapeHTML(b.label)}</small></div>`).join("")}`}</div>`;}).join("");return heading("Agenda semanal","Visualize horários, reservas e bloqueios da equipa.",'<button class="primary-btn" data-action="new-appointment">＋ Novo agendamento</button>')+`<div class="calendar-toolbar"><div class="toolbar"><button class="secondary-btn" data-action="week-prev">← Anterior</button><button class="secondary-btn" data-action="week-current">Esta semana</button><button class="secondary-btn" data-action="week-next">Próxima →</button></div><label class="filter-label">Profissional <select id="calendarProfessional"><option>Todos</option>${people.map(p=>`<option ${p===filter?"selected":""}>${escapeHTML(p)}</option>`).join("")}</select></label></div><div class="week-grid">${columns}</div><div class="schedule-legend"><span><i></i> Confirmado</span><span><i class="pending-dot"></i> Pendente</span><span><i class="blocked-dot"></i> Bloqueio</span></div><div class="demo-banner">Os horários são calculados com base no funcionamento, intervalos, duração, bloqueios e reservas. Alterações ficam guardadas apenas neste navegador.</div>`;}
function appointments(){const rows=workspaceAdapter.getAgenda().filter(a=>(a.name+" "+a.service+" "+a.professional).toLowerCase().includes(state.query.toLowerCase())).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).map(a=>[`<strong>${escapeHTML(a.date.split("-").reverse().join("/"))} ${escapeHTML(a.time)}</strong>`,escapeHTML(a.name),escapeHTML(a.service),escapeHTML(a.professional),`<span class="status ${a.status==="Pendente"?"pending":""}">${escapeHTML(a.status)}</span>`]);return heading("Agendamentos","Acompanhe e organize os horários da sua equipa.",'<button class="primary-btn" data-action="new-appointment">＋ Novo agendamento</button>')+`<div class="toolbar"><input class="search-input" id="search" placeholder="Pesquisar cliente ou serviço..." value="${escapeHTML(state.query)}"><button class="secondary-btn" data-view="calendar">Abrir agenda semanal</button></div>${table(["DATA / HORÁRIO","CLIENTE","SERVIÇO","PROFISSIONAL","ESTADO"],rows)}`;}
function professionals(){const catalog=workspaceAdapter.getCatalog();return heading("Profissionais","Gerencie os membros da equipa e a disponibilidade.")+table(["PROFISSIONAL","FUNÇÃO","AGENDA","ESTADO"],catalog.professionals.map(p=>[`<strong>${escapeHTML(p[0])}</strong>`,escapeHTML(p[1]),escapeHTML(p[2]),`<span class="status">${escapeHTML(p[3])}</span>`]));}
function services(){const catalog=workspaceAdapter.getCatalog();return heading("Serviços","Duração usada para calcular os horários disponíveis.")+table(["SERVIÇO","DURAÇÃO","PREÇO","ESTADO"],catalog.services.map(s=>[`<strong>${escapeHTML(s[0])}</strong>`,s[1]+" min",`<span class="service-price">${escapeHTML(s[2])}</span>`,`<span class="status">${escapeHTML(s[3])}</span>`]));}
function clients(){return heading("Clientes","Consulte a base de clientes de demonstração.")+`<div class="toolbar"><input class="search-input" id="search" placeholder="Pesquisar clientes..." value="${escapeHTML(state.query)}"></div>`+table(["CLIENTE","TELEFONE","HISTÓRICO"],state.clients.filter(c=>c.join(" ").toLowerCase().includes(state.query.toLowerCase())).map(c=>[`<strong>${escapeHTML(c[0])}</strong>`,escapeHTML(c[1]),escapeHTML(c[2])]));}
function publicPage(){return heading("Página de reservas","O endereço público ainda não foi publicado.")+`<section class="panel settings-card"><div class="panel-heading"><div><h2>Link público da barbearia</h2><p>Disponível após a implementação e validação do backend.</p></div><span class="status pending">Não publicado</span></div><div class="setting-row"><div><strong>Endereço da página</strong><small>Link ainda não disponível</small></div><button class="secondary-btn" disabled>Indisponível</button></div></section><div class="demo-banner">Esta demonstração não recebe nem envia reservas reais.</div>`;}
function professionalScheduleEditor(){
 const names=state.professionals.map(p=>p[0]),days=[["Segunda-feira",1],["Terça-feira",2],["Quarta-feira",3],["Quinta-feira",4],["Sexta-feira",5],["Sábado",6],["Domingo",0]],person=names[0];
 const fields=days.map(([label,d])=>{const ps=state.professionalSchedules[person]?.[d]||[],p=ps[0],q=ps[1];return '<div class="multi-period-row"><strong>'+label+'</strong><label><input type="checkbox" name="open-'+d+'" '+(p?'checked':'')+'> Trabalha</label><div class="period-fields"><span>Período 1</span><input type="time" name="start-'+d+'" value="'+(p?.start||'09:00')+'"><span>até</span><input type="time" name="end-'+d+'" value="'+(p?.end||'18:00')+'"><span>pausa</span><input type="time" name="break-start-'+d+'" value="'+(p?.breaks?.[0]?.start||'')+'"><span>até</span><input type="time" name="break-end-'+d+'" value="'+(p?.breaks?.[0]?.end||'')+'"></div><div class="period-fields"><span>Período 2</span><input type="time" name="start2-'+d+'" value="'+(q?.start||'')+'"><span>até</span><input type="time" name="end2-'+d+'" value="'+(q?.end||'')+'"></div></div>';}).join('');
 return '<section class="panel settings-card schedule-editor"><div class="panel-heading"><div><h2>Horários individuais</h2><p>Configure até dois períodos de trabalho por dia para cada profissional.</p></div></div><form id="professionalScheduleForm"><label class="schedule-person-label">Profissional <select name="professional">'+names.map(n=>'<option>'+escapeHTML(n)+'</option>').join('')+'</select></label>'+fields+'<div class="schedule-form-footer"><small>Os períodos devem estar dentro do horário da empresa e não podem sobrepor-se.</small><button class="primary-btn" type="submit">Guardar horário do profissional</button></div></form><div class="professional-schedule-summary">'+names.map(n=>'<div class="professional-schedule-row"><strong>'+escapeHTML(n)+'</strong><span>'+days.map(([label,d])=>label+': '+((state.professionalSchedules[n]?.[d]||[]).map(p=>p.start+'–'+p.end).join(' / ')||'Fechado')).join(' · ')+'</span></div>').join('')+'</div></section>';
}
function settings(){const days=["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];return heading("Horários e funcionamento","Configure os horários da empresa e a disponibilidade individual da equipa.")+`<section class="panel settings-card schedule-editor"><div class="panel-heading"><div><h2>Funcionamento da empresa</h2><p>O horário da empresa é o limite máximo para qualquer reserva.</p></div><span class="status">Editável</span></div><form id="companyScheduleForm">${days.map((d,i)=>{const ps=state.companySchedule[i]||[],p=ps[0],q=ps[1];return `<div class="multi-period-row"><strong>${d}</strong><label><input type="checkbox" name="open-${i}" ${p?"checked":""}> Aberto</label><div class="period-fields"><span>Período 1</span><input type="time" name="start-${i}" value="${p?.start||"09:00"}"><span>até</span><input type="time" name="end-${i}" value="${p?.end||"18:00"}"><span>pausa</span><input type="time" name="break-start-${i}" value="${p?.breaks?.[0]?.start||""}"><span>até</span><input type="time" name="break-end-${i}" value="${p?.breaks?.[0]?.end||""}"></div><div class="period-fields"><span>Período 2</span><input type="time" name="start2-${i}" value="${q?.start||""}"><span>até</span><input type="time" name="end2-${i}" value="${q?.end||""}"></div></div>`}).join("")}<div class="schedule-form-footer"><small>Desmarque o dia para fechar a empresa. O intervalo é opcional.</small><button class="primary-btn" type="submit">Guardar horário da empresa</button></div></form></section>'+professionalScheduleEditor()+'<section class="panel settings-card schedule-editor"><div class="panel-heading"><div><h2>Feriados e exceções</h2><p>Datas em que a empresa estará fechada.</p></div></div><form id="exceptionForm" class="exception-form"><label>Data <input type="date" name="date" required></label><label>Motivo <input name="label" maxlength="60" placeholder="Ex.: Feriado / férias coletivas" required></label><button class="secondary-btn" type="submit">Adicionar dia fechado</button></form>${state.exceptions.map((x,i)=>`<div class="setting-row"><div><strong>${escapeHTML(x.date.split("-").reverse().join("/"))}</strong><small>${escapeHTML(x.label)}</small></div><button class="secondary-btn" data-action="remove-exception" data-index="${i}">Remover</button></div>`).join("")||'<p class="empty-state">Nenhuma exceção cadastrada.</p>'}</section><div class="demo-banner">Configurações guardadas localmente neste navegador. Ainda não são enviadas ao Google Sheets nem sincronizadas com outros dispositivos.</div>`}
function renderFirebaseView(){
 const version=++firebaseLoadVersion,tenantId=firebaseWorkspaceAdapter?.getSelectedTenantId();
 document.getElementById("breadcrumbTitle").textContent=titles[state.view]||"Visão geral";
 document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===state.view));
 if(!tenantId){content.innerHTML=heading("Selecione uma empresa","Escolha um espaço de trabalho para carregar os dados.")+'<div class="panel settings-card">Esta conta tem mais de uma empresa. Selecione uma no menu lateral.</div>';return;}
 content.innerHTML=heading("A carregar dados...","A consultar o espaço de trabalho selecionado.")+'<div class="panel settings-card">A carregar informações do Firebase...</div>';
 (async()=>{
  try{
   const [catalog,agendaResult,scheduleSettings]=await Promise.all([
    firebaseCatalog?Promise.resolve(firebaseCatalog):firebaseWorkspaceAdapter.getCatalog({tenantId}),
    firebaseWorkspaceAdapter.getAgenda({tenantId,startAtMs:Date.now()-7*86400000,endAtMs:Date.now()+24*86400000}),
    (state.view==="settings"||state.view==="calendar")?firebaseWorkspaceAdapter.getScheduleSettings({tenantId}).catch(()=>null):Promise.resolve(null)
   ]);
   if(version!==firebaseLoadVersion)return;
   firebaseCatalog=catalog;
   const pros=Array.isArray(catalog.professionals)?catalog.professionals:[];
   const services=Array.isArray(catalog.services)?catalog.services:[];
   const proName=id=>pros.find(p=>p.id===id)?.name||"Profissional";
   const serviceName=id=>services.find(s=>s.id===id)?.name||"Serviço";
   const items=Array.isArray(agendaResult.appointments)?agendaResult.appointments:[];
   let clients=[];
   if(state.view==="clients"||state.view==="calendar"||state.view==="appointments"){
    const clientResult=await firebaseWorkspaceAdapter.getClients({tenantId}).catch(()=>({clients:[]}));
    clients=Array.isArray(clientResult.clients)?clientResult.clients:[];
   }
   const money=(minor,currency)=>Number.isSafeInteger(minor)?new Intl.NumberFormat("pt-BR",{style:"currency",currency:currency||"BRL"}).format(minor/100):"—";
   const dateTime=a=>new Date(a.startAtMs).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
   const statusLabel={booked:"Reservado",confirmed:"Confirmado",pending:"Pendente",cancelled:"Cancelado",completed:"Concluído",no_show:"Não compareceu"};
   const rowItems=items.slice().sort((a,b)=>a.startAtMs-b.startAtMs).map(a=>{
     const isTerminal=["cancelled","completed","no_show"].includes(a.status);
     const cName = a.clientName || (a.clientId?"Cliente · "+a.clientId.slice(0,7):"Cliente não identificado");
     return [
       "<strong>"+escapeHTML(dateTime(a))+"</strong>",
       escapeHTML(cName),
       escapeHTML(serviceName(a.serviceId)),escapeHTML(proName(a.professionalId)),
       '<span class="status '+(a.status==="cancelled"?"cancelled":a.status==="pending"?"pending":"")+'">'+escapeHTML(statusLabel[a.status]||a.status)+'</span>',
       isTerminal ? '<small style="color:#8a94a5;">Finalizado</small>' :
         ('<button class="secondary-btn" style="padding:4px 8px;font-size:10px;" data-action="update-appointment-status" data-id="'+escapeHTML(a.id)+'" data-status="completed">Concluir</button> '+
          '<button class="secondary-btn" style="padding:4px 8px;font-size:10px;" data-action="update-appointment-status" data-id="'+escapeHTML(a.id)+'" data-status="no_show">Não compareceu</button> '+
          '<button class="secondary-btn" style="padding:4px 8px;font-size:10px;" data-action="cancel-firebase-appointment" data-id="'+escapeHTML(a.id)+'">Cancelar</button>')
     ];
   });
   const tableHtml=(headers,rows)=>'<div class="panel table-wrap"><table class="data-table"><thead><tr>'+headers.map(h=>"<th>"+h+"</th>").join("")+'</tr></thead><tbody>'+(rows.length?rows.map(r=>"<tr>"+r.map(c=>"<td>"+c+"</td>").join("")+"</tr>").join(""):'<tr><td colspan="'+headers.length+'" class="empty-state">Nenhum registo encontrado.</td></tr>')+'</tbody></table></div>';
   const demoNotice='<div class="demo-banner">Dados carregados do Firebase Emulator. Nenhum dado fictício será exibido aqui. Esta integração é apenas local; nenhum projeto de produção está configurado.</div>';
   let body="";
   if(state.view==="overview"){
    body=heading("Visão geral","Resumo dos dados reais desta empresa.",'<button class="primary-btn" data-action="new-firebase-appointment">＋ Novo agendamento</button>')+
     '<div class="stats-grid"><div class="stat-card"><div class="stat-top">Agendamentos no período</div><div class="stat-value">'+items.length+'</div><div class="stat-foot">Consulta limitada a 31 dias</div></div><div class="stat-card"><div class="stat-top">Profissionais ativos</div><div class="stat-value">'+pros.length+'</div><div class="stat-foot">Catálogo da empresa</div></div><div class="stat-card"><div class="stat-top">Serviços ativos</div><div class="stat-value">'+services.length+'</div><div class="stat-foot">Catálogo da empresa</div></div></div>'+
     '<div class="panel settings-card"><h2>Agendamentos recentes</h2>'+tableHtml(["DATA / HORÁRIO","CLIENTE","SERVIÇO","PROFISSIONAL","ESTADO","AÇÕES"],rowItems.slice(0,8))+'</div>';
   }else if(state.view==="calendar"){
    const anchor=addDays(isoDate(today),state.weekOffset*7);
    const dates=availability.weekDates(anchor);
    const labels=["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
    const fmt=d=>new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});
    const people=pros.map(p=>p.name);
    const filter=state.calendarProfessional;
    const companySched=scheduleSettings?.companySchedule||{};
    const blocks=scheduleSettings?.blocks||[];
    const exceptions=scheduleSettings?.exceptions||[];

    const columns=dates.map((date,i)=>{
      const day=new Date(date+"T12:00:00").getDay();
      const hours=companySched[day]?.[0];
      const isClosedException=exceptions.some(x=>x.date===date);
      const isClosed=!hours||isClosedException;
      const dayAppts=items.filter(a=>{
        const dStr=isoDate(new Date(a.startAtMs));
        const pMatch=filter==="Todos"||proName(a.professionalId)===filter;
        return dStr===date&&pMatch;
      });
      const dayBlocks=blocks.filter(b=>{
        const pMatch=filter==="Todos"||!b.professionalId||pros.find(p=>p.id===b.professionalId)?.name===filter;
        return b.date===date&&pMatch;
      });

      return '<div class="week-day '+(isClosed?"closed":"")+'">'+
        '<div class="week-day-head"><strong>'+labels[i]+'</strong><span>'+fmt(date)+'</span></div>'+
        (isClosed?'<div class="day-closed">'+(isClosedException?"Fechado (exceção)":"Fechado")+'</div>':
          '<div class="day-hours">'+hours.start+' – '+hours.end+'</div>'+
          (dayAppts.length?dayAppts.sort((a,b)=>a.startAtMs-b.startAtMs).map(a=>{
            const timeStr=new Date(a.startAtMs).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
            const sName=serviceName(a.serviceId);
            const pName=proName(a.professionalId);
            const cName=a.clientName||"Cliente";
            return '<div class="calendar-event '+(a.status==="pending"?"event-pending":"")+'">'+
              '<strong>'+escapeHTML(timeStr)+' · '+escapeHTML(cName)+'</strong>'+
              '<small>'+escapeHTML(sName)+'<br>'+escapeHTML(pName)+' · '+escapeHTML(statusLabel[a.status]||a.status)+'</small>'+
              '<div style="margin-top:4px;display:flex;gap:4px;">'+
                (!["cancelled","completed","no_show"].includes(a.status)?
                  '<button class="secondary-btn" style="padding:2px 5px;font-size:8px;" data-action="update-appointment-status" data-id="'+escapeHTML(a.id)+'" data-status="completed">✓</button>'+
                  '<button class="secondary-btn" style="padding:2px 5px;font-size:8px;" data-action="cancel-firebase-appointment" data-id="'+escapeHTML(a.id)+'">✕</button>':
                  '') +
              '</div></div>';
          }).join(""): '<div class="day-empty">Sem reservas</div>')+
          dayBlocks.map(b=>'<div class="calendar-block"><strong>'+escapeHTML(b.start)+'–'+escapeHTML(b.end)+'</strong><small>'+escapeHTML(b.reason||"Bloqueio")+'</small></div>').join('')
        )+
      '</div>';
    }).join("");

    body=heading("Agenda semanal","Visualize horários, reservas e bloqueios da equipa.",'<button class="primary-btn" data-action="new-firebase-appointment">＋ Novo agendamento</button>')+
      '<div class="calendar-toolbar"><div class="toolbar">'+
      '<button class="secondary-btn" data-action="week-prev">← Anterior</button>'+
      '<button class="secondary-btn" data-action="week-current">Esta semana</button>'+
      '<button class="secondary-btn" data-action="week-next">Próxima →</button>'+
      '</div><label class="filter-label">Profissional <select id="calendarProfessional"><option>Todos</option>'+
      people.map(p=>'<option '+(p===filter?"selected":"")+'>'+escapeHTML(p)+'</option>').join("")+
      '</select></label></div><div class="week-grid">'+columns+'</div>'+
      '<div class="schedule-legend"><span><i></i> Confirmado</span><span><i class="pending-dot"></i> Pendente</span><span><i class="blocked-dot"></i> Bloqueio</span></div>';
   }else if(state.view==="appointments"){
    body=heading("Agendamentos","Registos devolvidos pelo backend da empresa.",'<button class="primary-btn" data-action="new-firebase-appointment">＋ Novo agendamento</button>')+
     '<div class="toolbar"><input class="search-input" id="search" placeholder="Pesquisar serviço ou profissional..." value="'+escapeHTML(state.query)+'"></div>'+
     tableHtml(["DATA / HORÁRIO","CLIENTE","SERVIÇO","PROFISSIONAL","ESTADO","AÇÕES"],rowItems.filter(r=>r.join(" ").toLowerCase().includes(state.query.toLowerCase())));
   }else if(state.view==="professionals"){
    body=heading("Profissionais","Cadastre, edite ou desative membros da equipa.")+
     '<div class="panel settings-card"><form id="firebaseProfessionalForm" class="form-grid"><input type="hidden" name="itemId"><label>Nome<input name="name" required minlength="2" maxlength="100"></label><label>Cor<input name="color" type="color" value="#336699"></label><button class="primary-btn" type="submit">Guardar profissional</button><button class="secondary-btn" type="button" data-action="clear-catalog-form">Limpar</button></form></div>'+
     tableHtml(["PROFISSIONAL","ESTADO","AÇÕES"],pros.map(p=>["<strong>"+escapeHTML(p.name)+"</strong>",'<span class="status">'+escapeHTML(p.status||"Ativo")+'</span>','<button class="secondary-btn" data-action="edit-catalog" data-kind="professional" data-id="'+escapeHTML(p.id)+'" data-name="'+escapeHTML(p.name)+'" data-color="'+escapeHTML(p.color||"#336699")+'">Editar</button> <button class="secondary-btn" data-action="deactivate-catalog" data-kind="professional" data-id="'+escapeHTML(p.id)+'">Desativar</button>']));
   }else if(state.view==="services"){
    body=heading("Serviços","Cadastre preços e duração, edite ou desative serviços.")+
     '<div class="panel settings-card"><form id="firebaseServiceForm" class="form-grid"><input type="hidden" name="itemId"><label>Nome<input name="name" required minlength="2" maxlength="100"></label><label>Duração (minutos)<input name="durationMinutes" type="number" min="5" max="480" step="5" value="30" required></label><label>Preço (unidades mínimas)<input name="priceMinor" type="number" min="0" step="1" value="5000" required></label><label>Moeda<input name="currency" value="PLN" minlength="3" maxlength="3" required></label><button class="primary-btn" type="submit">Guardar serviço</button><button class="secondary-btn" type="button" data-action="clear-catalog-form">Limpar</button></form><small>Exemplo: 5000 = 50,00 PLN.</small></div>'+
     tableHtml(["SERVIÇO","DURAÇÃO","PREÇO","ESTADO","AÇÕES"],services.map(s=>["<strong>"+escapeHTML(s.name)+"</strong>",(s.durationMinutes??"—")+" min",escapeHTML(money(s.priceMinor,s.currency)),'<span class="status">'+escapeHTML(s.status||"Ativo")+'</span>','<button class="secondary-btn" data-action="edit-catalog" data-kind="service" data-id="'+escapeHTML(s.id)+'" data-name="'+escapeHTML(s.name)+'" data-duration="'+escapeHTML(s.durationMinutes)+'" data-price="'+escapeHTML(s.priceMinor)+'" data-currency="'+escapeHTML(s.currency||"PLN")+'">Editar</button> <button class="secondary-btn" data-action="deactivate-catalog" data-kind="service" data-id="'+escapeHTML(s.id)+'">Desativar</button>']));
   }else if(state.view==="clients"){
    body=heading("Clientes","Dados de contacto privados da empresa, disponíveis apenas a membros autenticados.")+
     '<div class="panel settings-card"><form id="firebaseClientForm" class="form-grid"><input type="hidden" name="clientId"><label>Nome<input name="name" required minlength="2" maxlength="100"></label><label>Telefone<input name="phone" type="tel" maxlength="30"></label><label>E-mail<input name="email" type="email" maxlength="254"></label><label>Notas<textarea name="notes" maxlength="300"></textarea></label><button class="primary-btn" type="submit">Guardar cliente</button><button class="secondary-btn" type="button" data-action="clear-client-form">Limpar</button></form></div>'+
     '<div class="toolbar"><input class="search-input" id="search" placeholder="Pesquisar nome ou contacto..." value="'+escapeHTML(state.query)+'"></div>'+
     tableHtml(["CLIENTE","TELEFONE","E-MAIL","NOTAS","AÇÕES"],clients.filter(x=>(x.name+" "+x.phone+" "+x.email).toLowerCase().includes(state.query.toLowerCase())).map(x=>["<strong>"+escapeHTML(x.name)+"</strong>",escapeHTML(x.phone||"—"),escapeHTML(x.email||"—"),escapeHTML(x.notes||"—"),'<button class="secondary-btn" data-action="edit-client" data-id="'+escapeHTML(x.id)+'" data-name="'+escapeHTML(x.name)+'" data-phone="'+escapeHTML(x.phone||"")+'" data-email="'+escapeHTML(x.email||"")+'" data-notes="'+escapeHTML(x.notes||"")+'">Editar</button> <button class="secondary-btn" data-action="deactivate-client" data-id="'+escapeHTML(x.id)+'">Desativar</button>']));
   }else if(state.view==="team"){
    if(window.BookingTeam?.configureLive){
      window.BookingTeam.configureLive({ workspaceAdapter: firebaseWorkspaceAdapter, tenantId });
      body=window.BookingTeam.render();
      setTimeout(()=>window.BookingTeam.mount(),0);
    } else {
      body=heading("Equipe e acessos","Gestão de equipa.")+'<div class="panel settings-card">Módulo de equipa não carregado.</div>';
    }
   }else if(state.view==="settings"){
    const days=["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
    const compSched=scheduleSettings?.companySchedule||{};
    const exceptions=scheduleSettings?.exceptions||[];
    const proExceptions=scheduleSettings?.professionalExceptions||[];
    const blocks=scheduleSettings?.blocks||[];

    const companyFormHtml='<section class="panel settings-card schedule-editor"><div class="panel-heading"><div><h2>Funcionamento semanal da empresa</h2><p>Limite máximo para qualquer agendamento.</p></div></div><form id="firebaseCompanyScheduleForm">'+
      days.map((d,i)=>{
        const ps=compSched[i]||[];
        const p=ps[0],q=ps[1];
        return '<div class="multi-period-row"><strong>'+d+'</strong><label><input type="checkbox" name="open-'+i+'" '+(p?'checked':'')+'> Aberto</label>'+
          '<div class="period-fields"><span>Período 1</span><input type="time" name="start-'+i+'" value="'+(p?.start||'09:00')+'"><span>até</span><input type="time" name="end-'+i+'" value="'+(p?.end||'18:00')+'">'+
          '<span>pausa</span><input type="time" name="break-start-'+i+'" value="'+(p?.breaks?.[0]?.start||'')+'"><span>até</span><input type="time" name="break-end-'+i+'" value="'+(p?.breaks?.[0]?.end||'')+'"></div>'+
          '<div class="period-fields"><span>Período 2</span><input type="time" name="start2-'+i+'" value="'+(q?.start||'')+'"><span>até</span><input type="time" name="end2-'+i+'" value="'+(q?.end||'')+'"></div></div>';
      }).join('')+
      '<div class="schedule-form-footer"><small>Desmarque o dia para fechar. O intervalo é opcional.</small><button class="primary-btn" type="submit">Guardar horário da empresa</button></div></form></section>';

    const proFormHtml=pros.length?('<section class="panel settings-card schedule-editor"><div class="panel-heading"><div><h2>Horários individuais dos profissionais</h2><p>Defina horários específicos por profissional dentro do horário da empresa.</p></div></div><form id="firebaseProfessionalScheduleForm">'+
      '<label class="schedule-person-label">Profissional <select name="professionalId">'+pros.map(p=>'<option value="'+escapeHTML(p.id)+'">'+escapeHTML(p.name)+'</option>').join('')+'</select></label>'+
      days.map((d,i)=>{
        return '<div class="multi-period-row"><strong>'+d+'</strong><label><input type="checkbox" name="pro-open-'+i+'" checked> Trabalha</label>'+
          '<div class="period-fields"><span>Período 1</span><input type="time" name="pro-start-'+i+'" value="09:00"><span>até</span><input type="time" name="pro-end-'+i+'" value="18:00">'+
          '<span>pausa</span><input type="time" name="pro-break-start-'+i+'" value="12:00"><span>até</span><input type="time" name="pro-break-end-'+i+'" value="13:00"></div></div>';
      }).join('')+
      '<div class="schedule-form-footer"><button class="primary-btn" type="submit">Guardar horário do profissional</button></div></form></section>'):'';

    const closureHtml='<section class="panel settings-card schedule-editor"><div class="panel-heading"><div><h2>Feriados e fechamentos da empresa</h2><p>Datas em que toda a empresa estará fechada.</p></div></div><form id="firebaseCompanyExceptionForm" class="exception-form">'+
      '<label>Data de início <input type="date" name="startDate" required></label>'+
      '<label>Data de término <input type="date" name="endDate"></label>'+
      '<label>Motivo <input name="reason" maxlength="100" placeholder="Ex.: Feriado nacional / reforma" required></label>'+
      '<button class="secondary-btn" type="submit">Adicionar fechamento</button></form>'+
      (exceptions.map(x=>'<div class="setting-row"><div><strong>'+escapeHTML(x.date.split("-").reverse().join("/"))+'</strong><small>'+escapeHTML(x.reason)+'</small></div></div>').join('')||'<p class="empty-state">Nenhum feriado cadastrado.</p>')+
      '</section>';

    const proAbsenceHtml=pros.length?('<section class="panel settings-card schedule-editor"><div class="panel-heading"><div><h2>Férias e ausências de profissionais</h2><p>Bloqueie a agenda de um profissional por uma data ou período.</p></div></div><form id="firebaseProExceptionForm" class="exception-form">'+
      '<label>Profissional <select name="professionalId">'+pros.map(p=>'<option value="'+escapeHTML(p.id)+'">'+escapeHTML(p.name)+'</option>').join('')+'</select></label>'+
      '<label>De <input type="date" name="startDate" required></label>'+
      '<label>Até <input type="date" name="endDate"></label>'+
      '<label>Motivo <input name="reason" maxlength="100" placeholder="Ex.: Férias" required></label>'+
      '<button class="secondary-btn" type="submit">Adicionar ausência</button></form>'+
      (proExceptions.map(x=>'<div class="setting-row"><div><strong>'+escapeHTML(proName(x.professionalId))+' · '+escapeHTML(x.date.split("-").reverse().join("/"))+'</strong><small>'+escapeHTML(x.reason)+'</small></div></div>').join('')||'<p class="empty-state">Nenhuma ausência cadastrada.</p>')+
      '</section>'):'';

    const blocksHtml='<section class="panel settings-card schedule-editor"><div class="panel-heading"><div><h2>Bloqueios pontuais de horário</h2><p>Impeça reservas em intervalos de tempo específicos.</p></div></div><form id="firebaseBlockForm" class="exception-form">'+
      '<label>Data <input type="date" name="date" required></label>'+
      '<label>Início <input type="time" name="start" required></label>'+
      '<label>Término <input type="time" name="end" required></label>'+
      '<label>Profissional <select name="professionalId"><option value="">Toda a empresa</option>'+pros.map(p=>'<option value="'+escapeHTML(p.id)+'">'+escapeHTML(p.name)+'</option>').join('')+'</select></label>'+
      '<label>Motivo <input name="reason" maxlength="120" placeholder="Ex.: Reunião / almoço externo" required></label>'+
      '<button class="secondary-btn" type="submit">Adicionar bloqueio</button></form>'+
      (blocks.map(b=>'<div class="setting-row"><div><strong>'+escapeHTML(b.date.split("-").reverse().join("/"))+' · '+escapeHTML(b.start)+'–'+escapeHTML(b.end)+' ('+(b.professionalId?escapeHTML(proName(b.professionalId)):'Todos')+')</strong><small>'+escapeHTML(b.reason||"Bloqueio")+'</small></div><button class="secondary-btn" data-action="remove-block" data-id="'+escapeHTML(b.id)+'" data-date="'+escapeHTML(b.date)+'">Remover</button></div>').join('')||'<p class="empty-state">Nenhum bloqueio pontual cadastrado.</p>')+
      '</section>';

    body=heading("Configuração de Horários e Disponibilidade","Gerencie horários da empresa, equipa, folgas e bloqueios.")+
      companyFormHtml+proFormHtml+closureHtml+proAbsenceHtml+blocksHtml;
   }else{
    const currentTenant=(firebaseWorkspaceSession?.tenants||[]).find(t=>t.tenantId===tenantId);
    const slug=currentTenant?.slug||"";
    const publicUrl=window.location.origin+window.location.pathname+"?s="+encodeURIComponent(slug);
    body=heading("Página pública de agendamento","Link público para os seus clientes realizarem agendamentos online.")+
      '<section class="panel settings-card"><div class="panel-heading"><div><h2>Link público da empresa</h2><p>Compartilhe no WhatsApp, Instagram e redes sociais.</p></div><span class="status">Publicado e Ativo</span></div>'+
      '<div class="setting-row"><div><strong>Endereço público</strong><small id="publicBookingUrl">'+escapeHTML(publicUrl)+'</small></div>'+
      '<div style="display:flex;gap:8px;"><button class="secondary-btn" data-action="copy-public-link" data-url="'+escapeHTML(publicUrl)+'">Copiar link</button>'+
      '<a class="primary-btn" style="text-decoration:none;" href="'+escapeHTML(publicUrl)+'" target="_blank">Abrir agendamento online ↗</a></div></div>'+
      '<div class="setting-row"><div><strong>Identificador da empresa</strong><small>Slug: '+escapeHTML(slug)+' · Fuso horário: '+escapeHTML(currentTenant?.timezone||"America/Sao_Paulo")+'</small></div></div>'+
      '</section>';
   }
   content.innerHTML=body+demoNotice;
  }catch(error){
   if(version!==firebaseLoadVersion)return;
   content.innerHTML=heading("Não foi possível carregar os dados","O backend recusou ou não conseguiu concluir a consulta.")+
    '<div class="panel settings-card">'+escapeHTML(error.message||"Erro de comunicação.")+'</div>';
  }
 })();
}
function render(){
 if(firebaseMode){renderFirebaseView();return;}
 document.getElementById("breadcrumbTitle").textContent=titles[state.view];
 const views={overview,calendar,appointments,professionals,services,clients,team:()=>window.BookingTeam.render(),"public-page":publicPage,settings};
 content.innerHTML=views[state.view]();
 document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===state.view));
 if(state.view==="team"&&typeof window.BookingTeam.mount==="function")window.BookingTeam.mount();
}
window.BookingApp=Object.freeze({
 async connectFirebaseWorkspace(adapter,session){
  firebaseWorkspaceAdapter=adapter;firebaseWorkspaceSession=session;firebaseMode=true;
  const gate=document.getElementById("authGate");if(gate)gate.hidden=true;
  workspaceSelect.innerHTML="";
  const placeholder=document.createElement("option");placeholder.value="";placeholder.textContent="Selecione uma empresa";placeholder.disabled=true;placeholder.selected=true;workspaceSelect.appendChild(placeholder);
  (session.tenants||[]).forEach(tenant=>{
   const option=document.createElement("option");option.value=tenant.tenantId;option.textContent=tenant.name;
   workspaceSelect.appendChild(option);
  });
  const selected=adapter.getSelectedTenantId()||(session.tenants.length===1?session.tenants[0].tenantId:"");
  if(selected){await adapter.selectTenant(selected);workspaceSelect.value=selected;}
  const tenant=(session.tenants||[]).find(t=>t.tenantId===selected);
  if(tenant){activeWorkspaceName=tenant.name;workspaceName.textContent=tenant.name;workspaceRole.textContent=(tenant.role==="owner"?"Proprietário":tenant.role==="admin"?"Administrador":"Equipa")+" · Firebase";}
  if(selected&&window.BookingTeam?.configureLive){
   window.BookingTeam.configureLive({workspaceAdapter:adapter,tenantId:selected});
  }
  document.querySelector(".demo-pill").textContent="FIREBASE EMULATOR";
  const profile=document.querySelector(".profile");if(profile){profile.querySelector("strong").textContent=session.user?.displayName||session.user?.email||"Utilizador";profile.querySelector("small").textContent="Conta autenticada";}
  state.view="overview";state.query="";render();
 },
 disconnectFirebaseWorkspace(){firebaseMode=false;firebaseWorkspaceAdapter=null;firebaseWorkspaceSession=null;firebaseCatalog=null;workspaceSelect.innerHTML="";document.querySelector(".demo-pill").textContent="MODO DEMONSTRAÇÃO";render();}
});
function toast(message){const el=document.getElementById("toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600);}
function modal(){const wrap=document.createElement("div");wrap.className="modal-backdrop";wrap.innerHTML=`<form class="modal" id="appointmentForm"><h2>Novo agendamento</h2><p>Registo local de demonstração — não será enviado a nenhum cliente.</p><div class="form-grid"><div class="form-field"><label>Nome do cliente</label><input name="name" required maxlength="80" placeholder="Ex.: João Silva"></div><div class="form-field"><label>Data</label><input name="date" type="date" required value="${isoDate(today)}"></div><div class="form-field"><label>Serviço</label><select name="service">${state.services.map(s=>`<option value="${escapeHTML(s[0])}" data-duration="${s[1]}">${escapeHTML(s[0])} · ${s[1]} min</option>`).join("")}</select></div><div class="form-field"><label>Profissional</label><select name="professional">${state.professionals.map(p=>`<option>${escapeHTML(p[0])}</option>`).join("")}</select></div><div class="form-field"><label>Horário</label><select name="time" id="availableTimes"></select></div></div><p id="availabilityMessage" class="availability-message" aria-live="polite"></p><div class="modal-actions"><button type="button" class="secondary-btn" data-action="close-modal">Cancelar</button><button class="primary-btn" type="submit">Guardar demonstração</button></div></form>`;document.body.append(wrap);const form=wrap.querySelector("form"),date=form.elements.date,service=form.elements.service,pro=form.elements.professional,time=form.elements.time,msg=wrap.querySelector("#availabilityMessage");function refresh(){const duration=Number(service.selectedOptions[0].dataset.duration),slots=availability.slots({date:date.value,duration,professional:pro.value,appointments:workspaceAdapter.getAgenda(),...workspaceAdapter.getSchedule()});time.innerHTML=slots.map(s=>`<option value="${s.time}" ${s.available?"":"disabled"}>${s.time}${s.available?"":" · indisponível"}</option>`).join("");const free=slots.filter(s=>s.available);msg.textContent=free.length?`${free.length} horários disponíveis (intervalos de 30 min).`:"Não há horários disponíveis para esta combinação.";form.querySelector('[type="submit"]').disabled=!free.length;}[date,service,pro].forEach(el=>el.addEventListener("change",refresh));refresh();wrap.addEventListener("click",e=>{if(e.target===wrap||e.target.closest('[data-action="close-modal"]'))wrap.remove();});form.addEventListener("submit",e=>{e.preventDefault();const duration=Number(service.selectedOptions[0].dataset.duration),check=availability.isAvailable({date:date.value,time:time.value,duration,professional:pro.value,appointments:dataAdapter.getAppointments(),...dataAdapter.getScheduleData()});if(!check.ok){msg.textContent=check.reason;refresh();return;}state.appointments.push({date:date.value,time:time.value,duration,name:form.elements.name.value.trim(),service:service.value,professional:pro.value,status:"Pendente"});persistDemoState();wrap.remove();state.view="calendar";render();toast("Agendamento adicionado apenas à demonstração.");});}

async function openFirebaseAppointmentModal(){
 const tenantId=firebaseWorkspaceAdapter?.getSelectedTenantId();
 if(!tenantId)return;
 const wrap=document.createElement("div");wrap.className="modal-backdrop";
 let catalog=firebaseCatalog;
 if(!catalog)catalog=await firebaseWorkspaceAdapter.getCatalog({tenantId}).catch(()=>({professionals:[],services:[]}));
 const clientRes=await firebaseWorkspaceAdapter.getClients({tenantId}).catch(()=>({clients:[]}));
 const clients=clientRes.clients||[],pros=catalog.professionals||[],services=catalog.services||[];

 wrap.innerHTML=`<form class="modal" id="firebaseAppointmentModalForm"><h2>Novo agendamento</h2><p>Gravação no backend da empresa via Cloud Functions.</p><div class="form-grid"><div class="form-field"><label>Cliente</label><select name="clientId" id="firebaseModalClientSelect"><option value="new">+ Cadastrar novo cliente</option>${clients.map(c=>`<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)} ${c.phone?'('+escapeHTML(c.phone)+')':''}</option>`).join("")}</select></div><div id="newClientFields" class="form-grid" style="gap:8px;"><div class="form-field"><label>Nome do cliente</label><input name="newClientName" placeholder="Nome completo" required maxlength="100"></div><div class="form-field"><label>Telefone / WhatsApp</label><input name="newClientPhone" placeholder="(11) 99999-9999" maxlength="30"></div></div><div class="form-field"><label>Serviço</label><select name="serviceId" required>${services.map(s=>`<option value="${escapeHTML(s.id)}" data-duration="${s.durationMinutes||30}">${escapeHTML(s.name)} · ${s.durationMinutes||30} min</option>`).join("")}</select></div><div class="form-field"><label>Profissional</label><select name="professionalId" required>${pros.map(p=>`<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}</option>`).join("")}</select></div><div class="form-field"><label>Data</label><input name="date" type="date" required value="${isoDate(today)}"></div><div class="form-field"><label>Horário</label><select name="time" id="firebaseModalTimeSelect" required></select></div><div class="form-field"><label>Observações (opcional)</label><input name="notes" maxlength="300" placeholder="Ex.: Preferência de horário"></div></div><p id="firebaseAvailabilityMsg" class="availability-message" aria-live="polite"></p><div class="modal-actions"><button type="button" class="secondary-btn" data-action="close-modal">Cancelar</button><button class="primary-btn" type="submit">Confirmar agendamento</button></div></form>`;
 document.body.append(wrap);

 const form=wrap.querySelector("form"),clientSelect=form.elements.clientId,newClientFields=wrap.querySelector("#newClientFields"),serviceSelect=form.elements.serviceId,proSelect=form.elements.professionalId,dateInput=form.elements.date,timeSelect=form.elements.time,availMsg=wrap.querySelector("#firebaseAvailabilityMsg");

 clientSelect.addEventListener("change",()=>{
  const isNew=clientSelect.value==="new";
  newClientFields.hidden=!isNew;form.elements.newClientName.required=isNew;
 });

 async function updateSlots(){
  availMsg.textContent="A consultar disponibilidade...";timeSelect.innerHTML="<option>A carregar...</option>";
  try{
   const curTenant=(firebaseWorkspaceSession?.tenants||[]).find(t=>t.tenantId===tenantId);
   const slug=curTenant?.slug||"";
   if(!slug||!serviceSelect.value||!dateInput.value)return;
   const avail=await firebaseWorkspaceAdapter.getPublicAvailability({slug,serviceId:serviceSelect.value,professionalId:proSelect.value,date:dateInput.value});
   const slots=(avail?.slots||[]).filter(s=>s.available);
   if(slots.length){
    timeSelect.innerHTML=slots.map(s=>`<option value="${escapeHTML(s.time)}">${escapeHTML(s.time)}</option>`).join("");
    availMsg.textContent=`${slots.length} horários disponíveis encontrados.`;form.querySelector('[type="submit"]').disabled=false;
   }else{
    timeSelect.innerHTML="<option value=\"\" disabled selected>Sem horários</option>";
    availMsg.textContent="Nenhum horário livre nesta data para este serviço e profissional.";form.querySelector('[type="submit"]').disabled=true;
   }
  }catch(err){availMsg.textContent=err.message||"Erro ao consultar disponibilidade.";}
 }

 [serviceSelect,proSelect,dateInput].forEach(el=>el.addEventListener("change",updateSlots));
 if(services.length&&pros.length)updateSlots();

 wrap.addEventListener("click",e=>{if(e.target===wrap||e.target.closest('[data-action="close-modal"]'))wrap.remove();});

 form.addEventListener("submit",async e=>{
  e.preventDefault();
  const submitBtn=form.querySelector('[type="submit"]');submitBtn.disabled=true;
  try{
   let finalClientId=clientSelect.value;
   if(finalClientId==="new"){
    const saved=await firebaseWorkspaceAdapter.saveClient({tenantId,name:form.elements.newClientName.value.trim(),phone:form.elements.newClientPhone.value.trim()});
    finalClientId=saved.clientId;
   }
   const timeVal=timeSelect.value;if(!timeVal)throw new Error("Selecione um horário.");
   const startAtMs=new Date(`${dateInput.value}T${timeVal}:00`).getTime();
   await firebaseWorkspaceAdapter.createAppointment({
    tenantId,professionalId:proSelect.value,serviceId:serviceSelect.value,clientId:finalClientId,startAtMs,notes:form.elements.notes.value.trim()
   });
   wrap.remove();render();toast("Agendamento criado com sucesso.");
  }catch(err){availMsg.textContent=err.message||"Não foi possível criar o agendamento.";submitBtn.disabled=false;}
 });
}

document.addEventListener("submit",async e=>{
 const form=e.target;
 if(!firebaseMode||!["firebaseServiceForm","firebaseProfessionalForm"].includes(form.id))return;
 e.preventDefault();
 const values=new FormData(form),isService=form.id==="firebaseServiceForm";
 try{
  const payload={kind:isService?"service":"professional",itemId:String(values.get("itemId")||""),name:String(values.get("name")||"").trim()};
  if(isService){payload.durationMinutes=Number(values.get("durationMinutes"));payload.priceMinor=Number(values.get("priceMinor"));payload.currency=String(values.get("currency")||"").trim().toUpperCase();}
  else payload.color=String(values.get("color")||"#336699");
  await firebaseWorkspaceAdapter.saveCatalogItem(payload);
  firebaseCatalog=null;render();toast(isService?"Serviço guardado.":"Profissional guardado.");
 }catch(error){toast(error.message||"Não foi possível guardar o cadastro.");}
});
document.addEventListener("click",async e=>{
 const button=e.target.closest('[data-action]');
 if(!button||!firebaseMode)return;
 if(button.dataset.action==="clear-catalog-form"){const form=button.closest(".panel")?.querySelector("form");form?.reset();if(form?.elements.itemId)form.elements.itemId.value="";return;}
 if(button.dataset.action==="edit-catalog"){
  const form=document.getElementById(button.dataset.kind==="service"?"firebaseServiceForm":"firebaseProfessionalForm");
  if(!form)return;
  form.elements.itemId.value=button.dataset.id||"";
  form.elements.name.value=button.dataset.name||"";
  if(button.dataset.kind==="service"){form.elements.durationMinutes.value=button.dataset.duration||30;form.elements.priceMinor.value=button.dataset.price||0;form.elements.currency.value=button.dataset.currency||"PLN";}
  else form.elements.color.value=button.dataset.color||"#336699";
  form.scrollIntoView({behavior:"smooth",block:"center"});form.elements.name.focus();return;
 }
 if(button.dataset.action==="deactivate-catalog"){
  if(!window.confirm("Desativar este cadastro? Ele deixará de estar disponível para novos agendamentos."))return;
  try{await firebaseWorkspaceAdapter.saveCatalogItem({kind:button.dataset.kind,itemId:button.dataset.id,status:"inactive"});firebaseCatalog=null;render();toast("Cadastro desativado.");}
  catch(error){toast(error.message||"Não foi possível desativar.");}
 }
 if(button.dataset.action==="new-firebase-appointment"){openFirebaseAppointmentModal();return;}
 if(button.dataset.action==="cancel-firebase-appointment"){
  const reason=window.prompt("Motivo do cancelamento (opcional):","Cancelado pelo operador");
  if(reason===null)return;
  try{
   const tenantId=firebaseWorkspaceAdapter?.getSelectedTenantId();
   await firebaseWorkspaceAdapter.cancelAppointment({tenantId,appointmentId:button.dataset.id,reason:reason.trim()});
   render();toast("Agendamento cancelado com sucesso.");
  }catch(err){toast(err.message||"Não foi possível cancelar o agendamento.");}
  return;
 }
 if(button.dataset.action==="update-appointment-status"){
  try{
   const tenantId=firebaseWorkspaceAdapter?.getSelectedTenantId();
   await firebaseWorkspaceAdapter.updateAppointmentStatus({tenantId,appointmentId:button.dataset.id,status:button.dataset.status});
   render();toast("Estado atualizado com sucesso.");
  }catch(err){toast(err.message||"Não foi possível atualizar o estado.");}
  return;
 }
 if(button.dataset.action==="remove-block"){
  if(!window.confirm("Remover este bloqueio de horário?"))return;
  try{
   const tenantId=firebaseWorkspaceAdapter?.getSelectedTenantId();
   await firebaseWorkspaceAdapter.saveScheduleBlock({tenantId,blockId:button.dataset.id,date:button.dataset.date,remove:true});
   render();toast("Bloqueio removido.");
  }catch(err){toast(err.message||"Não foi possível remover o bloqueio.");}
  return;
 }
 if(button.dataset.action==="copy-public-link"){
  if(button.dataset.url){
   navigator.clipboard.writeText(button.dataset.url);
   toast("Link copiado para a área de transferência!");
  }
  return;
 }
});
document.addEventListener("submit",async e=>{
 const form=e.target;if(!firebaseMode||form.id!=="firebaseClientForm")return;
 e.preventDefault();
 const values=new FormData(form);
 try{
  await firebaseWorkspaceAdapter.saveClient({
   clientId:String(values.get("clientId")||""),name:String(values.get("name")||"").trim(),
   phone:String(values.get("phone")||"").trim(),email:String(values.get("email")||"").trim(),
   notes:String(values.get("notes")||"").trim()
  });
  render();toast("Cliente guardado com segurança.");
 }catch(error){toast(error.message||"Não foi possível guardar o cliente.");}
});
document.addEventListener("click",async e=>{
 const button=e.target.closest('[data-action]');if(!button||!firebaseMode)return;
 if(button.dataset.action==="clear-client-form"){
  const form=document.getElementById("firebaseClientForm");form?.reset();if(form?.elements.clientId)form.elements.clientId.value="";return;
 }
 if(button.dataset.action==="edit-client"){
  const form=document.getElementById("firebaseClientForm");if(!form)return;
  form.elements.clientId.value=button.dataset.id||"";form.elements.name.value=button.dataset.name||"";
  form.elements.phone.value=button.dataset.phone||"";form.elements.email.value=button.dataset.email||"";
  form.elements.notes.value=button.dataset.notes||"";form.scrollIntoView({behavior:"smooth",block:"center"});form.elements.name.focus();return;
 }
 if(button.dataset.action==="deactivate-client"){
  if(!window.confirm("Desativar este cliente? O histórico de agendamentos será preservado."))return;
  try{await firebaseWorkspaceAdapter.saveClient({clientId:button.dataset.id,status:"inactive"});render();toast("Cliente desativado.");}
  catch(error){toast(error.message||"Não foi possível desativar o cliente.");}
 }
});
document.addEventListener("submit",async e=>{
 if(!firebaseMode)return;
 const f=e.target,tenantId=firebaseWorkspaceAdapter?.getSelectedTenantId();
 if(!tenantId)return;
 if(f.id==="firebaseCompanyScheduleForm"){
  e.preventDefault();
  try{
   const days={};
   for(let d=0;d<7;d++){
    if(!f.elements["open-"+d]?.checked){days[d]=[];continue;}
    const s=f.elements["start-"+d].value,en=f.elements["end-"+d].value;
    const bs=f.elements["break-start-"+d].value,be=f.elements["break-end-"+d].value;
    const s2=f.elements["start2-"+d].value,e2=f.elements["end2-"+d].value;
    const periods=[{start:s,end:en,breaks:bs?[{start:bs,end:be}]:[]}];
    if(s2&&e2)periods.push({start:s2,end:e2,breaks:[]});
    days[d]=periods;
   }
   await firebaseWorkspaceAdapter.saveScheduleSettings({tenantId,scope:"company",days});
   render();toast("Horário da empresa guardado com sucesso.");
  }catch(err){toast(err.message||"Erro ao guardar horário.");}
 }else if(f.id==="firebaseProfessionalScheduleForm"){
  e.preventDefault();
  try{
   const proId=f.elements.professionalId.value,days={};
   for(let d=0;d<7;d++){
    if(!f.elements["pro-open-"+d]?.checked){days[d]=[];continue;}
    const s=f.elements["pro-start-"+d].value,en=f.elements["pro-end-"+d].value;
    const bs=f.elements["pro-break-start-"+d].value,be=f.elements["pro-break-end-"+d].value;
    days[d]=[{start:s,end:en,breaks:bs?[{start:bs,end:be}]:[]}];
   }
   await firebaseWorkspaceAdapter.saveScheduleSettings({tenantId,scope:"professional",professionalId:proId,days});
   render();toast("Horário do profissional guardado.");
  }catch(err){toast(err.message||"Erro ao guardar horário do profissional.");}
 }else if(f.id==="firebaseCompanyExceptionForm"){
  e.preventDefault();
  try{
   await firebaseWorkspaceAdapter.saveScheduleException({
    tenantId,kind:"companyClosure",startDate:f.elements.startDate.value,endDate:f.elements.endDate.value||f.elements.startDate.value,reason:f.elements.reason.value.trim()
   });
   render();toast("Fechamento registado com sucesso.");
  }catch(err){toast(err.message||"Erro ao registar fechamento.");}
 }else if(f.id==="firebaseProExceptionForm"){
  e.preventDefault();
  try{
   await firebaseWorkspaceAdapter.saveScheduleException({
    tenantId,kind:"professionalAbsence",professionalId:f.elements.professionalId.value,startDate:f.elements.startDate.value,endDate:f.elements.endDate.value||f.elements.startDate.value,reason:f.elements.reason.value.trim()
   });
   render();toast("Ausência do profissional registada.");
  }catch(err){toast(err.message||"Erro ao registar ausência.");}
 }else if(f.id==="firebaseBlockForm"){
  e.preventDefault();
  try{
   await firebaseWorkspaceAdapter.saveScheduleBlock({
    tenantId,date:f.elements.date.value,start:f.elements.start.value,end:f.elements.end.value,professionalId:f.elements.professionalId.value||"",reason:f.elements.reason.value.trim()
   });
   render();toast("Bloqueio de horário guardado.");
  }catch(err){toast(err.message||"Erro ao registar bloqueio.");}
 }
});
document.addEventListener("submit",e=>{if(e.target.id==="professionalScheduleForm"){e.preventDefault();const f=e.target,person=f.elements.professional.value,next={};for(const d of [1,2,3,4,5,6,0]){if(!f.elements["open-"+d].checked){next[d]=[];continue;}const start=f.elements["start-"+d].value,end=f.elements["end-"+d].value,bs=f.elements["break-start-"+d].value,be=f.elements["break-end-"+d].value,company=state.companySchedule[d]||[];if(!start||!end||start>=end||!company.some(p=>start>=p.start&&end<=p.end)){toast("O horário individual deve estar dentro do horário da empresa.");return;}if((bs&&!be)||(!bs&&be)||(bs&&!(start<bs&&bs<be&&be<end))){toast("Intervalo inválido.");return;}const start2=f.elements["start2-"+d].value,end2=f.elements["end2-"+d].value,periods=[{start,end,breaks:bs?[{start:bs,end:be}]:[]}];if((start2&&!end2)||(!start2&&end2)||(start2&&start2>=end2)){toast("Verifique o segundo período.");return;}if(start2){if(start2<end){toast("O segundo período deve começar após o primeiro.");return;}if(!company.some(p=>start2>=p.start&&end2<=p.end)){toast("O segundo período deve estar dentro do horário da empresa.");return;}periods.push({start:start2,end:end2,breaks:[]});}next[d]=periods;}state.professionalSchedules[person]=next;persistDemoState();render();toast("Horário individual atualizado.");}});
function loadProfessionalSchedule(person){const f=document.getElementById("professionalScheduleForm");if(!f)return;for(const d of [1,2,3,4,5,6,0]){const ps=state.professionalSchedules[person]?.[d]||[],p=ps[0],q=ps[1],row=f.querySelector('[name="open-'+d+'"]').closest(".multi-period-row");row.querySelector('[name="open-'+d+'"]').checked=!!ps.length;for(const [k,v] of [["start",p?.start||"09:00"],["end",p?.end||"18:00"],["break-start",p?.breaks?.[0]?.start||""],["break-end",p?.breaks?.[0]?.end||""],["start2",q?.start||""],["end2",q?.end||""]]){const el=row.querySelector('[name="'+k+'-'+d+'"]');if(el){el.value=v;el.disabled=!ps.length;}}}}
document.addEventListener("change",e=>{if(e.target.matches('#professionalScheduleForm [name="professional"]'))loadProfessionalSchedule(e.target.value);if(e.target.matches('#professionalScheduleForm input[type="checkbox"]'))e.target.closest(".schedule-edit-row").querySelectorAll('input[type="time"]').forEach(x=>x.disabled=!e.target.checked);});
document.addEventListener("submit",e=>{if(e.target.id==="companyScheduleForm"){e.preventDefault();const f=e.target,next={};for(let d=0;d<7;d++){if(!f.elements["open-"+d].checked){next[d]=[];continue;}const s=f.elements["start-"+d].value,en=f.elements["end-"+d].value,bs=f.elements["break-start-"+d].value,be=f.elements["break-end-"+d].value;if(!s||!en||s>=en){toast("Verifique abertura e encerramento.");return;}if((bs&&!be)||(!bs&&be)||(bs&&!(s<bs&&bs<be&&be<en))){toast("O intervalo deve estar dentro do funcionamento.");return;}const s2=f.elements["start2-"+d].value,e2=f.elements["end2-"+d].value,periods=[{start:s,end:en,breaks:bs?[{start:bs,end:be}]:[]}];if((s2&&!e2)||(!s2&&e2)|| (s2&&s2>=e2)){toast("Verifique o segundo período.");return;}if(s2){if(s2<en){toast("O segundo período deve começar após o primeiro.");return;}periods.push({start:s2,end:e2,breaks:[]});}next[d]=periods;}state.companySchedule=next;persistDemoState();render();toast("Horário da empresa atualizado nesta demonstração.");}else if(e.target.id==="exceptionForm"){e.preventDefault();state.exceptions.push({date:e.target.elements.date.value,label:e.target.elements.label.value.trim()});persistDemoState();render();toast("Exceção adicionada.");}});
document.addEventListener("change",e=>{if(e.target.matches('input[type="checkbox"][name^="open-"]'))e.target.closest(".schedule-edit-row").querySelectorAll('input[type="time"]').forEach(x=>x.disabled=!e.target.checked);});
document.addEventListener("click",e=>{const remove=e.target.closest('[data-action="remove-exception"]');if(remove){state.exceptions.splice(Number(remove.dataset.index),1);persistDemoState();render();return;}const nav=e.target.closest("[data-view]");if(nav){state.view=nav.dataset.view;state.query="";render();document.getElementById("sidebar").classList.remove("open");return;}const action=e.target.closest("[data-action]")?.dataset.action;if(!action)return;if(action==="new-appointment"){if(firebaseMode)openFirebaseAppointmentModal();else modal();}else if(action==="week-prev"){state.weekOffset--;render();}else if(action==="week-next"){state.weekOffset++;render();}else if(action==="week-current"){state.weekOffset=0;render();}else if(action==="today"){state.weekOffset=0;state.view="calendar";render();}else if(action==="preview")toast("A página pública será disponibilizada após a implementação do backend.");});
document.addEventListener("change",e=>{if(e.target.id==="calendarProfessional"){state.calendarProfessional=e.target.value;render();}});
document.addEventListener("input",e=>{if(e.target.id==="search"){state.query=e.target.value;const pos=e.target.selectionStart;render();const input=document.getElementById("search");input?.focus();input?.setSelectionRange(pos,pos);}});
document.addEventListener("submit",e=>{if(e.target.id!=="professionalExceptionForm")return;e.preventDefault();const f=e.target,date=f.elements.date.value,endDate=f.elements.endDate.value||date,professional=f.elements.professional.value,label=f.elements.label.value.trim();if(endDate<date){toast("A data final deve ser igual ou posterior à inicial.");return;}if(state.professionalExceptions.some(x=>x.professional===professional&&date<=(x.endDate||x.date)&&endDate>=x.date)){toast("Já existe uma ausência sobreposta para este profissional.");return;}state.professionalExceptions.push({professional,date,endDate,label});persistDemoState();render();toast("Ausência adicionada à agenda.");});
document.addEventListener("click",e=>{const b=e.target.closest('[data-action="remove-prof-exception"]');if(!b)return;state.professionalExceptions.splice(Number(b.dataset.index),1);persistDemoState();render();});
document.getElementById("menuToggle").addEventListener("click",()=>document.getElementById("sidebar").classList.toggle("open"));

async function initPublicCustomerBooking(slug){
 const gate=document.getElementById("authGate");if(gate)gate.hidden=true;
 const sidebar=document.getElementById("sidebar");if(sidebar)sidebar.style.display="none";
 const main=document.querySelector(".main-area");if(main)main.style.marginLeft="0";
 const topbar=document.querySelector(".topbar");if(topbar)topbar.style.display="none";
 const footer=document.querySelector(".footer");if(footer)footer.style.display="none";

 content.innerHTML=`<div class="panel settings-card" style="margin:40px auto;text-align:center;"><h2>A carregar empresa...</h2><p>A consultar dados de <b>${escapeHTML(slug)}</b>.</p></div>`;

 try{
  let adapter=firebaseWorkspaceAdapter;
  if(!adapter&&window.BookingFirebaseWorkspace){
   const runtime=window.BookingFirebaseRuntime;
   if(runtime?.ready){
    const fb=await runtime.ready;
    adapter=window.BookingFirebaseWorkspace.createFirebaseWorkspaceAdapter({
     functions:fb.functions,httpsCallable:fb.functionsSdk.httpsCallable,authAdapter:window.BookingAuth.createDemoAdapter()
    });
   }
  }
  if(!adapter)throw new Error("Comunicação com o backend indisponível.");
  const pageData=await adapter.getPublicBookingPage({slug});
  const tenant=pageData.tenant,services=pageData.services||[],pros=pageData.professionals||[];
  const selectedServiceId=services[0]?.id||"";
  const selectedDate=isoDate(new Date(Date.now()+86400000));

  content.innerHTML=`<div style="max-width:680px;margin:24px auto;padding:0 16px;"><div class="panel" style="margin-bottom:20px;text-align:center;padding:28px 20px;"><div class="brand-mark" style="margin:0 auto 12px;width:48px;height:48px;font-size:24px;">${escapeHTML(tenant.name.charAt(0))}</div><h1 style="font:800 24px Manrope;margin:0 0 6px;">${escapeHTML(tenant.name)}</h1><p style="margin:0;color:#7d8798;font-size:12px;">Agendamento online seguro e em tempo real</p></div><form id="publicBookingForm" class="panel settings-card" style="max-width:100%;"><div class="panel-heading"><div><h2>1. Selecione o serviço</h2><p>Preço e duração do serviço</p></div></div><div class="form-grid" style="grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:10px;margin-bottom:24px;">${services.map(s=>`<label style="border:1px solid var(--line);border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px;cursor:pointer;background:#fff;"><input type="radio" name="publicService" value="${escapeHTML(s.id)}" ${s.id===selectedServiceId?'checked':''}><div><strong>${escapeHTML(s.name)}</strong><small style="display:block;color:#7d8798;">${s.durationMinutes} min · ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:s.currency||'BRL'}).format(s.priceMinor/100)}</small></div></label>`).join("")}</div><div class="panel-heading"><div><h2>2. Profissional</h2><p>Escolha um profissional ou qualquer disponível</p></div></div><div class="form-grid" style="grid-template-columns:repeat(auto-fill, minmax(160px, 1fr));gap:10px;margin-bottom:24px;"><label style="border:1px solid var(--line);border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px;cursor:pointer;background:#fff;"><input type="radio" name="publicPro" value="" checked><div><strong>Qualquer profissional</strong><small style="display:block;color:#7d8798;">Primeiro disponível</small></div></label>${pros.map(p=>`<label style="border:1px solid var(--line);border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px;cursor:pointer;background:#fff;"><input type="radio" name="publicPro" value="${escapeHTML(p.id)}"><div><strong>${escapeHTML(p.name)}</strong></div></label>`).join("")}</div><div class="panel-heading"><div><h2>3. Data e horário</h2><p>Disponibilidade real da agenda</p></div></div><div class="form-grid" style="grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;"><div class="form-field"><label>Data</label><input type="date" id="publicBookingDate" value="${selectedDate}" min="${isoDate(today)}" required></div><div class="form-field"><label>Horário disponível</label><select id="publicBookingSlotSelect" required><option value="">A procurar horários...</option></select></div></div><p id="publicSlotMsg" class="availability-message" style="margin-top:-14px;margin-bottom:20px;"></p><div class="panel-heading"><div><h2>4. Os seus dados</h2><p>Para registo da sua reserva</p></div></div><div class="form-grid" style="gap:12px;margin-bottom:24px;"><div class="form-field"><label>Nome completo</label><input name="clientName" required maxlength="100" placeholder="Ex.: Lucas Silva"></div><div class="form-field"><label>WhatsApp / Telefone</label><input name="clientPhone" type="tel" required maxlength="30" placeholder="(11) 98888-7777"></div><div class="form-field"><label>E-mail (opcional)</label><input name="clientEmail" type="email" maxlength="254" placeholder="voce@email.com"></div><div class="form-field"><label>Observações (opcional)</label><input name="notes" maxlength="300" placeholder="Ex.: Primeira visita"></div></div><div style="border-top:1px solid var(--line);padding-top:16px;display:flex;justify-content:flex-end;"><button class="primary-btn" type="submit" id="btnConfirmPublicBooking" style="padding:14px 28px;font-size:13px;">Confirmar agendamento</button></div></form></div>`;

  const form=document.getElementById("publicBookingForm"),dateEl=document.getElementById("publicBookingDate"),slotSelect=document.getElementById("publicBookingSlotSelect"),slotMsg=document.getElementById("publicSlotMsg"),submitBtn=document.getElementById("btnConfirmPublicBooking");

  async function refreshSlots(){
   const sId=form.querySelector('input[name="publicService"]:checked')?.value;
   const pId=form.querySelector('input[name="publicPro"]:checked')?.value||"";
   const dVal=dateEl.value;
   slotSelect.innerHTML="<option value=\"\">A verificar...</option>";submitBtn.disabled=true;
   if(!sId||!dVal)return;
   try{
    const avail=await adapter.getPublicAvailability({slug,serviceId:sId,professionalId:pId,date:dVal});
    const slots=avail?.slots||[];
    if(slots.length){
     slotSelect.innerHTML=slots.map(s=>`<option value="${escapeHTML(s.time)}" data-pro="${escapeHTML(s.professionalId||'')}">${escapeHTML(s.time)}</option>`).join("");
     slotMsg.textContent=`${slots.length} horários disponíveis encontrados.`;submitBtn.disabled=false;
    }else{
     slotSelect.innerHTML="<option value=\"\" disabled selected>Sem horários</option>";
     slotMsg.textContent="Sem horários disponíveis para esta data. Escolha outro dia ou profissional.";submitBtn.disabled=true;
    }
   }catch(err){slotMsg.textContent=err.message||"Erro ao consultar disponibilidade.";}
  }

  form.querySelectorAll('input[name="publicService"], input[name="publicPro"]').forEach(el=>el.addEventListener("change",refreshSlots));
  dateEl.addEventListener("change",refreshSlots);
  refreshSlots();

  form.addEventListener("submit",async e=>{
   e.preventDefault();submitBtn.disabled=true;submitBtn.textContent="A confirmar agendamento...";
   try{
    const sId=form.querySelector('input[name="publicService"]:checked')?.value;
    const opt=slotSelect.selectedOptions[0];
    const timeVal=slotSelect.value;
    const proId=opt?.dataset.pro||form.querySelector('input[name="publicPro"]:checked')?.value||"";
    const startAtMs=new Date(`${dateEl.value}T${timeVal}:00`).getTime();
    const clientName=form.elements.clientName.value.trim();
    const clientPhone=form.elements.clientPhone.value.trim();
    const clientEmail=form.elements.clientEmail.value.trim();
    const notes=form.elements.notes.value.trim();

    const res=await adapter.createPublicAppointment({
     slug,serviceId:sId,professionalId:proId,startAtMs,clientName,clientPhone,clientEmail,notes
    });

    const chosenSvc=services.find(s=>s.id===sId);
    const chosenPro=pros.find(p=>p.id===proId)||{name:"Profissional disponível"};
    const formattedDate=new Date(`${dateEl.value}T12:00:00`).toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"});

    content.innerHTML=`<div style="max-width:540px;margin:40px auto;padding:0 16px;"><div class="panel" style="text-align:center;padding:36px 24px;"><div style="width:56px;height:56px;background:#edf8f3;color:#159b72;border-radius:50%;display:grid;place-items:center;font-size:28px;margin:0 auto 16px;">✓</div><h1 style="font:800 24px Manrope;margin:0 0 8px;">Agendamento Confirmado!</h1><p style="color:#7d8798;font-size:12px;margin:0 0 24px;">O seu agendamento foi registado com sucesso no sistema.</p><div style="background:#f8f9fc;border:1px solid var(--line);border-radius:12px;padding:20px;text-align:left;display:grid;gap:10px;font-size:11px;margin-bottom:24px;"><div><strong>Empresa:</strong> <span>${escapeHTML(tenant.name)}</span></div><div><strong>Serviço:</strong> <span>${escapeHTML(chosenSvc?.name||'Serviço')} (${chosenSvc?.durationMinutes||30} min)</span></div><div><strong>Profissional:</strong> <span>${escapeHTML(chosenPro.name)}</span></div><div><strong>Data e Hora:</strong> <span>${escapeHTML(formattedDate)} às ${escapeHTML(timeVal)}</span></div><div><strong>Cliente:</strong> <span>${escapeHTML(clientName)} (${escapeHTML(clientPhone)})</span></div><div><strong>Código da Reserva:</strong> <code>${escapeHTML(res.appointmentId)}</code></div></div><div style="display:flex;gap:10px;justify-content:center;"><a class="primary-btn" style="text-decoration:none;padding:12px 20px;" href="?s=${encodeURIComponent(slug)}">Novo agendamento</a></div></div></div>`;
   }catch(err){
    slotMsg.textContent=err.message||"Não foi possível concluir o agendamento.";
    submitBtn.disabled=false;submitBtn.textContent="Confirmar agendamento";
   }
  });
 }catch(err){
  content.innerHTML=`<div class="panel settings-card" style="margin:40px auto;text-align:center;"><h2>Página não disponível</h2><p>${escapeHTML(err.message||"Empresa não encontrada.")}</p><a class="secondary-btn" href="./">Voltar ao início</a></div>`;
 }
}

const urlParams=new URLSearchParams(window.location.search);
const publicSlugParam=urlParams.get("s")||urlParams.get("slug");
if(publicSlugParam){
 initPublicCustomerBooking(publicSlugParam);
}else{
 render();
}


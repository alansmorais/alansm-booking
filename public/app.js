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
   const [catalog,agendaResult]=await Promise.all([
    firebaseCatalog?Promise.resolve(firebaseCatalog):firebaseWorkspaceAdapter.getCatalog({tenantId}),
    firebaseWorkspaceAdapter.getAgenda({tenantId,startAtMs:Date.now()-7*86400000,endAtMs:Date.now()+24*86400000})
   ]);
   if(version!==firebaseLoadVersion)return;
   firebaseCatalog=catalog;
   const pros=Array.isArray(catalog.professionals)?catalog.professionals:[];
   const services=Array.isArray(catalog.services)?catalog.services:[];
   const proName=id=>pros.find(p=>p.id===id)?.name||"Profissional";
   const serviceName=id=>services.find(s=>s.id===id)?.name||"Serviço";
   const items=Array.isArray(agendaResult.appointments)?agendaResult.appointments:[];
   const money=(minor,currency)=>Number.isSafeInteger(minor)?new Intl.NumberFormat("pt-BR",{style:"currency",currency:currency||"BRL"}).format(minor/100):"—";
   const dateTime=a=>new Date(a.startAtMs).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
   const statusLabel={booked:"Reservado",confirmed:"Confirmado",pending:"Pendente",cancelled:"Cancelado",completed:"Concluído",no_show:"Não compareceu"};
   const rowItems=items.slice().sort((a,b)=>a.startAtMs-b.startAtMs).map(a=>[
    "<strong>"+escapeHTML(dateTime(a))+"</strong>",
    escapeHTML(a.clientId?"Cliente · "+a.clientId.slice(0,7):"Cliente não identificado"),
    escapeHTML(serviceName(a.serviceId)),escapeHTML(proName(a.professionalId)),
    '<span class="status">'+escapeHTML(statusLabel[a.status]||a.status)+'</span>'
   ]);
   const tableHtml=(headers,rows)=>'<div class="panel table-wrap"><table class="data-table"><thead><tr>'+headers.map(h=>"<th>"+h+"</th>").join("")+'</tr></thead><tbody>'+(rows.length?rows.map(r=>"<tr>"+r.map(c=>"<td>"+c+"</td>").join("")+"</tr>").join(""):'<tr><td colspan="'+headers.length+'" class="empty-state">Nenhum registo encontrado.</td></tr>')+'</tbody></table></div>';
   const demoNotice='<div class="demo-banner">Dados carregados do Firebase Emulator. Esta integração é apenas local; nenhum projeto de produção está configurado.</div>';
   let body="";
   if(state.view==="overview"){
    body=heading("Visão geral","Resumo dos dados reais desta empresa.")+
     '<div class="stats-grid"><div class="stat-card"><div class="stat-top">Agendamentos no período</div><div class="stat-value">'+items.length+'</div><div class="stat-foot">Consulta limitada a 31 dias</div></div><div class="stat-card"><div class="stat-top">Profissionais ativos</div><div class="stat-value">'+pros.length+'</div><div class="stat-foot">Catálogo da empresa</div></div><div class="stat-card"><div class="stat-top">Serviços ativos</div><div class="stat-value">'+services.length+'</div><div class="stat-foot">Catálogo da empresa</div></div></div>'+
     '<div class="panel settings-card"><h2>Agendamentos recentes</h2>'+tableHtml(["DATA / HORÁRIO","CLIENTE","SERVIÇO","PROFISSIONAL","ESTADO"],rowItems.slice(0,8))+'</div>';
   }else if(state.view==="appointments"||state.view==="calendar"){
    body=heading(state.view==="calendar"?"Agenda":"Agendamentos","Registos devolvidos pelo backend da empresa.")+
     '<div class="toolbar"><input class="search-input" id="search" placeholder="Pesquisar serviço ou profissional..." value="'+escapeHTML(state.query)+'"></div>'+
     tableHtml(["DATA / HORÁRIO","CLIENTE","SERVIÇO","PROFISSIONAL","ESTADO"],rowItems.filter(r=>r.join(" ").toLowerCase().includes(state.query.toLowerCase())));
   }else if(state.view==="professionals"){
    body=heading("Profissionais","Profissionais ativos cadastrados nesta empresa.")+
     tableHtml(["PROFISSIONAL","ESTADO"],pros.map(p=>["<strong>"+escapeHTML(p.name)+"</strong>",'<span class="status">Ativo</span>']));
   }else if(state.view==="services"){
    body=heading("Serviços","Serviços ativos cadastrados nesta empresa.")+
     tableHtml(["SERVIÇO","DURAÇÃO","PREÇO","ESTADO"],services.map(s=>["<strong>"+escapeHTML(s.name)+"</strong>",(s.durationMinutes??"—")+" min",escapeHTML(money(s.priceMinor,s.currency)), '<span class="status">Ativo</span>']));
   }else if(state.view==="clients"){
    body=heading("Clientes","A leitura de dados pessoais de clientes ainda não foi disponibilizada no backend.")+
     '<div class="panel settings-card">Nenhum dado fictício será exibido aqui. O endpoint seguro de clientes será implementado numa etapa própria.</div>';
   }else if(state.view==="team"){
    body=heading("Equipe e acessos","A gestão de membros será ligada nesta etapa seguinte.")+
     '<div class="panel settings-card">Os dados de membros ainda não estão integrados nesta vista.</div>';
   }else if(state.view==="settings"){
    body=heading("Configurações","As configurações reais de horários serão ligadas numa próxima etapa.")+
     '<div class="panel settings-card">Esta página não altera dados do Firebase neste momento.</div>';
   }else{
    body=heading("Página pública","A publicação de reservas ainda não está ativada.")+
     '<div class="panel settings-card">O link público só será ativado depois de concluir e testar o fluxo de reservas.</div>';
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
  document.querySelector(".demo-pill").textContent="FIREBASE EMULATOR";
  const profile=document.querySelector(".profile");if(profile){profile.querySelector("strong").textContent=session.user?.displayName||session.user?.email||"Utilizador";profile.querySelector("small").textContent="Conta autenticada";}
  state.view="overview";state.query="";render();
 },
 disconnectFirebaseWorkspace(){firebaseMode=false;firebaseWorkspaceAdapter=null;firebaseWorkspaceSession=null;firebaseCatalog=null;workspaceSelect.innerHTML="";document.querySelector(".demo-pill").textContent="MODO DEMONSTRAÇÃO";render();}
});
function toast(message){const el=document.getElementById("toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600);}
function modal(){const wrap=document.createElement("div");wrap.className="modal-backdrop";wrap.innerHTML=`<form class="modal" id="appointmentForm"><h2>Novo agendamento</h2><p>Registo local de demonstração — não será enviado a nenhum cliente.</p><div class="form-grid"><div class="form-field"><label>Nome do cliente</label><input name="name" required maxlength="80" placeholder="Ex.: João Silva"></div><div class="form-field"><label>Data</label><input name="date" type="date" required value="${isoDate(today)}"></div><div class="form-field"><label>Serviço</label><select name="service">${state.services.map(s=>`<option value="${escapeHTML(s[0])}" data-duration="${s[1]}">${escapeHTML(s[0])} · ${s[1]} min</option>`).join("")}</select></div><div class="form-field"><label>Profissional</label><select name="professional">${state.professionals.map(p=>`<option>${escapeHTML(p[0])}</option>`).join("")}</select></div><div class="form-field"><label>Horário</label><select name="time" id="availableTimes"></select></div></div><p id="availabilityMessage" class="availability-message" aria-live="polite"></p><div class="modal-actions"><button type="button" class="secondary-btn" data-action="close-modal">Cancelar</button><button class="primary-btn" type="submit">Guardar demonstração</button></div></form>`;document.body.append(wrap);const form=wrap.querySelector("form"),date=form.elements.date,service=form.elements.service,pro=form.elements.professional,time=form.elements.time,msg=wrap.querySelector("#availabilityMessage");function refresh(){const duration=Number(service.selectedOptions[0].dataset.duration),slots=availability.slots({date:date.value,duration,professional:pro.value,appointments:workspaceAdapter.getAgenda(),...workspaceAdapter.getSchedule()});time.innerHTML=slots.map(s=>`<option value="${s.time}" ${s.available?"":"disabled"}>${s.time}${s.available?"":" · indisponível"}</option>`).join("");const free=slots.filter(s=>s.available);msg.textContent=free.length?`${free.length} horários disponíveis (intervalos de 30 min).`:"Não há horários disponíveis para esta combinação.";form.querySelector('[type="submit"]').disabled=!free.length;}[date,service,pro].forEach(el=>el.addEventListener("change",refresh));refresh();wrap.addEventListener("click",e=>{if(e.target===wrap||e.target.closest('[data-action="close-modal"]'))wrap.remove();});form.addEventListener("submit",e=>{e.preventDefault();const duration=Number(service.selectedOptions[0].dataset.duration),check=availability.isAvailable({date:date.value,time:time.value,duration,professional:pro.value,appointments:dataAdapter.getAppointments(),...dataAdapter.getScheduleData()});if(!check.ok){msg.textContent=check.reason;refresh();return;}state.appointments.push({date:date.value,time:time.value,duration,name:form.elements.name.value.trim(),service:service.value,professional:pro.value,status:"Pendente"});persistDemoState();wrap.remove();state.view="calendar";render();toast("Agendamento adicionado apenas à demonstração.");});}
document.addEventListener("submit",e=>{if(e.target.id==="professionalScheduleForm"){e.preventDefault();const f=e.target,person=f.elements.professional.value,next={};for(const d of [1,2,3,4,5,6,0]){if(!f.elements["open-"+d].checked){next[d]=[];continue;}const start=f.elements["start-"+d].value,end=f.elements["end-"+d].value,bs=f.elements["break-start-"+d].value,be=f.elements["break-end-"+d].value,company=state.companySchedule[d]||[];if(!start||!end||start>=end||!company.some(p=>start>=p.start&&end<=p.end)){toast("O horário individual deve estar dentro do horário da empresa.");return;}if((bs&&!be)||(!bs&&be)||(bs&&!(start<bs&&bs<be&&be<end))){toast("Intervalo inválido.");return;}const start2=f.elements["start2-"+d].value,end2=f.elements["end2-"+d].value,periods=[{start,end,breaks:bs?[{start:bs,end:be}]:[]}];if((start2&&!end2)||(!start2&&end2)||(start2&&start2>=end2)){toast("Verifique o segundo período.");return;}if(start2){if(start2<end){toast("O segundo período deve começar após o primeiro.");return;}if(!company.some(p=>start2>=p.start&&end2<=p.end)){toast("O segundo período deve estar dentro do horário da empresa.");return;}periods.push({start:start2,end:end2,breaks:[]});}next[d]=periods;}state.professionalSchedules[person]=next;persistDemoState();render();toast("Horário individual atualizado.");}});
function loadProfessionalSchedule(person){const f=document.getElementById("professionalScheduleForm");if(!f)return;for(const d of [1,2,3,4,5,6,0]){const ps=state.professionalSchedules[person]?.[d]||[],p=ps[0],q=ps[1],row=f.querySelector('[name="open-'+d+'"]').closest(".multi-period-row");row.querySelector('[name="open-'+d+'"]').checked=!!ps.length;for(const [k,v] of [["start",p?.start||"09:00"],["end",p?.end||"18:00"],["break-start",p?.breaks?.[0]?.start||""],["break-end",p?.breaks?.[0]?.end||""],["start2",q?.start||""],["end2",q?.end||""]]){const el=row.querySelector('[name="'+k+'-'+d+'"]');if(el){el.value=v;el.disabled=!ps.length;}}}}
document.addEventListener("change",e=>{if(e.target.matches('#professionalScheduleForm [name="professional"]'))loadProfessionalSchedule(e.target.value);if(e.target.matches('#professionalScheduleForm input[type="checkbox"]'))e.target.closest(".schedule-edit-row").querySelectorAll('input[type="time"]').forEach(x=>x.disabled=!e.target.checked);});
document.addEventListener("submit",e=>{if(e.target.id==="companyScheduleForm"){e.preventDefault();const f=e.target,next={};for(let d=0;d<7;d++){if(!f.elements["open-"+d].checked){next[d]=[];continue;}const s=f.elements["start-"+d].value,en=f.elements["end-"+d].value,bs=f.elements["break-start-"+d].value,be=f.elements["break-end-"+d].value;if(!s||!en||s>=en){toast("Verifique abertura e encerramento.");return;}if((bs&&!be)||(!bs&&be)||(bs&&!(s<bs&&bs<be&&be<en))){toast("O intervalo deve estar dentro do funcionamento.");return;}const s2=f.elements["start2-"+d].value,e2=f.elements["end2-"+d].value,periods=[{start:s,end:en,breaks:bs?[{start:bs,end:be}]:[]}];if((s2&&!e2)||(!s2&&e2)|| (s2&&s2>=e2)){toast("Verifique o segundo período.");return;}if(s2){if(s2<en){toast("O segundo período deve começar após o primeiro.");return;}periods.push({start:s2,end:e2,breaks:[]});}next[d]=periods;}state.companySchedule=next;persistDemoState();render();toast("Horário da empresa atualizado nesta demonstração.");}else if(e.target.id==="exceptionForm"){e.preventDefault();state.exceptions.push({date:e.target.elements.date.value,label:e.target.elements.label.value.trim()});persistDemoState();render();toast("Exceção adicionada.");}});
document.addEventListener("change",e=>{if(e.target.matches('input[type="checkbox"][name^="open-"]'))e.target.closest(".schedule-edit-row").querySelectorAll('input[type="time"]').forEach(x=>x.disabled=!e.target.checked);});
document.addEventListener("click",e=>{const remove=e.target.closest('[data-action="remove-exception"]');if(remove){state.exceptions.splice(Number(remove.dataset.index),1);persistDemoState();render();return;}const nav=e.target.closest("[data-view]");if(nav){state.view=nav.dataset.view;state.query="";render();document.getElementById("sidebar").classList.remove("open");return;}const action=e.target.closest("[data-action]")?.dataset.action;if(!action)return;if(action==="new-appointment")modal();else if(action==="week-prev"){state.weekOffset--;render();}else if(action==="week-next"){state.weekOffset++;render();}else if(action==="week-current"){state.weekOffset=0;render();}else if(action==="today"){state.weekOffset=0;state.view="calendar";render();}else if(action==="preview")toast("A página pública será disponibilizada após a implementação do backend.");});
document.addEventListener("change",e=>{if(e.target.id==="calendarProfessional"){state.calendarProfessional=e.target.value;render();}});
document.addEventListener("input",e=>{if(e.target.id==="search"){state.query=e.target.value;const pos=e.target.selectionStart;render();const input=document.getElementById("search");input?.focus();input?.setSelectionRange(pos,pos);}});
document.addEventListener("submit",e=>{if(e.target.id!=="professionalExceptionForm")return;e.preventDefault();const f=e.target,date=f.elements.date.value,endDate=f.elements.endDate.value||date,professional=f.elements.professional.value,label=f.elements.label.value.trim();if(endDate<date){toast("A data final deve ser igual ou posterior à inicial.");return;}if(state.professionalExceptions.some(x=>x.professional===professional&&date<=(x.endDate||x.date)&&endDate>=x.date)){toast("Já existe uma ausência sobreposta para este profissional.");return;}state.professionalExceptions.push({professional,date,endDate,label});persistDemoState();render();toast("Ausência adicionada à agenda.");});
document.addEventListener("click",e=>{const b=e.target.closest('[data-action="remove-prof-exception"]');if(!b)return;state.professionalExceptions.splice(Number(b.dataset.index),1);persistDemoState();render();});
document.getElementById("menuToggle").addEventListener("click",()=>document.getElementById("sidebar").classList.toggle("open"));
render();

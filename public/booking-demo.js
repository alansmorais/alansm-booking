(function(root){
  "use strict";
  const STORAGE_KEY="alansm-booking-demo-v1";
  const fallbackServices=[
    {id:"corte",name:"Corte masculino",duration:30,price:"R$ 45,00"},
    {id:"barba",name:"Corte + barba",duration:60,price:"R$ 75,00"},
    {id:"degrade",name:"Degradê",duration:40,price:"R$ 55,00"},
    {id:"sobrancelha",name:"Sobrancelha",duration:20,price:"R$ 25,00"}
  ];
  const fallbackProfessionals=["Rafael Costa","Bruno Lima","Ana Martins"];
  const fallbackSchedules={
    "Rafael Costa":{1:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],2:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],3:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],4:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],5:[{start:"09:00",end:"18:00",breaks:[{start:"12:00",end:"13:00"}]}],6:[{start:"09:00",end:"14:00",breaks:[]}]},
    "Bruno Lima":{1:[{start:"10:00",end:"18:00",breaks:[{start:"13:00",end:"14:00"}]}],2:[{start:"10:00",end:"18:00",breaks:[{start:"13:00",end:"14:00"}]}],3:[{start:"10:00",end:"18:00",breaks:[{start:"13:00",end:"14:00"}]}],4:[{start:"10:00",end:"18:00",breaks:[{start:"13:00",end:"14:00"}]}],5:[{start:"10:00",end:"18:00",breaks:[{start:"13:00",end:"14:00"}]}]},
    "Ana Martins":{1:[{start:"09:00",end:"16:00",breaks:[]}],2:[{start:"09:00",end:"16:00",breaks:[]}],3:[{start:"09:00",end:"16:00",breaks:[]}],4:[{start:"09:00",end:"16:00",breaks:[]}],5:[{start:"09:00",end:"16:00",breaks:[]}],6:[{start:"09:00",end:"14:00",breaks:[]}]}
  };
  const fallbackAppointments=[];
  const minutes=t=>{const [h,m]=String(t||"0:0").split(":").map(Number);return h*60+m;};
  const dateKey=date=>{const d=new Date(date+"T12:00:00");return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");};
  function readWorkspace(){
    try{const saved=JSON.parse(root.localStorage?.getItem(STORAGE_KEY)||"null");return saved?.version===1&&saved.data&&typeof saved.data==="object"?saved.data:null;}catch(_){return null;}
  }
  function config(){
    const data=readWorkspace();
    if(!data)return {services:fallbackServices,professionals:fallbackProfessionals,schedules:fallbackSchedules,companySchedule:null,appointments:fallbackAppointments,blocks:[],exceptions:[],professionalExceptions:[],clients:[],data:null};
    const services=(data.services||[]).filter(s=>s&&s[3]!=="Inativo").map((s,i)=>({id:"service-"+i,name:s[0],duration:Number(s[1]),price:s[2],image:s[4]||""})).filter(s=>s.name&&s.duration>0);
    const professionals=(data.professionals||[]).filter(p=>p&&p[3]!=="Inativo").map(p=>p[0]);
    return {services,professionals,schedules:data.professionalSchedules||{},companySchedule:data.companySchedule||{},appointments:data.appointments||[],blocks:data.blocks||[],exceptions:data.exceptions||[],professionalExceptions:data.professionalExceptions||[],clients:data.clients||[],data};
  }
  function getService(id){return config().services.find(s=>s.id===id)||null;}
  function isException(date,c){return c.exceptions.some(x=>x.date===date)||c.professionalExceptions.some(x=>x.date<=date&&(x.endDate||x.date)>=date);}
  function slots({date,professional,duration,appointments}){
    const c=config();if(!date||!professional||!Number.isFinite(Number(duration))||Number(duration)<=0||isException(date,c))return[];
    const day=new Date(date+"T12:00:00").getDay(),proPeriods=c.schedules[professional]?.[day]||[];
    const companyPeriods=c.companySchedule?.[day];
    const periods=companyPeriods?proPeriods.filter(p=>companyPeriods.some(cp=>p.start>=cp.start&&p.end<=cp.end)):proPeriods;
    const allAppointments=appointments||c.appointments,out=[];
    for(const p of periods){for(let start=minutes(p.start);start+Number(duration)<=minutes(p.end);start+=30){
      const end=start+Number(duration),onBreak=(p.breaks||[]).some(b=>start<minutes(b.end)&&minutes(b.start)<end);
      const occupied=allAppointments.some(a=>a.status!=="Cancelado"&&a.professional===professional&&a.date===date&&start<minutes(a.time)+Number(a.duration)&&minutes(a.time)<end);
      const blocked=c.blocks.some(b=>(!b.professional||b.professional===professional)&&b.date===date&&start<minutes(b.end)&&minutes(b.start)<end);
      if(!onBreak&&!occupied&&!blocked)out.push(String(Math.floor(start/60)).padStart(2,"0")+":"+String(start%60).padStart(2,"0"));
    }}
    return [...new Set(out)].sort();
  }
  function saveBooking({name,email,phone,serviceId,professional,date,time}){
    const c=config(),service=c.services.find(s=>s.id===serviceId);
    if(!c.data)throw new Error("O painel ainda não foi aberto neste navegador. A página está usando dados de demonstração.");
    if(!service||!c.professionals.includes(professional))throw new Error("Serviço ou profissional não disponível.");
    if(!slots({date,professional,duration:service.duration}).includes(time))throw new Error("Este horário acabou de ficar indisponível. Escolha outro horário.");
    const appointments=[...c.appointments,{date,time,duration:service.duration,name,service:service.name,professional,status:"Pendente",source:"online-demo",email,phone}];
    const clients=[...c.clients];const found=clients.findIndex(x=>String(x[0]).toLowerCase()===name.toLowerCase());
    const nextClient=[name,phone,found>=0?(clients[found][2]||"0 visitas"):"1 visita",email];
    if(found>=0)clients[found]=nextClient;else clients.push(nextClient);
    const data={...c.data,appointments,clients};
    root.localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,savedAt:new Date().toISOString(),data}));
    return {service,appointment:appointments[appointments.length-1]};
  }
  const api={get services(){return config().services;},get professionals(){return config().professionals;},slots,getService,dateKey,readWorkspace,saveBooking};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.BookingDemo=api;
})(typeof globalThis!=="undefined"?globalThis:this);

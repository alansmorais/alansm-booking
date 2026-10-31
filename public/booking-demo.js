(function(root){
  "use strict";
  const services=[
    {id:"corte",name:"Corte masculino",duration:30,price:"R$ 45,00"},
    {id:"barba",name:"Corte + barba",duration:60,price:"R$ 75,00"},
    {id:"degrade",name:"Degradê",duration:40,price:"R$ 55,00"},
    {id:"sobrancelha",name:"Sobrancelha",duration:20,price:"R$ 25,00"}
  ];
  const professionals=["Rafael Costa","Bruno Lima","Ana Martins"];
  const schedules={
    "Rafael Costa":{1:["09:00","18:00"],2:["09:00","18:00"],3:["09:00","18:00"],4:["09:00","18:00"],5:["09:00","18:00"],6:["09:00","14:00"]},
    "Bruno Lima":{1:["10:00","18:00"],2:["10:00","18:00"],3:["10:00","18:00"],4:["10:00","18:00"],5:["10:00","18:00"]},
    "Ana Martins":{1:["09:00","16:00"],2:["09:00","16:00"],3:["09:00","16:00"],4:["09:00","16:00"],5:["09:00","16:00"],6:["09:00","14:00"]}
  };
  const breaks={"Rafael Costa":{1:["12:00","13:00"],2:["12:00","13:00"],3:["12:00","13:00"],4:["12:00","13:00"],5:["12:00","13:00"]},"Bruno Lima":{1:["13:00","14:00"],2:["13:00","14:00"],3:["13:00","14:00"],4:["13:00","14:00"],5:["13:00","14:00"]}};
  const demoAppointments=[{professional:"Rafael Costa",date:"",time:"09:00",duration:30},{professional:"Rafael Costa",date:"",time:"10:30",duration:60},{professional:"Bruno Lima",date:"",time:"11:00",duration:40}];
  const minutes=t=>{const [h,m]=t.split(":").map(Number);return h*60+m;};
  const dateKey=date=>{const d=new Date(date+"T12:00:00");return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");};
  function slots({date,professional,duration,appointments=[]}){
    if(!date||!professional||!Number.isFinite(Number(duration))||Number(duration)<=0)return[];
    const day=new Date(date+"T12:00:00").getDay(),hours=schedules[professional]?.[day];
    if(!hours)return[];
    const pause=breaks[professional]?.[day],out=[];
    for(let start=minutes(hours[0]);start+Number(duration)<=minutes(hours[1]);start+=30){
      const end=start+Number(duration),onBreak=pause&&start<minutes(pause[1])&&minutes(pause[0])<end;
      const occupied=appointments.some(a=>a.professional===professional&&a.date===date&&start<minutes(a.time)+Number(a.duration)&&minutes(a.time)<end);
      if(!onBreak&&!occupied)out.push(String(Math.floor(start/60)).padStart(2,"0")+":"+String(start%60).padStart(2,"0"));
    }
    return out;
  }
  function getService(id){return services.find(s=>s.id===id)||null;}
  const api={services,professionals,slots,getService,dateKey};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.BookingDemo=api;
})(typeof globalThis!=="undefined"?globalThis:this);

(function(root){
  const OPENING_HOURS={0:null,1:{start:"09:00",end:"18:00"},2:{start:"09:00",end:"18:00"},3:{start:"09:00",end:"18:00"},4:{start:"09:00",end:"18:00"},5:{start:"09:00",end:"18:00"},6:{start:"09:00",end:"14:00"}};
  const BREAKS={1:[{start:"12:00",end:"13:00"}],2:[{start:"12:00",end:"13:00"}],3:[{start:"12:00",end:"13:00"}],4:[{start:"12:00",end:"13:00"}],5:[{start:"12:00",end:"13:00"}],6:[]};
  const toMinutes=t=>{const [h,m]=String(t).split(":").map(Number);return h*60+m;};
  const toTime=n=>String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");
  const overlaps=(aStart,aEnd,bStart,bEnd)=>aStart<bEnd&&bStart<aEnd;
  function isAvailable({date,time,duration,professional,appointments,blocks=[]}){
    const day=new Date(date+"T12:00:00").getDay(),hours=OPENING_HOURS[day];
    if(!hours)return {ok:false,reason:"Fechado neste dia."};
    const start=toMinutes(time),end=start+Number(duration);
    if(start<toMinutes(hours.start)||end>toMinutes(hours.end))return {ok:false,reason:"Fora do horário de funcionamento."};
    if((BREAKS[day]||[]).some(b=>overlaps(start,end,toMinutes(b.start),toMinutes(b.end))))return {ok:false,reason:"Este horário coincide com o intervalo."};
    if(blocks.some(b=>b.date===date&&(!b.professional||b.professional===professional)&&overlaps(start,end,toMinutes(b.start),toMinutes(b.end))))return {ok:false,reason:"Horário bloqueado para este profissional."};
    if(appointments.some(a=>a.date===date&&a.professional===professional&&a.status!=="Cancelado"&&overlaps(start,end,toMinutes(a.time),toMinutes(a.time)+Number(a.duration))))return {ok:false,reason:"Este profissional já tem um agendamento neste horário."};
    return {ok:true,reason:"Disponível"};
  }
  function slots({date,duration,professional,appointments,blocks=[]}){
    const day=new Date(date+"T12:00:00").getDay(),hours=OPENING_HOURS[day];
    if(!hours)return [];
    const result=[];
    for(let start=toMinutes(hours.start);start+duration<=toMinutes(hours.end);start+=30){
      const time=toTime(start),check=isAvailable({date,time,duration,professional,appointments,blocks});
      result.push({time,available:check.ok,reason:check.reason});
    }
    return result;
  }
  function weekDates(anchor){
    const d=new Date(anchor+"T12:00:00"),day=(d.getDay()+6)%7;
    d.setDate(d.getDate()-day);
    return Array.from({length:7},(_,i)=>{const x=new Date(d);x.setDate(d.getDate()+i);return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0");});
  }
  const api={OPENING_HOURS,BREAKS,toMinutes,toTime,overlaps,isAvailable,slots,weekDates};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.BookingAvailability=api;
})(typeof globalThis!=="undefined"?globalThis:this);

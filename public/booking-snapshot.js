(function(root){
  "use strict";
  const slug=value=>String(value||"item").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"item";
  function assignRowId(row,index,prefix,position){
    if(!row[position])row[position]=prefix+"-"+slug(row[0])+(index?"-"+(index+1):"");
    return String(row[position]);
  }
  function ensureStableIds(state){
    if(!state||typeof state!=="object")throw new TypeError("Estado inválido.");
    (state.services||[]).forEach((row,i)=>assignRowId(row,i,"service",5));
    (state.professionals||[]).forEach((row,i)=>assignRowId(row,i,"professional",4));
    (state.clients||[]).forEach((row,i)=>assignRowId(row,i,"client",4));
    (state.appointments||[]).forEach((item,i)=>{if(!item.id)item.id="appointment-"+(i+1);});
    (state.blocks||[]).forEach((item,i)=>{if(!item.id)item.id="block-"+(i+1);});
    (state.exceptions||[]).forEach((item,i)=>{if(!item.id)item.id="exception-"+(i+1);});
    (state.professionalExceptions||[]).forEach((item,i)=>{if(!item.id)item.id="professional-exception-"+(i+1);});
    return state;
  }
  function active(value){return String(value||"Ativo").toLowerCase()!=="inativo";}
  function buildSnapshot(state,companyId){
    if(!companyId)throw new TypeError("companyId obrigatório.");
    ensureStableIds(state);
    const professionals=(state.professionals||[]).map(row=>({id:row[4],companyId,name:row[0],specialty:row[1]||"",active:active(row[3])}));
    const professionalByName=new Map(professionals.map(item=>[item.name,item.id]));
    const services=(state.services||[]).map(row=>({id:row[5],companyId,name:row[0],duration:Number(row[1]),price:row[2],active:active(row[3]),imageUrl:row[4]||""}));
    const serviceByName=new Map(services.map(item=>[item.name,item.id]));
    const schedules=professionals.map(pro=>({id:"schedule-"+pro.id,companyId,professionalId:pro.id,days:state.professionalSchedules?.[pro.name]||{},companyDays:state.companySchedule||{}}));
    const appointments=(state.appointments||[]).map((item,i)=>({
      ...item,id:item.id||"appointment-"+(i+1),companyId,
      serviceId:item.serviceId||serviceByName.get(item.service)||"",
      professionalId:item.professionalId||professionalByName.get(item.professional)||""
    }));
    const clients=(state.clients||[]).map((row,i)=>({id:row[4],companyId,name:row[0],phone:row[1]||"",visits:row[2]||"",email:row[3]||""}));
    const blocks=(state.blocks||[]).map((item,i)=>({ ...item,id:item.id||"block-"+(i+1),companyId,professionalId:item.professionalId||professionalByName.get(item.professional)||"" }));
    const exceptions=(state.exceptions||[]).map((item,i)=>({ ...item,id:item.id||"exception-"+(i+1),companyId }));
    const professionalExceptions=(state.professionalExceptions||[]).map((item,i)=>({ ...item,id:item.id||"professional-exception-"+(i+1),companyId,professionalId:item.professionalId||professionalByName.get(item.professional)||"" }));
    return {company:{id:companyId,companyId,name:state.companyName||"Empresa"},professionals,services,schedules,appointments,clients,blocks,exceptions,professionalExceptions};
  }
  const api={ensureStableIds,buildSnapshot};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.BookingSnapshot=Object.freeze(api);
})(typeof globalThis!=="undefined"?globalThis:this);

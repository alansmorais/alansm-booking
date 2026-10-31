(() => {
  "use strict";
  const api=window.BookingDemo;
  const form=document.getElementById("bookingForm");
  if(!api||!form)return;
  const today=new Date();
  const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  const dateInput=document.getElementById("bookingDate");
  dateInput.min=iso(today);dateInput.value=iso(today);
  const serviceRoot=document.getElementById("serviceOptions"),professional=document.getElementById("professional"),slotsRoot=document.getElementById("timeSlots");
  const indicators=[...document.querySelectorAll("[data-step-indicator]")];
  let selectedService="",selectedTime="",step=1;
  api.services.forEach(service=>{const b=document.createElement("button");b.type="button";b.className="service-option";b.dataset.service=service.id;b.innerHTML='<span><strong></strong><small></small></span><span class="service-price"></span>';b.querySelector("strong").textContent=service.name;b.querySelector("small").textContent=service.duration+" minutos";b.querySelector(".service-price").textContent=service.price;b.addEventListener("click",()=>{selectedService=service.id;serviceRoot.querySelectorAll("button").forEach(x=>x.classList.toggle("selected",x===b));form.querySelector('[data-step="1"] [data-next]').disabled=false;});serviceRoot.append(b);});
  api.professionals.forEach(name=>{const o=document.createElement("option");o.value=name;o.textContent=name;professional.append(o);});
  function selected(){return api.getService(selectedService);}
  function renderSlots(){
    selectedTime="";const service=selected(),date=dateInput.value;
    const available=api.slots({date,professional:professional.value,duration:service?.duration||0});
    slotsRoot.replaceChildren();document.querySelector('[data-step="2"] [data-next]').disabled=true;
    document.getElementById("slotHint").textContent=available.length?available.length+" horários disponíveis":"Sem horários para esta data";
    if(!available.length){const p=document.createElement("p");p.className="empty-slots";p.textContent="Não há horários disponíveis. Experimente outra data ou profissional.";slotsRoot.append(p);return;}
    available.forEach(time=>{const b=document.createElement("button");b.type="button";b.className="time-slot";b.textContent=time;b.addEventListener("click",()=>{selectedTime=time;slotsRoot.querySelectorAll("button").forEach(x=>x.classList.toggle("selected",x===b));document.querySelector('[data-step="2"] [data-next]').disabled=false;});slotsRoot.append(b);});
  }
  function summary(){const s=selected(),d=dateInput.value;return '<strong>Resumo do agendamento</strong><br>'+s.name+' · '+s.duration+' min · '+s.price+'<br>'+professional.value+'<br>'+new Date(d+"T12:00:00").toLocaleDateString("pt-BR")+' às '+selectedTime;}
  function showStep(next){step=next;form.querySelectorAll("[data-step]").forEach(x=>x.hidden=Number(x.dataset.step)!==step);indicators.forEach(x=>x.classList.toggle("active",Number(x.dataset.stepIndicator)<=step));if(step===2)renderSlots();if(step===3)document.getElementById("bookingSummary").innerHTML=summary();window.scrollTo({top:0,behavior:"smooth"});}
  form.addEventListener("click",e=>{const next=e.target.closest("[data-next]"),back=e.target.closest("[data-back]");if(next){if(step===1&&selectedService)showStep(2);else if(step===2&&selectedTime)showStep(3);}if(back)showStep(step-1);});
  [dateInput,professional].forEach(x=>x.addEventListener("change",renderSlots));
  form.addEventListener("submit",e=>{e.preventDefault();if(step!==3||!form.reportValidity())return;const data={name:document.getElementById("customerName").value.trim(),email:document.getElementById("customerEmail").value.trim(),phone:document.getElementById("customerPhone").value.trim()};document.getElementById("successSummary").innerHTML=summary()+"<br>"+data.name+" · "+data.email+" · "+data.phone;document.getElementById("successMessage").textContent="O fluxo foi concluído com sucesso na demonstração. Esta reserva não foi enviada nem guardada no painel da empresa.";showStep(4);});
})();

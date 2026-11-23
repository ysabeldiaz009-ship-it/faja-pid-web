'use strict';
// Contraste real/modelo. K y tau solo se utilizan tras su ingreso o estimacion explicita.
(function(){
 const $=id=>document.getElementById(id),panel=$('projectDataPanel'),mgr=window.fajaTrialManager,sel=$('cmpView');
 if(!panel||!mgr||!sel)return;
 const op=document.createElement('option');op.value='key';op.textContent='Lecturas y cálculo teórico';sel.insertBefore(op,sel.firstChild);
 const full=document.createElement('option');full.value='all';full.textContent='Todas las muestras';sel.appendChild(full);
 const again=document.createElement('button');again.id='trialNewSeries';again.type='button';again.textContent='Nueva serie';
 panel.querySelector('.trial-toolbar')?.append(again);
 again.addEventListener('click',()=>{if(mgr.newSeries())render()});
 const pages=document.createElement('div');pages.className='analysis-page';pages.hidden=true;
 pages.innerHTML='<button id="analysisPrev" type="button">Anterior</button><span id="analysisPageStatus">Página 1</span><button id="analysisNext" type="button">Siguiente</button>';
 const footer=$('cmpTableFooter');footer.parentElement.insertBefore(pages,footer);
 const oldRender=window.renderCompactResults;
 const card=$('cmpTableTitle')?.closest('.cmp-table-card'),modelPanel=document.createElement('div');
 modelPanel.id='analysisTheory';modelPanel.className='analysis-theory';
 modelPanel.innerHTML=[
  '<div class="analysis-theory-intro"><b>Cálculo teórico de primer orden</b>',
  '<small>y[k] = a·y[k−1] + K(1−a)·u[k−1], a = e<sup>−Δt/τ</sup>, u = PWM/100</small></div>',
  '<div class="analysis-theory-fields">',
  '<label>K (RPM/duty)<input id="analysisK" type="number" step="any" min="0" placeholder="Por identificar"></label>',
  '<label>τ (s)<input id="analysisTau" type="number" step="any" min="0.001" placeholder="Por identificar"></label>',
  '<button id="analysisCalculate" type="button">Calcular modelo</button>',
  '<button id="analysisEstimate" type="button">Usar estimación PWM</button>',
  '<button id="analysisExport" type="button" disabled>CSV real vs teórico</button></div>',
  '<div id="analysisTheoryStatus" class="analysis-theory-status" role="status">El modelo requiere K y τ. La consigna no se confunde con una predicción.</div>'
 ].join('');
 if(card){const h=card.querySelector('.card-heading');if(h)h.insertAdjacentElement('afterend',modelPanel);else card.insertBefore(modelPanel,card.firstChild)}
 const fmt=(v,n=1)=>Number.isFinite(v)?Number(v).toFixed(n):'—';
 const htmlRow=r=>'<tr>'+r.map(v=>'<td>'+v+'</td>').join('')+'</tr>';
 const time=(s,x)=>(x.ms-s[0].ms)/1000;
 const closest=(s,t)=>s.reduce((b,x)=>Math.abs(time(s,x)-t)<Math.abs(time(s,b)-t)?x:b,s[0]);
 let page=0,previousId=null,model=null;
 function headers(){
   $('cmpTableHead').innerHTML='<tr class="analysis-groups"><th colspan="2">Instante</th><th colspan="2">Datos reales</th><th colspan="4">Referencia y cálculo teórico</th></tr>'+
    '<tr>'+['Momento','t (s)','RPM medidas','PWM (%)','Referencia','RPM modelo','|Real−modelo|','|Ref.−real|'].map(x=>'<th>'+x+'</th>').join('')+'</tr>';
 }
 function theoretical(t){
   if(!model||!t?.samples?.length)return null;
   const s=t.samples,out=new Map();
   let y=Number(s[0].rpm),u=Number(s[0].pwm)/100;out.set(s[0],y);
   for(let i=1;i<s.length;i++){
     const dt=(s[i].ms-s[i-1].ms)/1000;
     if(!(dt>=0&&dt<=5)){y=NaN;out.set(s[i],y);continue}
     if(!Number.isFinite(y))y=Number(s[i].rpm);
     else {const aa=Math.exp(-dt/model.tau);y=aa*y+model.K*(1-aa)*u}
     out.set(s[i],y);u=Math.max(0,Math.min(1,Number(s[i].pwm)/100));
   }
   return out;
 }
 function moments(t){
   const s=t?.samples?.filter(x=>x.running&&!x.fault)||[];
   if(!s.length)return [];
   const m=window.fajaPerformance?.calc(t,{tolerance:Number($('performanceTolerance')?.value||2)})||{},marks=new Map();
   marks.set(s[0],'Inicio');
   if(Number.isFinite(m.firstReach))marks.set(closest(s,m.firstReach),'Primer alcance');
   marks.set(s.reduce((a,x)=>x.rpm>a.rpm?x:a,s[0]),'Pico RPM');
   if(Number.isFinite(m.settling))marks.set(closest(s,m.settling),'Establecimiento ±'+(m.tolerance||2)+' %');
   marks.set(s[s.length-1],'Última lectura');
   const set=new Set(marks.keys()),end=time(s,s[s.length-1]);
   for(const seconds of [0,.4,.8,1.2,1.6,2,2.5,3,4,5,6,8,10,12,15,18,20,25,30,35,40,45]){
     if(seconds<=end+.11)set.add(closest(s,seconds));
   }
   return [...set].sort((a,b)=>a.ms-b.ms).map(x=>({x,name:marks.get(x)||'Lectura'}));
 }
 function rows(t,entries){
   const s=t?.samples||[],p=theoretical(t),pid=t?.mode!=='PWM';
   return entries.map(({x,name})=>{
     const y=p?.get(x),rpm=Number(x.rpm),ref=Number(x.ref);
     return [name,fmt(time(s,x),2),fmt(rpm),fmt(Number(x.pwm)),
       pid?fmt(ref):'No aplica',fmt(y),Number.isFinite(y)?fmt(Math.abs(rpm-y)):'—',
       pid?fmt(Math.abs(rpm-ref)):'No aplica'];
   });
 }
 function note(t){
   if(!model){$('analysisTheoryStatus').textContent='Sin K y τ medidos: predicción pendiente. Puedes introducirlos o usar una estimación PWM preliminar.';return}
   const aa=Math.exp(-.1/model.tau),bb=model.K*(1-aa),p=theoretical(t);
   const err=t?.samples?.filter(x=>Number.isFinite(p?.get(x))).map(x=>Math.abs(x.rpm-p.get(x)))||[];
   const mae=err.length?err.reduce((a,b)=>a+b,0)/err.length:null;
   $('analysisTheoryStatus').textContent=model.source+' · G(z) = '+fmt(bb,4)+'z⁻¹/(1 − '+fmt(aa,4)+'z⁻¹), Ts=0,100 s. Predicción tabulada con Δt de telemetría'+(mae!==null?' · MAE '+fmt(mae,2)+' RPM':'');
 }
 function pwmCandidate(){
   return mgr.list().slice().reverse().find(t=>t.mode==='PWM'&&window.fajaPerformance?.calc(t)?.identificationStatus==='Estimación preliminar');
 }
 function render(){
   oldRender?.();
   const mode=sel.value,t=mgr.viewed(),trials=mgr.list();
   if(t?.id!==previousId){previousId=t?.id;page=0}
   panel.classList.toggle('is-compare-summary',mode==='trials');
   again.disabled=mgr.isActive()||!trials.length;
   $('cmpModelParams').hidden=true;
   modelPanel.hidden=!['key','all','model'].includes(mode);
   pages.hidden=mode!=='all';
   if(mode==='trials'){
     $('cmpTableHead').innerHTML='<tr>'+['Ensayo','Kp / Ki / Kd','Referencia','RPM final media','Error est.','Establecimiento','Sobreimpulso'].map(x=>'<th>'+x+'</th>').join('')+'</tr>';
     const tolerance=Number($('performanceTolerance')?.value||2);
     const r=trials.map(x=>{
       const m=window.fajaPerformance.calc(x,{tolerance}),isPWM=x.mode==='PWM';
       return [x.id,isPWM?'PWM fijo':[x.kp,x.ki,x.kd].join(' / '),isPWM?'No aplica':fmt(x.ref)+' RPM',
         fmt(m.steadyRpm)+' RPM',isPWM?'No aplica':fmt(m.steadyError,2)+' %',
         isPWM?'No aplica':Number.isFinite(m.settling)?fmt(m.settling,2)+' s':'No alcanzado',
         isPWM?'No aplica':fmt(m.overshoot,2)+' %'];
     });
     $('cmpRows').innerHTML=r.length?r.map(htmlRow).join(''):'<tr><td colspan="7">Aún no hay ensayos</td></tr>';
     $('cmpTableTitle').textContent='Comparación entre ensayos';
     $('cmpContext').textContent='Resumen de diferencias entre ensayos, separado del análisis matemático.';
     $('cmpCount').textContent=trials.length+' ensayos';
     footer.textContent='En PWM fijo la referencia no gobierna el motor: no se calcula sobreimpulso PID.';
   }else if(['key','all','model'].includes(mode)){
     headers();
     let entries=[];
     if(t){
       if(mode==='key')entries=moments(t);
       else if(mode==='all'){
         const count=30,total=Math.max(1,Math.ceil(t.samples.length/count));page=Math.min(page,total-1);
         entries=t.samples.slice(page*count,(page+1)*count).map(x=>({x,name:'Lectura'}));
         $('analysisPageStatus').textContent='Página '+(page+1)+' de '+total;
         $('analysisPrev').disabled=page===0;$('analysisNext').disabled=page===total-1;
       }else{
         const step=Math.max(1,Math.ceil(t.samples.length/25));
         entries=t.samples.filter((_,i)=>i%step===0).map(x=>({x,name:'Lectura'}));
       }
     }
     const r=rows(t,entries);
     $('cmpRows').innerHTML=r.length?r.map(htmlRow).join(''):'<tr><td colspan="8" class="cmp-empty">Sin registros</td></tr>';
     $('cmpTableTitle').textContent=(mode==='key'?'Lecturas y cálculo teórico':mode==='all'?'Registro completo':'Modelo vs medición')+' · '+(t?.id||'sin ensayo');
     $('cmpContext').textContent=mode==='key'?'Arranque, transitorio y régimen: lecturas reales junto al modelo calculado.':mode==='all'?'Todas las muestras, agrupadas en páginas de 30.':'Lecturas distribuidas durante el ensayo.';
     $('cmpCount').textContent=r.length+' visibles · '+(t?.samples.length||0)+' registradas';
     footer.textContent=model?'Predicción de primer orden con K y τ indicados: no es una medición.':'Las RPM teóricas requieren K y τ; la referencia es solo la consigna.';
     note(t);
   }
   $('analysisEstimate').disabled=!pwmCandidate();
 }
 $('analysisCalculate').addEventListener('click',()=>{
   const v=$('analysisK').value.trim(),w=$('analysisTau').value.trim(),K=Number(v),tau=Number(w);
   if(!v||!w||!Number.isFinite(K)||!Number.isFinite(tau)||K<=0||tau<=0){
     model=null;$('analysisExport').disabled=true;render();return;
   }
   model={K,tau,source:'K y τ ingresados; modelo por validar'};
   $('analysisExport').disabled=false;render();
 });
 $('analysisEstimate').addEventListener('click',()=>{
   const t=pwmCandidate();if(!t)return;
   const m=window.fajaPerformance.calc(t);
   $('analysisK').value=String(Number(m.modelK.toFixed(5)));$('analysisTau').value=String(Number(m.modelTau.toFixed(5)));
   model={K:m.modelK,tau:m.modelTau,source:'Estimación preliminar de '+t.id+' con PWM fijo; no validada'};
   $('analysisExport').disabled=false;render();
 });
 $('analysisExport').addEventListener('click',()=>{
   const t=mgr.viewed(),s=t?.samples||[],p=theoretical(t);if(!p||!s.length)return;
   const r=['ensayo,t_s,rpm_real,pwm_pct,referencia_rpm,rpm_modelo,error_modelo_rpm,K_rpm_por_duty,tau_s'];
   for(const x of s){const y=p.get(x);r.push([t.id,fmt(time(s,x),2),x.rpm,x.pwm,t.mode==='PWM'?'':x.ref,
     Number.isFinite(y)?fmt(y,4):'',Number.isFinite(y)?fmt(Math.abs(x.rpm-y),4):'',model.K,model.tau].join(','))}
   const blob=new Blob(['\ufeff'+r.join('\r\n')],{type:'text/csv;charset=utf-8'});
   const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;
   link.download='Faja_PID_'+t.id+'_real_vs_modelo.csv';document.body.append(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1500);
 });
 window.renderCompactResults=render;
 $('analysisPrev').addEventListener('click',()=>{page=Math.max(0,page-1);render()});
 $('analysisNext').addEventListener('click',()=>{page++;render()});
 sel.value='key';sel.addEventListener('change',()=>{page=0;render()});
 $('performanceTolerance')?.addEventListener('change',render);
 $('trialSelect')?.addEventListener('change',()=>{page=0;render()});
 render();
})();
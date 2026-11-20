'use strict';
/* Faja PID Web 2.3: comparacion de consigna, medida y modelo teorico.
   No envia comandos al ESP32. No sustituye la identificacion experimental. */
(function(){
 const e=id=>document.getElementById(id);
 let model={K:150,tau:.5,pred:0,lastMs:null,previousDuty:0};
 let history=[],runningCount=0,absSum=0,absSqSum=0,lastRender=0,hasData=false;
 const fmt=(x,d=1)=>Number.isFinite(x)?x.toFixed(d):'—';
 const pct=(delta,den)=>Math.abs(den)>0.1?100*Math.abs(delta)/Math.abs(den):NaN;
 const put=(id,v)=>{const n=e(id);if(n)n.textContent=v;};
 function render(){
  if(!history.length)return;
  const x=history[history.length-1];
  put('cmpRpmReal',fmt(x.rpm));
  put('cmpReference',fmt(x.ref));
  put('cmpRpmModel',fmt(x.pred));
  put('cmpTrackPct',x.active?fmt(x.errorRefPct):'—');
  put('cmpModelPct',x.active?fmt(x.errorModelPct):'—');
  put('cmpAbsTrack',x.active?fmt(x.absRef)+' RPM':'— RPM');
  put('cmpAbsModel',x.active?fmt(x.absModel)+' RPM':'— RPM');
  put('cmpMAE',runningCount?fmt(absSum/runningCount)+' RPM':'— RPM');
  put('cmpRMSE',runningCount?fmt(Math.sqrt(absSqSum/runningCount))+' RPM':'— RPM');
  put('cmpRunSamples',String(runningCount));
  put('cmpState',x.fault?'Falla del sensor':x.running?'En marcha':'Detenido');
  put('compareSource',online?'Datos USB recibidos · Modelo sin calibrar':'Datos anteriores · USB desconectado');
  put('cmpCount',history.length+' lecturas · últimas 9 visibles');
  const visible=history.slice(-9).reverse();
  const cells=v=>'<td>'+v+'</td>';
  e('cmpRows').innerHTML=visible.map(item=>{
    const active=item.active;
    const p=active?fmt(item.errorRefPct):'—';
    const q=active?fmt(item.errorModelPct):'—';
    return '<tr>'+[
      fmt(item.time,2),fmt(item.ref),fmt(item.rpm),fmt(item.pred),fmt(item.pwm),
      active?fmt(item.absRef):'—',p,active?fmt(item.absModel):'—',q
    ].map(cells).join('')+'</tr>';
  }).join('');
 }
 function reset(){
  model.pred=0;model.lastMs=null;model.previousDuty=0;
  history=[];runningCount=0;absSum=0;absSqSum=0;lastRender=0;hasData=false;
  for(const id of ['cmpRpmReal','cmpReference','cmpRpmModel','cmpTrackPct','cmpModelPct'])put(id,'—');
  for(const id of ['cmpAbsTrack','cmpAbsModel','cmpMAE','cmpRMSE'])put(id,'— RPM');
  put('cmpRunSamples','0');put('cmpCount','Sin muestras');
  put('cmpState',online?'Esperando nueva muestra':'Sin conexión');
  put('compareSource','Esperando datos USB · Modelo sin calibrar');
  e('cmpRows').innerHTML='<tr><td colspan="9" class="cmp-empty">Esperando muestras del ESP32. Ningún valor se ha inventado.</td></tr>';
 }
 function applyModel(){
  const K=Number(e('cmpK').value),tau=Number(e('cmpTau').value);
  if(!e('cmpK').value.trim()||!e('cmpTau').value.trim()||!Number.isFinite(K)||!Number.isFinite(tau)||K<0||tau<=0){
    put('compareSource','Valores inválidos: K ≥ 0 y τ > 0.');
    return;
  }
  model.K=K;model.tau=tau;
  reset();
  put('compareSource','Modelo actualizado · historial reiniciado');
 }
 e('cmpApply').addEventListener('click',applyModel);
 e('cmpClear').addEventListener('click',reset);
 e('cmpFromMath').addEventListener('click',()=>{
  if(e('mathTemplate').value!=='first'){
    put('compareSource','Selecciona «Primer orden» en Proyecto > Ecuaciones.');
    return;
  }
  const k=e('f_K'),tau=e('f_tau');
  if(!k||!tau)return;
  e('cmpK').value=k.value;e('cmpTau').value=tau.value;
  applyModel();
 });
 e('cmpExport').addEventListener('click',()=>{
  if(!history.length){put('compareSource','Sin datos para exportar.');return;}
  const headers='t_s,referencia_rpm,rpm_medidas,rpm_modelo,pwm_pct,error_ref_rpm,error_ref_pct,error_modelo_rpm,error_modelo_pct,marcha,falla';
  const rows=history.map(x=>[
    x.time,x.ref,x.rpm,x.pred,x.pwm,x.active?x.absRef:'',x.active&&Number.isFinite(x.errorRefPct)?x.errorRefPct:'',
    x.active?x.absModel:'',x.active&&Number.isFinite(x.errorModelPct)?x.errorModelPct:'',x.running,x.fault
  ].join(','));
  const csv='\ufeff'+[headers,...rows].join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;
  a.download='Faja_PID_comparacion_'+new Date().toISOString().slice(0,19).replace(/:/g,'-')+'.csv';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  put('compareSource',history.length+' filas exportadas · CSV local');
 });
 reset();
 const originalReceive=receive;
 receive=function(line){
  originalReceive(line);
  const raw=line.trim().split(',');
  if(raw[0]!=='DATA'||raw.length<8)return;
  const v=raw.slice(1,8).map(Number);
  if(v.some(x=>!Number.isFinite(x)))return;
  const [ms,ref,rpm,_error,pwm,running,fault]=v;
  if(model.lastMs!==null&&(ms<model.lastMs||ms-model.lastMs>5000)){
    // Reset del firmware o salto de telemetría: una respuesta corrida no es comparable.
    model.lastMs=null;model.pred=0;model.previousDuty=0;
    runningCount=0;absSum=0;absSqSum=0;history=[];
  }
  if(model.lastMs!==null){
    const dt=(ms-model.lastMs)/1000;
    const a=Math.exp(-dt/model.tau);
    model.pred=a*model.pred + model.K*(1-a)*model.previousDuty;
  }
  const active=(running===1&&fault===0);
  const duty=active?Math.max(0,Math.min(1,pwm/100)):0;
  model.lastMs=ms;
  model.previousDuty=duty;
  const absRef=Math.abs(ref-rpm);
  const absModel=Math.abs(rpm-model.pred);
  const errorRefPct=pct(absRef,ref);
  const errorModelPct=pct(absModel,model.pred);
  const row={time:ms/1000,ref,rpm,pred:model.pred,pwm,running,fault,active,absRef,absModel,errorRefPct,errorModelPct};
  history.push(row);
  if(history.length>10000)history.shift();
  if(active){runningCount++;absSum+=absModel;absSqSum+=absModel*absModel;}
  // Re-render at most 4 Hz; telemetry and numeric model update on every DATA packet.
  if(Date.now()-lastRender>250){
    lastRender=Date.now();
    render();
  }
 };
 // Exposes a read-only QA result to our isolated browser test, not part of the control protocol.
 window.fajaComparisonStatus=()=>({count:history.length,modelRpm:model.pred,liveRpm:history.length?history[history.length-1].rpm:null,trackingPct:history.length?history[history.length-1].errorRefPct:null,mae:runningCount?absSum/runningCount:null});
})();
'use strict';
/* Presentación compacta de Ingeniería / Resultados. No altera el protocolo ESP32. */
(function(){
const id=x=>document.getElementById(x);
const panel=id('projectDataPanel'),compare=id('comparisonScreen');
const samples=()=>window.fajaSamples||[];
const fmt=(n,d=1)=>Number.isFinite(n)?Number(n).toFixed(d):'—';
const state={mode:'reference',modelApplied:false};
window.fajaModelApplied=false;

const srcDiag=document.querySelector('.log-workspace');
const diagSlot=id('cmpDeviceLogSlot');
if(srcDiag){diagSlot.appendChild(srcDiag);srcDiag.classList.add('compact-diagnostic-log');}
const slot=id('csvActionSlot');
slot.appendChild(id('saveCsv'));
id('saveCsv').textContent='Exportar CSV';
id('saveCsv').title='Exportar todas las muestras reales del ensayo y resultados disponibles';
const resetAction=id('cmpClear');
resetAction.title='Borrar las muestras del ensayo (motor detenido)';
id('clearData').hidden=true;
id('cmpExport').hidden=true;
id('cmpFromMath').hidden=true;
const diagMeta=id('engMeta');
if(diagMeta){diagSlot.insertAdjacentElement('afterbegin',diagMeta);diagMeta.classList.add('compact-meta')}
const infoLine=document.createElement('span');
infoLine.className='compact-measurement';
infoLine.textContent='Ts = 0,100 s (firmware) · 1 marca/vuelta';
const variables=document.querySelector('.eng-plots .eng-mode-title');
if(variables)variables.append(infoLine);
const spec=document.querySelector('.spec-strip');
if(spec)spec.hidden=true;
id('serialDiagnostic').hidden=true;

const headings={
 reference:['Referencia vs medición','Comparación directa de consigna y velocidad medida.','t (s)','Referencia (RPM)','Medición (RPM)','Δ (RPM)','Error (%)'],
 model:['Modelo vs medición','Modelo de primer orden: ingresar K y τ identificados experimentalmente y aplicar.','t (s)','Medición (RPM)','Modelo (RPM)','Δ (RPM)','Error (%)'],
 raw:['Datos del ensayo','Valores registrados por el ESP32.','t (s)','Ref. (RPM)','RPM real','PWM (%)','Error (RPM)','Marcha'],
 trials:['Comparación entre ensayos','Resumen de los ensayos realizados.','Ensayo','Consigna RPM','RPM tramo final','Error (%)','Pico RPM','Duración (s)','Muestras'],
 sensor:['Diagnóstico del sensor','Información diagnóstica disponible con firmware V5.','t (s)','RPM crudas','Edad pulso (ms)','Periodo (ms)','Pulsos']
};
const col=x=>'<td>'+x+'</td>';
const th=x=>'<th>'+x+'</th>';
function makeRows(mode){
 const all=samples();
 if(!all.length&&mode!=='trials')return null;
 const recent=all.slice(-15).reverse();
 if(mode==='trials')return window.fajaTrialManager?.list().map(t=>{const run=t.samples.filter(x=>x.running&&!x.fault);const tail=run.slice(-Math.max(1,Math.ceil(run.length*.10)));const avg=tail.length?tail.reduce((a,b)=>a+b.rpm,0)/tail.length:NaN;const peak=run.length?run.reduce((max,x)=>Math.max(max,x.rpm),-Infinity):NaN;const dur=t.samples.length>1?(t.samples[t.samples.length-1].ms-t.samples[0].ms)/1000:0;return[t.id,fmt(t.ref),fmt(avg),Number.isFinite(avg)&&t.ref>0?fmt(Math.abs(avg-t.ref)/t.ref*100):'—',fmt(peak),fmt(dur),String(t.samples.length)]})||[];
 if(mode==='reference')return recent.map(r=>[fmt(r.ms/1000,2),fmt(r.ref),fmt(r.rpm),r.running&&!r.fault?fmt(Math.abs(r.ref-r.rpm)):'—',r.running&&!r.fault&&Math.abs(r.ref)>.1?fmt(100*Math.abs(r.ref-r.rpm)/Math.abs(r.ref)):'—']);
 if(mode==='model')return recent.filter(r=>r.modelApplied&&Number.isFinite(r.pred)).map(r=>[fmt(r.ms/1000,2),fmt(r.rpm),fmt(r.pred),r.running&&!r.fault?fmt(Math.abs(r.rpm-r.pred)):'—',r.running&&!r.fault&&Math.abs(r.pred)>.1?fmt(100*Math.abs(r.rpm-r.pred)/Math.abs(r.pred)):'—']);
 if(mode==='raw')return recent.map(r=>[fmt(r.ms/1000,2),fmt(r.ref),fmt(r.rpm),fmt(r.pwm),fmt(r.error),r.running?'Sí':'No']);
 return recent.filter(r=>Number.isFinite(r.pulseCount)).map(r=>[fmt(r.ms/1000,2),fmt(r.rawRpm),fmt(r.pulseAgeMs,0),fmt(r.pulsePeriodMs,0),fmt(r.pulseCount,0)]);
}
function update(){
 const mode=headings[state.mode]?state.mode:'reference', parts=headings[mode],rows=makeRows(mode);
 const needModel=mode==='model';
 const storedModel=samples().some(x=>x.modelApplied&&Number.isFinite(x.pred));
 id('cmpModelParams').hidden=!needModel;
 id('cmpTableTitle').textContent=parts[0];
 const note=(needModel&&!state.modelApplied&&!storedModel)?'Modelo pendiente: ingresa K y τ medidos y pulsa «Aplicar modelo».':parts[1];
 id('cmpContext').textContent=note;
 id('cmpTableHead').innerHTML='<tr>'+parts.slice(2).map(th).join('')+'</tr>';
 id('cmpTableFooter').textContent=needModel?'Modelo matemático aplicado solo a muestras posteriores a su configuración.':'Valores del ensayo registrados por el ESP32.';
 id('cmpMetricTrack').hidden=mode==='sensor'||mode==='trials';
 id('cmpMetricModel').hidden=mode!=='model'||(!state.modelApplied&&!storedModel);
 id('cmpMetricMAE').hidden=mode!=='model'||(!state.modelApplied&&!storedModel);
 id('cmpMetricRMSE').hidden=mode!=='model'||(!state.modelApplied&&!storedModel);
 const total=samples().length;
 const valid=samples().filter(x=>x.running&&!x.fault);
 const curr=valid[valid.length-1];
 const modelErr=valid.filter(x=>x.modelApplied&&Number.isFinite(x.pred));
 id('cmpAbsTrack').textContent=curr?fmt(Math.abs(curr.ref-curr.rpm))+' RPM':'— RPM';
 id('cmpAbsModel').textContent=modelErr.length?fmt(Math.abs(modelErr[modelErr.length-1].rpm-modelErr[modelErr.length-1].pred))+' RPM':'— RPM';
 id('cmpMAE').textContent=modelErr.length?fmt(modelErr.reduce((s,x)=>s+Math.abs(x.rpm-x.pred),0)/modelErr.length)+' RPM':'— RPM';
 id('cmpRMSE').textContent=modelErr.length?fmt(Math.sqrt(modelErr.reduce((s,x)=>s+Math.pow(x.rpm-x.pred,2),0)/modelErr.length))+' RPM':'— RPM';
 id('cmpRunSamples').textContent=String(valid.length);
 id('cmpState').textContent=window.fajaTrialManager?.isActive()?'En marcha':total?'Detenido':'Sin ensayos';
 id('cmpCount').textContent=mode==='trials'?(window.fajaTrialManager?.list().length||0)+' ensayos':total+' muestras';
 id('cmpSampleTag').textContent=total+' registros';
 const sec=total>1?(samples()[total-1].ms-samples()[0].ms)/1000:0;
 id('cmpCompactCount').textContent=total+' muestras · '+fmt(Math.max(0,sec),1)+' s';
 let msg='Esperando mediciones del ESP32.';
 if(needModel&&!state.modelApplied&&!storedModel)msg='Primero aplica un modelo sustentado con K y τ.';
 else if(mode==='sensor'&&total&&(!rows||!rows.length))msg='Aún no hay telemetría META del sensor.';
 else if(needModel&&total&&(!rows||!rows.length))msg='Esperando muestras tomadas después de aplicar el modelo.';
 id('cmpRows').innerHTML=rows&&rows.length&&(mode!=='model'||state.modelApplied||storedModel)
   ?rows.map(r=>'<tr>'+r.map(col).join('')+'</tr>').join('')
   :'<tr><td class="cmp-empty" colspan="'+(parts.length-2)+'">'+msg+'</td></tr>';
}
window.renderCompactResults=update;
id('cmpView').addEventListener('change',event=>{state.mode=event.target.value;update()});
id('cmpApply').addEventListener('click',()=>{
 const K=Number(id('cmpK').value),tau=Number(id('cmpTau').value);
 if(!id('cmpK').value.trim()||!id('cmpTau').value.trim()||!Number.isFinite(K)||!Number.isFinite(tau)||K<0||tau<=0)return;
 state.modelApplied=true;
 window.fajaModelApplied=true;
 id('cmpContext').textContent='Modelo configurado. Comenzando nuevas muestras de comparación.';
 update();
});
resetAction.addEventListener('click',()=>{
 if(window.fajaTrialManager){window.fajaTrialManager.discardSelected();return;}
 if(typeof last!=='undefined'&&last.run){id('cmpContext').textContent='Detén el motor antes de reiniciar.';return}
 id('clearData').click();
 state.modelApplied=false;
 window.fajaModelApplied=false;
 update();
});
const priorReceive=receive;
receive=function(line){priorReceive(line);if(line.startsWith('DATA,'))update()};
update();
})();
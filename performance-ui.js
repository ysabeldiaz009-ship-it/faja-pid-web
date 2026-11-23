'use strict';
(function(){
 const $=id=>document.getElementById(id);
 const num=(v,d=2,unit='')=>Number.isFinite(v)?Number(v).toFixed(d)+(unit?' '+unit:''):'No alcanzado';
 const body=$('projectDataPanel');
 const panel=document.createElement('section');panel.className='performance-panel';
 panel.innerHTML=[
 '<div class="performance-head"><strong>Desempeño del ensayo</strong>',
 '<label>Banda de establecimiento <select id="performanceTolerance"><option value="2">±2 %</option><option value="5">±5 %</option></select></label></div>',
 '<div class="performance-grid">',
 '<div><span>Subida 10–90 %</span><strong id="perfRise">—</strong></div>',
 '<div><span>Primer alcance</span><strong id="perfFirst">—</strong></div>',
 '<div><span>Establecimiento</span><strong id="perfSettle">—</strong></div>',
 '<div><span>Sobreimpulso</span><strong id="perfPeak">—</strong></div>',
 '<div><span>Error estacionario</span><strong id="perfSteady">—</strong></div>',
 '<div><span>PWM ≥ 98 %</span><strong id="perfSat">—</strong></div>',
 '</div><div class="performance-meta"><span id="performanceMethod">Seleccione un ensayo.</span><span>Resultados calculados desde lecturas reales</span></div>'
 ].join('');
 const slot=body.querySelector('.compare-layout');
 if(slot)body.querySelector('.inline-comparison').insertBefore(panel,slot);
 const group=document.createElement('section');group.className='trial-inputs';
 group.innerHTML=[
 '<details><summary>Condiciones del ensayo <span>datos medidos e ingresados</span></summary><div class="trial-input-row">',
 '<label>Alimentación medida (V) <input id="trialSupplyV" type="number" min="0" step="0.01" placeholder="Opcional"></label>',
 '<label>Condición de carga <select id="trialLoad"><option value="Sin carga">Sin carga</option><option value="Carga aplicada">Carga aplicada</option><option value="Otra condición">Otra condición</option></select></label>',
 '<label>Observación breve <input id="trialNotes" maxlength="90" placeholder="Opcional"></label>',
 '</div></details>'].join('');
 const monitor=$('projectMonitorPanel').querySelector('.controls-workspace');
 monitor.appendChild(group);
 const tiny=document.createElement('span');tiny.className='measurement-hint';tiny.textContent='Ts controlador = 0,100 s · RPM/PWM: lecturas ESP32 · Kp/Ki/Kd y consigna: editables';
 const plotHeading=$('projectMonitorPanel').querySelector('.eng-plots .eng-mode-title');
 if(plotHeading)plotHeading.append(tiny);
 const oldRender=window.renderCompactResults;
 function refresh(){
   oldRender?.();
   const trial=window.fajaTrialManager?.viewed();
   const p=window.fajaPerformance?.calc(trial,{tolerance:Number($('performanceTolerance').value)});
   if(!p||!p.samples){
     for(const id of ['perfRise','perfFirst','perfSettle','perfPeak','perfSteady','perfSat'])$(id).textContent='—';
     $('performanceMethod').textContent='Sin muestras de ensayo.';
     return;
   }
   const names=panel.querySelectorAll('.performance-grid span');
   const standard=['Subida 10–90 %','Primer alcance','Establecimiento','Sobreimpulso','Error estacionario','PWM ≥ 98 %'];
   if(trial.mode==='PWM'){
     const titles=['RPM media final','PWM aplicado','K estimada','τ estimada','Identificación','Duración'];
     titles.forEach((s,i)=>{if(names[i])names[i].textContent=s});
     $('perfRise').textContent=num(p.steadyRpm,1,'RPM');
     $('perfFirst').textContent=num(trial.samples[0]?.pwm,1,'%');
     $('perfSettle').textContent=num(p.modelK,2,'RPM/duty');
     $('perfPeak').textContent=num(p.modelTau,2,'s');
     $('perfSteady').textContent=p.identificationStatus||'Pendiente';
     $('perfSat').textContent=num(p.duration,1,'s');
     $('performanceMethod').textContent=trial.id+' · PWM fijo / lazo abierto · K y τ son estimaciones preliminares a validar; no se calculan sobreimpulso ni error PID.';
     return;
   }
   standard.forEach((s,i)=>{if(names[i])names[i].textContent=s});
   $('perfRise').textContent=num(p.rise,2,'s');
   $('perfFirst').textContent=num(p.firstReach,2,'s');
   $('perfSettle').textContent=num(p.settling,2,'s');
   $('perfPeak').textContent=num(p.overshoot,2,'%');
   $('perfSteady').textContent=num(p.steadyError,2,'%');
   $('perfSat').textContent=num(p.saturationSec,2,'s');
   $('performanceMethod').textContent=trial.id+' · '+p.samples+' muestras · '+num(p.duration,1,'s')+' · Intervalo mediano: '+num(p.samplingMedian,2,'s')+(p.status.startsWith('Referencia variable')?' · '+p.status:'')+(trial.mode==='PWM'?' · K preliminar: '+num(p.modelK,2,'RPM/duty')+' · τ preliminar: '+num(p.modelTau,2,'s'):'');
 }
 window.renderCompactResults=refresh;
 $('performanceTolerance').addEventListener('change',refresh);
 const prior=window.renderCompactResults;
 window.renderCompactResults=function(){
   prior();
   if($('cmpView').value!=='trials')return;
   const th=['Ensayo','Referencia','RPM final','Error est. %','Subida s','Establecimiento s','Sobreimpulso %','PWM ≥98 % s'];
   $('cmpTableHead').innerHTML='<tr>'+th.map(x=>'<th>'+x+'</th>').join('')+'</tr>';
   const trials=window.fajaTrialManager?.list()||[];
   $('cmpRows').innerHTML=trials.length?trials.map(t=>{
      const m=window.fajaPerformance.calc(t,{tolerance:Number($('performanceTolerance').value)});
      return '<tr>'+[t.id,num(m.ref,1),num(m.steadyRpm,1),num(m.steadyError,2),num(m.rise,2),num(m.settling,2),num(m.overshoot,2),num(m.saturationSec,2)].map(x=>'<td>'+x+'</td>').join('')+'</tr>';
   }).join(''):'<tr><td colspan="8" class="cmp-empty">Aún no hay ensayos para comparar.</td></tr>';
 };
 window.fajaRunConditions=()=>({
   supplyV:$('trialSupplyV').value.trim()?Number($('trialSupplyV').value):null,
   load:$('trialLoad').value,
   notes:$('trialNotes').value.trim()
 });
 window.fajaMetricTolerance=()=>Number($('performanceTolerance').value);
 refresh();
})();
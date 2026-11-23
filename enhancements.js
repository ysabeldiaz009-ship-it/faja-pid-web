'use strict';
/* FAJA PID WEB 2.4 - mejoras no destructivas sobre V2.3.
   HMI visual: emergencia software NO equivale a seccionador físico.
   Solo se muestran como medidos los datos que llegan por USB. */
(function(){
const $=id=>document.getElementById(id);
const comparison=$('comparisonScreen'),data=$('projectDataPanel'),plant=$('plantScreen');
data.insertBefore(comparison,data.firstElementChild);
comparison.hidden=false;
comparison.classList.remove('screen','workspace');
comparison.classList.add('inline-comparison');
$('projectDataTab').textContent='03 · Resultados y diagnóstico';
const diag=document.createElement('p');diag.id='engMeta';diag.style.cssText='font-size:11px;color:#b0d4e5;margin:12px 0 4px';diag.textContent='Telemetría V5: esperando datos META del sensor.';
$('projectDataPanel').appendChild(diag);
$('comparisonTab').hidden=true;

const originalPlant=Array.from(plant.children);
const legacy=document.createElement('div'); legacy.id='plantLegacy';legacy.hidden=true;
originalPlant.forEach(n=>legacy.appendChild(n));
plant.appendChild(legacy);
const hmi=document.createElement('div');hmi.className='hmi-board';
hmi.innerHTML=`
<div class="hmi-head"><div><span class="hmi-overline">SISTEMA DE TRANSPORTE · LT-01</span><h2>Faja transportadora <span class="hmi-heading-chip">PANEL DE OPERACIÓN</span></h2><small class="hmi-subtitle">Visualización y mando del motorreductor ESP32</small></div><div class="hmi-status-unit"><span>ESTADO DEL EQUIPO</span><strong id="hmiStatus" class="hmi-state">SIN DATOS</strong></div></div>
<div class="hmi-grid">
 <div class="hmi-process">
   <div class="hmi-process-head"><b>01 / SINÓPTICO DE LA LÍNEA</b><span id="hmiMotion">FAJA DETENIDA</span></div><div class="hmi-process-description">TRANSPORTADOR LT-01 <span>SENTIDO DE AVANCE →</span></div>
   <div id="hmiBelt" class="hmi-belt"><div class="hmi-belt-track"></div><div class="hmi-roller l"></div><div class="hmi-roller r"></div><div class="hmi-support left"></div><div class="hmi-support right"></div><div class="hmi-drive-unit"><span class="hmi-motor-icon">M</span><small>MOTOR</small></div><div class="hmi-sensor-unit"><i></i><span>SENSOR</span></div><div class="hmi-belt-support-base"></div></div><div class="hmi-line-status"><span><i id="hmiPilotMotor" class="status-lamp"></i> MOTOR</span><span><i id="hmiPilotSensor" class="status-lamp"></i> LECTURA</span><span><i id="hmiPilotAlarm" class="status-lamp"></i> ALARMA</span></div>
   <div class="hmi-vitals">
     <div class="hmi-vital primary"><span>VELOCIDAD DE FAJA</span><strong><span id="hmiSpeed">—</span><small>m/s</small></strong><em>RPM del sensor × perímetro del rodillo</em></div>
     <div class="hmi-vital"><span>VOLTAJE MEDIO IDEAL</span><strong><span id="hmiVoltage">—</span><small>V</small></strong><em>Estimación por PWM; no medido</em></div>
     <div class="hmi-vital"><span>TEMPERATURA</span><strong><span id="hmiTemperature">25,0</span><small>°C</small></strong><em>Simulación software; no medida</em></div>
   </div>

 </div>
 <aside class="hmi-ops">
   <div class="hmi-console-header">ESTACIÓN DE MANDO <strong>CP-01</strong></div><div class="hmi-panel-label">SEÑALIZACIÓN DE ESTADO</div><div class="hmi-annunciators"><span><i id="hmiPilotReady" class="pilot-light"></i> LISTO</span><span><i id="hmiPilotRunning" class="pilot-light"></i> MARCHA</span><span><i id="hmiPilotFault" class="pilot-light"></i> FALLA</span></div><div class="hmi-panel-label">MANDO DE OPERACIÓN</div>
   <div class="hmi-commands">
     <button id="hmiStart" class="hmi-btn start" aria-label="Iniciar motor"><span class="push-housing"><span class="push-face"><span class="push-symbol">I</span></span></span><span class="button-caption">INICIAR</span></button>
     <button id="hmiStop" class="hmi-btn stop" aria-label="Detener motor"><span class="push-housing"><span class="push-face"><span class="push-symbol">O</span></span></span><span class="button-caption">DETENER</span></button>
     <button id="hmiEstop" class="hmi-btn emergency" aria-label="Parada software con rearme"><span class="estop-plate"><span class="estop-collar"><span class="estop-head"></span></span></span><span class="button-caption">PARADA SOFTWARE</span><small>BLOQUEO / REARME</small></button>
   </div>
   <button id="hmiReset" class="hmi-reset" hidden>Rearmar parada software</button>
   <div class="hmi-panel-label">VELOCIDAD DE TRABAJO</div>
   <div class="hmi-presets">
     <button data-hmi-rpm="60"><i class="selector-led"></i><span>LENTA</span><small>01</small></button>
     <button data-hmi-rpm="110"><i class="selector-led"></i><span>MEDIA</span><small>02</small></button>
     <button data-hmi-rpm="150"><i class="selector-led"></i><span>RÁPIDA</span><small>03</small></button>
   </div>
   <div class="hmi-setpoint">Consigna equivalente: <b id="hmiTarget">—</b> <span>m/s</span></div>
   <div id="hmiMessage" class="hmi-message">Esperando comunicación del ESP32.</div>

 </aside>
</div>`;
plant.appendChild(hmi);

const controls=$('projectMonitorPanel').querySelector('.controls-workspace');
const engineering=document.createElement('div');engineering.className='eng-mode';
engineering.innerHTML=`
<div class="eng-mode-title"><b>Modo de ensayo</b><small>El cambio exige motor detenido</small></div>
<div class="eng-mode-choice">
 <label><input type="radio" name="engMode" value="PID" checked> PID · lazo cerrado</label>
 <label><input type="radio" name="engMode" value="PWM"> PWM fijo · lazo abierto</label>
</div>
<div class="eng-mode-fields">
 <label>Salida PWM (%)<input id="engFixedPwm" type="number" min="0" max="100" step="1" value="60"></label>
 <button id="engModeApply" type="button">Aplicar modo</button>
 <button id="engPwmApply" type="button">Aplicar PWM fijo</button>
</div>
<div class="eng-mode-status" id="engModeStatus">Modo V4/V5: esperando verificación del ESP32.</div>
<div class="eng-mode-title"><b>Configuración de medición</b><small>Solo para conversión y trazabilidad</small></div>
<div class="eng-mode-fields">
 <label>Rodillo motriz Ø (cm)<input id="engDiameter" type="number" step="0.1" min="0.1" placeholder="Medir"></label>
 <label>ID del ensayo<input id="engTestId" type="text" maxlength="32" value="E01"></label>
</div>
`;
controls.appendChild(engineering);
let confirmedMode='PID', emergency=false, lastTelemetry=null, lastTelemetryAt=0;
function notice(t){$('engModeStatus').textContent=t;$('hmiMessage').textContent=t}
window.fajaTestMetadata=()=>({mode:confirmedMode,kp:$('kp').value,ki:$('ki').value,kd:$('kd').value,testId:$('engTestId').value.replace(/,/g,'_'),diameter:$('engDiameter').value,metaTimestamp:window.fajaDiagnostic?.ms??'',rawRpm:window.fajaDiagnostic?.rawRpm??'',pulseAgeMs:window.fajaDiagnostic?.ageMs??'',pulsePeriodMs:window.fajaDiagnostic?.periodMs??'',pulseCount:window.fajaDiagnostic?.pulses??''});
const rpmButtons=[...hmi.querySelectorAll('[data-hmi-rpm]')];
function scaleSpeed(rpm){const d=Number($('engDiameter').value);return d>0&&Number.isFinite(d)?Math.PI*d/100*rpm/60:null}
function refreshHmi(){
 const stale=!online||!lastTelemetryAt||Date.now()-lastTelemetryAt>1700;
 const active=!stale&&lastTelemetry&&lastTelemetry.run===1&&!lastTelemetry.fault&&!emergency;
 const rpm=active?lastTelemetry.rpm:0, v=stale?null:scaleSpeed(rpm);
 $('hmiSpeed').textContent=v===null?'—':v.toFixed(3);
 $('hmiVoltage').textContent=stale?'—':(lastTelemetry.pwm*.05).toFixed(2);
 const temp=Number($('pTempModel').textContent);
 $('hmiTemperature').textContent=Number.isFinite(temp)?temp.toFixed(1):'—';
 const status=stale?'SIN DATOS':emergency?'PARADA SOFTWARE':lastTelemetry.fault?'FALLA':active?'EN OPERACIÓN':'DETENIDA';
 $('hmiStatus').textContent=status;
 $('hmiStatus').className='hmi-state '+(active?'working':emergency||lastTelemetry?.fault?'alarmed':'');
 $('hmiMotion').textContent=active?'EN MOVIMIENTO':'FAJA DETENIDA';
 $('hmiBelt').classList.toggle('moving',active&&rpm>1);
 if(active&&rpm>1)$('hmiBelt').style.setProperty('--hmi-spin',Math.max(.3,Math.min(4,60/rpm))+'s');
 const target=scaleSpeed(Number($('projTarget').value));$('hmiTarget').textContent=target===null?'—':target.toFixed(3);
 $('hmiReset').hidden=!emergency;
 const pilot=(id,on,color)=>{const node=$(id);if(node)node.classList.toggle(color+'-on',Boolean(on))};
 pilot('hmiPilotReady',!stale&&!emergency&&!lastTelemetry.fault,'green');
 pilot('hmiPilotRunning',active,'green');
 pilot('hmiPilotFault',!stale&&(emergency||lastTelemetry.fault),'red');
 pilot('hmiPilotMotor',active,'green');
 pilot('hmiPilotSensor',!stale&&lastTelemetry.rpm>0,'green');
 pilot('hmiPilotAlarm',!stale&&(emergency||lastTelemetry.fault),'red');
 $('hmiStart').disabled=!online||emergency||stale;
 rpmButtons.forEach(b=>b.classList.toggle('selected',Number(b.dataset.hmiRpm)===Number($('projTarget').value)));
}
setInterval(refreshHmi,300);
$('engDiameter').addEventListener('input',refreshHmi);
$('engModeApply').addEventListener('click',async()=>{
 if(!online)return notice('Conecta primero el ESP32.');
 if(last.run)return notice('Detén el motor para cambiar de modo.');
 const mode=document.querySelector('[name="engMode"]:checked').value;
 try{await send('MODE,'+mode);notice('Cambio solicitado: '+mode+'; esperando ACK.')}catch(e){notice(e.message)}
});
$('engPwmApply').addEventListener('click',async()=>{
 if(!online||confirmedMode!=='PWM')return notice('Activa el modo PWM con el motor detenido y espera confirmación.');
 const value=Number($('engFixedPwm').value);
 if(!Number.isFinite(value)||value<0||value>100)return notice('PWM permitido: 0 a 100 %.');
 try{await send('PWM,'+value);notice('PWM de ensayo solicitado: '+value+' %.')}catch(e){notice(e.message)}
});
$('hmiStart').addEventListener('click',async()=>{
 if(!online||emergency)return notice('No se puede iniciar. Comprueba el estado del ESP32.');
 try{
   if(last.run&&confirmedMode==='PWM')return notice('Detén el ensayo PWM antes de operar la HMI.');
   if(!last.run){await send('MODE,PID');confirmedMode='PID';}
   await apply();await send('RUN,1');notice('Inicio solicitado; esperando respuesta de la planta.');
 }catch(e){notice('Error de inicio: '+e.message)}
});
$('hmiStop').addEventListener('click',()=>{if(online)send('STOP').then(()=>notice('Parada solicitada.')).catch(e=>notice(e.message));else notice('Sin USB: usa el corte físico del motor.')});
$('hmiEstop').addEventListener('click',async()=>{
 if(!online)return notice('Sin USB: la parada en pantalla NO puede actuar. Utiliza el corte físico.');
 try{await send('ESTOP');notice('Parada software solicitada; esperando confirmación.')}catch(e){notice(e.message)}
});
$('hmiReset').addEventListener('click',async()=>{try{await send('RESET_ESTOP');notice('Rearme solicitado.')}catch(e){notice(e.message)}});
rpmButtons.forEach(b=>b.addEventListener('click',async()=>{
 const v=Number(b.dataset.hmiRpm);
 if(confirmedMode==='PWM'&&last.run)return notice('Primero detén la identificación PWM.');
 try{if(!last.run&&online){await send('MODE,PID');confirmedMode='PID';}
 setTarget(v);if(online)await apply();notice('Consigna seleccionada: '+v+' RPM.');refreshHmi();}
 catch(e){notice(e.message)}
}));

const plots=document.createElement('div');plots.className='eng-plots';
plots.innerHTML=`<div class="eng-mode-title"><b>Variables de la gráfica</b><small>Solo representación; el CSV conserva todas las muestras</small></div>
<div class="eng-variable-grid">
<label><input type="checkbox" data-plot="set" checked> Referencia RPM</label>
<label><input type="checkbox" data-plot="rpm" checked> RPM medidas</label>
<label><input type="checkbox" data-plot="pwm"> PWM (%)</label>
<label><input type="checkbox" data-plot="err"> Error (RPM)</label>
</div><label class="eng-chart-type">Tipo de gráfica <select id="engChartType"><option value="line">Líneas</option><option value="points">Puntos</option><option value="step">Escalonada</option></select></label>`;
$('projectMonitorPanel').querySelector('.chart-workspace').appendChild(plots);
window.fajaPlot={set:true,rpm:true,pwm:false,err:false,type:'line'};
plots.querySelectorAll('[data-plot]').forEach(input=>input.addEventListener('change',()=>{window.fajaPlot[input.dataset.plot]=input.checked;drawAll()}));
$('engChartType').addEventListener('change',e=>{window.fajaPlot.type=e.target.value;drawAll()});

const oldReceive=receive;
receive=function(line){
 oldReceive(line);
 const p=line.trim().split(',');
 if(p[0]==='DATA'&&p.length>=8){
  const n=p.slice(1,8).map(Number);
  if(n.every(Number.isFinite)){lastTelemetry={ms:n[0],set:n[1],rpm:n[2],err:n[3],pwm:n[4],run:n[5],fault:n[6]};lastTelemetryAt=Date.now();}
 }else if(p[0]==='META'&&p.length>=8){
  confirmedMode=p[2]==='PWM'?'PWM':'PID';emergency=p[7]==='1';
  window.fajaDiagnostic={ms:Number(p[1]),rawRpm:Number(p[3]),ageMs:Number(p[4]),periodMs:Number(p[5]),pulses:Number(p[6])};
  const d=$('engMeta');if(d)d.textContent='RPM sin filtrar: '+p[3]+' · Tiempo desde pulso: '+p[4]+' ms · Periodo: '+p[5]+' ms · Pulsos: '+p[6];
 }else if(p[0]==='ACK'){
  if(p[1]==='MODE'){confirmedMode=p[2];notice('Modo confirmado por ESP32: '+p[2]);}
  if(p[1]==='ESTOP'){emergency=true;notice('Parada software confirmada; rearme obligatorio.');}
  if(p[1]==='RESET_ESTOP'){emergency=false;notice('Rearme confirmado.');}
 }else if(p[0]==='ERR')notice('ESP32 rechazó orden: '+line);
 else if(p[0]==='FAULT')notice('Falla comunicada por ESP32: '+line);
 refreshHmi();
};
function mappedPlot(canvas){
 const rect=canvas.getBoundingClientRect();if(rect.width<10)return;
 const k=window.fajaPlot, rows=window.fajaSamples||[];
 const d=window.devicePixelRatio||1,w=rect.width,h=Math.max(190,Math.round(rect.height));canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);
 const ctx=canvas.getContext('2d');ctx.scale(d,d);ctx.clearRect(0,0,w,h);
 const L=48,R=w-16,T=20,B=h-25,dt=rows.length?(rows[rows.length-1].ms-rows[0].ms)/1000:0,t0=Math.max(0,dt-60),range=dt>60?60:Math.max(10,dt);
 if(!rows.length){ctx.fillStyle='#9db5c9';ctx.font='13px sans-serif';ctx.fillText('Sin muestras del ESP32',L+20,70);return}
 const topKeys=[['set','ref','#49abf5',200],['rpm','rpm','#38cf9b',200]].filter(a=>k[a[0]]);
 const lowerKeys=[['pwm','pwm','#f2b467',100],['err','error','#b69bfc',100]].filter(a=>k[a[0]]);
 const split=topKeys.length&&lowerKeys.length;
 function chart(group,ymin,ymax,keys,label){
  const HH=ymax-ymin, y=val=>ymax-(val/HH)*(ymax-ymin);
  ctx.strokeStyle='#294056';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(L,ymin);ctx.lineTo(L,ymax);ctx.lineTo(R,ymax);ctx.stroke();
  ctx.fillStyle='#92adc3';ctx.font='10px sans-serif';ctx.fillText(label,L+5,ymin+11);
  for(const [id,field,color,limit] of keys){
   ctx.beginPath();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;let started=false,lastX=0,lastY=0;
   for(const point of rows){const t=(point.ms-rows[0].ms)/1000;if(t<t0)continue;const px=L+(t-t0)/range*(R-L);
    const v=Number(point[field]);if(!Number.isFinite(v))continue;
    const ratio=id==='err'?(Math.max(-100,Math.min(100,v))+100)/200:Math.max(0,Math.min(limit,v))/limit;
    const py=ymax-ratio*HH;
    if(k.type==='points'){ctx.moveTo(px+2,py);ctx.arc(px,py,2,0,Math.PI*2);}
    else if(!started){ctx.moveTo(px,py)}
    else if(k.type==='step'){ctx.lineTo(px,lastY);ctx.lineTo(px,py)}
    else ctx.lineTo(px,py);
    started=true;lastX=px;lastY=py;
   }ctx.stroke();
  }
 }
 if(split){const mid=T+(B-T)*.59;chart(topKeys,T,mid-8,topKeys,'RPM · 0–200');chart(lowerKeys,mid+5,B,lowerKeys,'PWM 0–100 % / Error ±100 RPM')}
 else chart(topKeys.length?topKeys:lowerKeys,T,B,topKeys.length?topKeys:lowerKeys,topKeys.length?'RPM · 0–200':'PWM 0–100 % / Error ±100 RPM');
 ctx.fillStyle='#9eb8ce';ctx.font='10px sans-serif';ctx.fillText('Tiempo desde inicio (s)',R-145,h-8);
}
draw=mappedPlot;
drawAll();
})();

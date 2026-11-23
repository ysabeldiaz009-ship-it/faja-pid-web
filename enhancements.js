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
<div class="eng-mode-title"><b>Modo de ensayo</b><small>Selección automática · motor detenido</small></div>
<div class="eng-mode-choice">
 <label><input type="radio" name="engMode" value="PID" checked> PID · lazo cerrado</label>
 <label><input type="radio" name="engMode" value="PWM"> PWM fijo · lazo abierto</label>
</div>
<div id="engPwmFields" class="eng-mode-fields" hidden>
 <label>Salida PWM (%)<input id="engFixedPwm" type="number" min="0" max="100" step="1" value="60"></label>
 <span class="eng-auto-hint">Se configura al elegir PWM o al cambiar este valor. No arranca el motor.</span>
</div>
<div class="eng-mode-status" id="engModeStatus" role="status" aria-live="polite">Esperando confirmación de modo desde ESP32.</div>
<div class="eng-mode-title"><b>Configuración de medición</b><small>Solo para conversión y trazabilidad</small></div>
<div class="eng-mode-fields">
 <label>Rodillo motriz Ø (cm)<input id="engDiameter" type="number" step="0.1" min="0.1" placeholder="Medir"></label>
 <label>ID del ensayo<input id="engTestId" type="text" maxlength="32" value="E01"></label>
</div>
`;
// Elegir el modo es el primer paso de operación, antes de fijar PID o PWM.
controls.insertBefore(engineering,controls.querySelector('label[for="projTarget"]'));
let confirmedMode=null, requestedMode='PID', emergency=false, lastTelemetry=null, lastTelemetryAt=0;
let modeBusy=false,pwmAcknowledged=null,ackRequest=null,pwmModeInitialized=false,lastPlotMode=null;
const modeInputs=[...engineering.querySelectorAll('input[name="engMode"]')];
const pidBlocks=[controls.querySelector('label[for="projTarget"]'),controls.querySelector('.reference-control'),
  controls.querySelector('h4'),controls.querySelector('.three'),$('apply').closest('.actions'),controls.querySelector('.micro-note')].filter(Boolean);
function notice(t){$('engModeStatus').textContent=t;$('hmiMessage').textContent=t}
function validPwmValue(){const raw=$('engFixedPwm').value.trim(),x=Number(raw);return raw!==''&&Number.isFinite(x)&&x>=0&&x<=100?x:null}
function modeReady(){return online&&!emergency&&!modeBusy&&confirmedMode===requestedMode&&
 (requestedMode==='PID'||(validPwmValue()!==null&&pwmAcknowledged===validPwmValue()))}
window.fajaModeReady=modeReady;
window.fajaIsPidMode=()=>requestedMode==='PID';
function visibleMode(){
 const pwm=requestedMode==='PWM';
 $('engPwmFields').hidden=!pwm;
 pidBlocks.forEach(x=>x.hidden=pwm);
 const captions=document.querySelectorAll('.compact-kpis .kpi .caption');
 if(captions[0])captions[0].textContent=pwm?'REFERENCIA PID · NO APLICA':'REFERENCIA';
 if(captions[2])captions[2].textContent=pwm?'ERROR PID · NO APLICA':'ERROR';
 document.body.classList.toggle('faja-pwm-mode',pwm);
 if(window.fajaPlot&&lastPlotMode!==requestedMode){
   lastPlotMode=requestedMode;
   window.fajaPlot.set=!pwm;
   const select=document.querySelector('.eng-plots [data-plot="set"]');
   if(select)select.checked=!pwm;
   drawAll();
 }
 modeInputs.forEach(x=>{x.checked=x.value===requestedMode;x.disabled=!online||!!last.run||modeBusy});
 $('engFixedPwm').disabled=!online||!!last.run||modeBusy;
 for(const id of ['projRun','plantRun','hmiStart'])if($(id))$(id).disabled=!modeReady()||!!last.run;
}
function announceMode(){
 if(!online){notice('SIN CONEXIÓN · conecta ESP32 para confirmar PID o PWM.');return;}
 if(modeBusy){notice('CONFIGURANDO · esperando confirmación del ESP32. Arranque bloqueado.');return;}
 if(!confirmedMode){notice('ESPERANDO MODO · aguardando datos del ESP32.');return;}
 if(requestedMode!==confirmedMode){notice('MODO NO CONFIRMADO · no arranques hasta configurar el ESP32.');return;}
 if(requestedMode==='PWM'){
   const value=validPwmValue();
   if(value===null){notice('PWM INVÁLIDO · introduce un valor entre 0 y 100 %.');return;}
   if(pwmAcknowledged!==value){notice('PWM PENDIENTE · falta confirmar '+value+' % desde ESP32.');return;}
   notice('✓ PWM FIJO CONFIRMADO · '+value.toFixed(1)+' % PROGRAMADO · MOTOR '+(last.run?'EN MARCHA':'DETENIDO')+'.');
 }else notice('✓ PID CONFIRMADO · referencia y ganancias disponibles · MOTOR '+(last.run?'EN MARCHA':'DETENIDO')+'.');
}
async function commandConfirmed(command,matcher){
 if(ackRequest)throw Error('Hay otra orden de configuración pendiente.');
 const ack=new Promise((resolve,reject)=>{
   const pending={matcher,resolve,reject,timer:null};
   pending.timer=setTimeout(()=>{if(ackRequest===pending){ackRequest=null;reject(Error('El ESP32 no confirmó '+command+'.'))}},2800);
   ackRequest=pending;
 });
 try{await send(command)}catch(err){
   const pending=ackRequest;
   if(pending){clearTimeout(pending.timer);ackRequest=null;pending.reject(err);}
 }
 return ack;
}
async function setPwmFromInput(){
 const value=validPwmValue();
 if(value===null)throw Error('PWM permitido: 0 a 100 %.');
 if(requestedMode!=='PWM'||confirmedMode!=='PWM')throw Error('Primero confirma el modo PWM.');
 pwmAcknowledged=null;
 await commandConfirmed('PWM,'+value,p=>p[1]==='PWM'&&Math.abs(Number(p[2])-value)<0.015);
 pwmAcknowledged=value;
}
async function setRequestedMode(mode){
 if(!online){requestedMode=confirmedMode||'PID';visibleMode();announceMode();return false;}
 if(last.run||modeBusy){requestedMode=confirmedMode||requestedMode;visibleMode();notice('Detén el motor y termina la configuración antes de cambiar de modo.');return false;}
 requestedMode=mode;modeBusy=true;pwmAcknowledged=null;visibleMode();announceMode();
 try{
   await commandConfirmed('MODE,'+mode,p=>p[1]==='MODE'&&p[2]===mode);
   confirmedMode=mode;
   if(mode==='PWM'){await setPwmFromInput();pwmModeInitialized=true;}
   else pwmModeInitialized=false;
   modeBusy=false;visibleMode();announceMode();return true;
 }catch(err){
   modeBusy=false;requestedMode=confirmedMode||'PID';visibleMode();notice('NO CONFIGURADO · '+err.message);return false;
 }
}
window.fajaSelectMode=setRequestedMode;
modeInputs.forEach(x=>x.addEventListener('change',()=>{if(x.checked)setRequestedMode(x.value)}));
$('engFixedPwm').addEventListener('change',async()=>{
 if(last.run||!online){notice('Detén el motor y conecta ESP32 antes de modificar PWM.');return;}
 if(modeBusy)return;
 modeBusy=true;visibleMode();announceMode();
 try{await setPwmFromInput();modeBusy=false;visibleMode();announceMode();}
 catch(err){modeBusy=false;visibleMode();notice('PWM NO CONFIGURADO · '+err.message);}
});
// Aun si otros módulos habilitan Arrancar, no iniciar con modo/PWM sin confirmar.
for(const id of ['projRun','plantRun','hmiStart']){
 $(id)?.addEventListener('click',e=>{
   if(!modeReady()||last.run){e.preventDefault();e.stopImmediatePropagation();announceMode();}
 },true);
}
visibleMode();announceMode();
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
 $('hmiStart').disabled=!online||emergency||stale||!modeReady()||!!last.run;
 visibleMode();
 rpmButtons.forEach(b=>b.classList.toggle('selected',Number(b.dataset.hmiRpm)===Number($('projTarget').value)));
}
setInterval(refreshHmi,300);
$('engDiameter').addEventListener('input',refreshHmi);
// El modo se aplica automáticamente al seleccionar radio; el PWM, al confirmar su campo.
$('hmiStart').addEventListener('click',async()=>{
 if(!online||emergency)return notice('No se puede iniciar. Comprueba el estado del ESP32.');
 try{
   if(last.run&&confirmedMode==='PWM')return notice('Detén el ensayo PWM antes de operar la HMI.');
   if(!modeReady())return notice('Modo o PWM sin confirmar. Espera la confirmación ESP32.');
   if(requestedMode==='PID')await apply();
   await send(window.fajaStartCommand?.()||'RUN,1');notice('Inicio solicitado en '+requestedMode+'; esperando respuesta de la planta.');
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
 try{
   if(online&&requestedMode!=='PID'){
     const changed=await setRequestedMode('PID');if(!changed)return;
   }
   setTarget(v);if(online)await apply();notice('Consigna PID seleccionada: '+v+' RPM.');refreshHmi();}
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

const oldConn=conn;
conn=function(value){
 oldConn(value);
 if(!value){confirmedMode=null;pwmAcknowledged=null;pwmModeInitialized=false;modeBusy=false;requestedMode='PID';lastPlotMode=null;}
 visibleMode();announceMode();
};
const oldReceive=receive;
receive=function(line){
 oldReceive(line);
 const p=line.trim().split(',');
 if(p[0]==='DATA'&&p.length>=8){
  const n=p.slice(1,8).map(Number);
  if(n.every(Number.isFinite)){lastTelemetry={ms:n[0],set:n[1],rpm:n[2],err:n[3],pwm:n[4],run:n[5],fault:n[6]};lastTelemetryAt=Date.now();}
 }else if(p[0]==='META'&&p.length>=8){
  const deviceMode=p[2]==='PWM'?'PWM':'PID';
  if(!modeBusy){
   if(confirmedMode!==deviceMode){confirmedMode=deviceMode;pwmAcknowledged=null;}
   if(requestedMode!==deviceMode)requestedMode=deviceMode;
  }
  emergency=p[7]==='1';
  window.fajaDiagnostic={ms:Number(p[1]),rawRpm:Number(p[3]),ageMs:Number(p[4]),periodMs:Number(p[5]),pulses:Number(p[6])};
  const d=$('engMeta');if(d)d.textContent='RPM sin filtrar: '+p[3]+' · Tiempo desde pulso: '+p[4]+' ms · Periodo: '+p[5]+' ms · Pulsos: '+p[6];
  // Si abrimos la web con PWM ya seleccionado en el ESP32, programarlo una vez.
  if(deviceMode==='PWM'&&!pwmModeInitialized&&!last.run&&!modeBusy){
   pwmModeInitialized=true;modeBusy=true;visibleMode();announceMode();
   setPwmFromInput().then(()=>{modeBusy=false;visibleMode();announceMode()})
    .catch(e=>{modeBusy=false;visibleMode();notice('PWM NO CONFIGURADO · '+e.message)});
  }
 }else if(p[0]==='ACK'){
  if(p[1]==='MODE')confirmedMode=p[2];
  if(p[1]==='ESTOP')emergency=true;
  if(p[1]==='RESET_ESTOP')emergency=false;
 }
 if(ackRequest&&((p[0]==='ACK'&&ackRequest.matcher(p))||p[0]==='ERR')){
   const pending=ackRequest;ackRequest=null;clearTimeout(pending.timer);
   if(p[0]==='ERR')pending.reject(Error('ESP32 rechazó '+line));
   else pending.resolve(line);
 }
 if(p[0]==='ERR'&&!modeBusy)notice('Orden rechazada: '+line);
 else if(p[0]==='FAULT')notice('Falla comunicada por ESP32: '+line);
 if(p[0]==='DATA'||p[0]==='META'||p[0]==='ACK')announceMode();
 refreshHmi();
};
function mappedPlot(canvas){
 const rect=canvas.getBoundingClientRect();if(rect.width<10)return;
 const k=window.fajaPlot,rows=window.fajaSamples||[];
 const d=window.devicePixelRatio||1,w=rect.width,h=Math.max(190,Math.round(rect.height));
 canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);
 const ctx=canvas.getContext('2d');ctx.scale(d,d);ctx.clearRect(0,0,w,h);
 const bothSecondary=k.pwm&&k.err;
 const L=62,R=w-(bothSecondary?58:20),T=23,B=h-40;
 if(!rows.length){
  ctx.fillStyle='#a7c7db';ctx.font='12px Segoe UI,sans-serif';
  ctx.fillText('Sin lecturas del ESP32',L+12,72);return;
 }
 const firstMs=Number(rows[0].ms),lastMs=Number(rows[rows.length-1].ms);
 const dt=Math.max(0,(lastMs-firstMs)/1000),t0=Math.max(0,dt-60),range=dt>60?60:Math.max(10,dt);
 const peak=rows.reduce((highest,p)=>{
  const t=(Number(p.ms)-firstMs)/1000;
  if(t<t0)return highest;
  const ref=k.set?Number(p.ref):0,actual=k.rpm?Number(p.rpm):0;
  return Math.max(highest,Number.isFinite(ref)?ref:0,Number.isFinite(actual)?actual:0);
 },0);
 // La escala de la GRÁFICA no limita los valores del CSV.
 const rpmAxisMax=Math.max(200,Math.ceil(peak*1.1/50)*50);
 window.fajaGraphAxisMax=rpmAxisMax;
 const topKeys=[['set','ref','#49abf5',rpmAxisMax],['rpm','rpm','#38cf9b',rpmAxisMax]].filter(a=>k[a[0]]);
 const lowerKeys=[['pwm','pwm','#f2b467',100],['err','error','#b69bfc',100]].filter(a=>k[a[0]]);
 const split=topKeys.length>0&&lowerKeys.length>0;
 const P=R-L;
 const px=t=>L+(t-t0)/range*P;
 const mark=(v)=>Number.isInteger(v)?String(v):v.toFixed(1);
 // Líneas verticales compartidas por los paneles y marcas del eje X.
 const targetTick=range/6;
 const xStep=[1,2,5,10,15,20,30].find(v=>v>=targetTick)||30;
 ctx.font='11px Segoe UI,sans-serif';
 ctx.lineWidth=1;ctx.textAlign='center';ctx.textBaseline='middle';
 const tFirst=Math.ceil((t0-1e-7)/xStep)*xStep;
 for(let t=tFirst;t<=t0+range+1e-7;t+=xStep){
  const x=px(t);
  ctx.strokeStyle='rgba(106,153,185,0.17)';ctx.beginPath();
  ctx.moveTo(x,T);ctx.lineTo(x,B);ctx.stroke();
  ctx.fillStyle='#a9c6d9';ctx.fillText(mark(t)+' s',x,B+15);
 }
 ctx.fillStyle='#c3d9e8';ctx.font='11px Segoe UI,sans-serif';
 ctx.fillText('Tiempo desde inicio (s)',(L+R)/2,h-8);
 const drawPane=(keys,top,bottom,type)=>{
  const H=bottom-top;
  const axisMax=type==='rpm'?rpmAxisMax:100;
  const axisMin=type==='error'?-100:0;
  const yVal=(value,min,max)=>bottom-(value-min)/(max-min)*H;
  const steps=type==='rpm'?(rpmAxisMax<=350?50:rpmAxisMax<=700?100:Math.ceil(rpmAxisMax/700)*100):(type==='error'?50:25);
  ctx.font='11px Segoe UI,sans-serif';ctx.textAlign='right';ctx.textBaseline='middle';
  for(let tick=axisMin;tick<=axisMax+1e-7;tick+=steps){
   const y=yVal(tick,axisMin,axisMax);
   ctx.strokeStyle='rgba(119,165,196,0.22)';ctx.lineWidth=1;
   ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(R,y);ctx.stroke();
   ctx.fillStyle='#a9c6d9';ctx.fillText(mark(tick),L-9,y);
  }
  ctx.strokeStyle='#426078';ctx.lineWidth=1;ctx.beginPath();
  ctx.moveTo(L,top);ctx.lineTo(L,bottom);ctx.lineTo(R,bottom);ctx.stroke();
  ctx.font='11px Segoe UI,sans-serif';ctx.textBaseline='top';ctx.textAlign='left';
  ctx.fillStyle='#bbd7e9';
  ctx.fillText(type==='rpm'?'Velocidad (RPM)':type==='error'?'Error (RPM)':'PWM (%)',L+8,top+5);
  // PWM (izquierda) y error (derecha) pueden coexistir sin mezclar unidades.
  if(type==='mixed'){
   ctx.font='10px Segoe UI,sans-serif';ctx.textAlign='left';ctx.fillStyle='#bbaaf3';
   ctx.fillText('Error ±100 RPM',R-125,top+5);
   ctx.textAlign='left';ctx.textBaseline='middle';
   for(let tick=-100;tick<=100;tick+=50){
    ctx.fillStyle='#c2b3ef';ctx.fillText(String(tick),R+7,yVal(tick,-100,100));
   }
  }
  ctx.save();ctx.beginPath();ctx.rect(L,top,P,H);ctx.clip();
  for(const [id,field,color,limit] of keys){
   ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;
   let pathStarted=false,lastY=bottom;
   if(k.type!=='points')ctx.beginPath();
   for(const point of rows){
    const t=(Number(point.ms)-firstMs)/1000;
    if(t<t0)continue;
    const value=Number(point[field]);
    if(!Number.isFinite(value))continue;
    const x=px(t);
    const y=id==='err'
      ?yVal(Math.max(-100,Math.min(100,value)),-100,100)
      :yVal(Math.max(0,Math.min(limit,value)),0,limit);
    if(k.type==='points'){
      ctx.beginPath();ctx.arc(x,y,2.2,0,Math.PI*2);ctx.fill();
    }else if(!pathStarted){
      ctx.moveTo(x,y);pathStarted=true;
    }else if(k.type==='step'){
      ctx.lineTo(x,lastY);ctx.lineTo(x,y);
    }else ctx.lineTo(x,y);
    lastY=y;
   }
   if(k.type!=='points')ctx.stroke();
  }
  ctx.restore();
 };
 if(split){
  const mid=T+(B-T)*.59;
  drawPane(topKeys,T,mid-8,'rpm');
  drawPane(lowerKeys,mid+6,B,bothSecondary?'mixed':k.err?'error':'pwm');
 }else if(topKeys.length){
  drawPane(topKeys,T,B,'rpm');
 }else if(lowerKeys.length){
  drawPane(lowerKeys,T,B,bothSecondary?'mixed':k.err?'error':'pwm');
 }else{
  ctx.fillStyle='#a9c6d9';ctx.fillText('Selecciona una variable para graficar',L+12,72);
 }
 // El firmware limita la RPM procesada a 250. Es una advertencia de medición,
 // no un límite de representación; la gráfica puede crecer automáticamente.
 if(k.rpm&&peak>=249.99){
  ctx.fillStyle='#e7b768';ctx.font='10px Segoe UI,sans-serif';
  ctx.textBaseline='top';ctx.textAlign='right';
  ctx.fillText('RPM limitadas a 250 por firmware',R-5,T+5);
 }
 ctx.textAlign='left';ctx.textBaseline='alphabetic';
}
draw=mappedPlot;
drawAll();
})();

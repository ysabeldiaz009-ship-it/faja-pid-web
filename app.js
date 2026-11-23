
'use strict';
const el=id=>document.getElementById(id);
let port=null,reader=null,writer=null,online=false,serialBuffer='',queue=Promise.resolve(),records=[],last={set:120,rpm:null,err:null,pwm:null,run:false,fault:false},lastDataTime=0,disconnecting=false;
const now=()=>new Date().toLocaleTimeString();
function log(message){el('log').textContent='['+now()+'] '+message+'\n'+el('log').textContent.slice(0,2000)}
function tab(mode){
 for(const [view,screenId,tabId] of [
  ['project','projectScreen','projectTab'],
  ['plant','plantScreen','plantTab']
 ]){
  const active=(mode===view);
  el(screenId).hidden=!active;
  el(tabId).classList.toggle('active',active);
  el(tabId).setAttribute('aria-pressed',String(active));
 }
 if(mode==='project')drawAll();
}
el('projectTab').onclick=()=>tab('project');el('plantTab').onclick=()=>tab('plant');
function setTarget(value){let v=Number(value);if(!Number.isFinite(v))v=0;v=Math.min(200,Math.max(0,v));for(const id of ['projSlider','projTarget','plantSlider','plantTarget'])el(id).value=v;el('projSet').textContent=v;el('plantRef').textContent=v;last.set=v}
for(const id of ['projSlider','projTarget','plantSlider','plantTarget'])el(id).oninput=()=>setTarget(el(id).value);
function readConfig(){const v=[Number(el('projTarget').value),Number(el('kp').value),Number(el('ki').value),Number(el('kd').value)];if(v.some(x=>!Number.isFinite(x))||v[0]<0||v[0]>200||v.slice(1).some(x=>x<0||x>10))throw Error('Referencia 0–200 RPM; Kp/Ki/Kd 0–10');return v}
async function send(line){if(!online)throw Error('ESP32 desconectado');if(window.fajaUSB)return window.fajaUSB.send(line);if(!writer)throw Error('Puerto USB no disponible');queue=queue.catch(()=>{}).then(()=>writer.write(new TextEncoder().encode(line+'\n')));await queue}
async function apply(){const cfg=readConfig();await send('SET,'+cfg.join(','));log('SET enviado al ESP32')}
async function start(){try{await apply();await send('RUN,1');log('Arranque solicitado; esperando confirmación del ESP32')}catch(e){log('No se pudo arrancar: '+e.message)}}
async function stop(){try{await send('STOP');log('Parada solicitada; esperando confirmación')}catch(e){log('No se pudo detener: '+e.message)}}
el('apply').onclick=()=>apply().catch(e=>log(e.message));
el('projRun').onclick=el('plantRun').onclick=start;
el('projStop').onclick=el('plantStop').onclick=stop;
for(const b of document.querySelectorAll('[data-preset]'))b.onclick=async()=>{setTarget(b.dataset.preset);if(online)try{await apply()}catch(e){log(e.message)}};
for(const id of ['plantTarget','plantSlider'])el(id).onchange=()=>{if(online)apply().catch(e=>log(e.message))};
function conn(value){online=value;el('connStatus').textContent=value?'USB CONECTADO':'SIN CONEXIÓN';el('connDot').classList.toggle('on',value);el('connect').textContent=value?'Desconectar':'Conectar ESP32';for(const id of ['projRun','projStop','plantRun','plantStop'])el(id).disabled=!value;if(!value){el('plantState').textContent='SIN CONEXIÓN';el('plantState').className='state';el('projectState').textContent='Sin conexión';el('alarm').textContent='ESP32 desconectado.';el('alarm').className='alarm';el('belt').classList.remove('moving');el('beltText').textContent='Faja detenida'}}
function receive(line){
 const a=line.trim().split(',');
 if(a[0]==='DATA'&&a.length>=8){
  const v=a.slice(1,8).map(Number);if(v.some(x=>!Number.isFinite(x)))return;
  const [ms,set,rpm,err,pwm,run,fault]=v;last={set,rpm,err,pwm,run:run===1,fault:fault===1};lastDataTime=Date.now();
  for(const [id,value,dec] of [['projSet',set,0],['projRpm',rpm,1],['projError',err,1],['projPwm',pwm,1],['plantRef',set,0],['plantRpm',rpm,1],['plantPwm',pwm,1]])el(id).textContent=value.toFixed(dec);
  const state=fault?'FALLA':run===1?'EN MARCHA':'DETENIDO';
  el('plantState').textContent=state;el('plantState').className='state'+(fault?' fault':run===1?' running':'');
  el('projectState').textContent=state;el('projectNotice').textContent=fault?'Sin señal del sensor. Motor detenido.':run===1?'Motor en marcha':'Motor detenido';
  let message=fault?'Sin señal del sensor. Motor detenido.':run!==1?'Faja detenida.':pwm>=98&&rpm<set*.85?'Velocidad baja. PWM cercano al límite.':'Faja en funcionamiento.';
  el('alarm').textContent=message;el('alarm').className='alarm'+(fault?' danger':pwm>=98&&rpm<set*.85&&run===1?' warn':'');
  const belt=el('belt');const moving=run===1&&!fault&&rpm>1;belt.classList.toggle('moving',moving);
  if(moving){belt.style.setProperty('--spin',Math.max(.18,Math.min(3,60/rpm))+'s');belt.style.setProperty('--track',Math.max(.2,Math.min(3,60/rpm))+'s')}
  el('beltText').textContent=moving?'Velocidad: '+rpm.toFixed(1)+' RPM':'Faja detenida';
  if(!window.fajaTrialManager){records.push({time:ms/1000,set,rpm});if(records.length>450)records.shift();el('sampleCount').textContent=records.length+' lecturas';}drawAll();
 }else if(['READY','ACK','ERR','FAULT','CAPS','VER'].includes(a[0])&&line!=='ACK,PING')log(line);
}
// Web Serial puede entregar un stream nuevo después de FramingError/ParityError/BreakError.
// No desconectar ni liberar el puerto ante errores de lectura no fatales.
async function readLoop(){
 const decoder=new TextDecoder();
 let recoveries=0;
 while(port&&!disconnecting&&port.readable){
   let activeReader=null;
   try{
     activeReader=port.readable.getReader();
     reader=activeReader;
     while(port&&!disconnecting){
       const {value,done}=await activeReader.read();
       if(done)break;
       if(value&&value.length){
         serialBuffer+=decoder.decode(value,{stream:true});
         let end;
         while((end=serialBuffer.indexOf('\n'))>=0){
           const packet=serialBuffer.slice(0,end).trim();
           serialBuffer=serialBuffer.slice(end+1);
           if(packet){
             receive(packet);
             if(packet.startsWith('DATA,')||packet==='ACK,PING'){
               recoveries=0;
               if(el('serialDiagnostic'))el('serialDiagnostic').textContent='Comunicación USB estable · datos recibidos.';
             }
           }
         }
         if(serialBuffer.length>4096)serialBuffer='';
       }
     }
   }catch(e){
     if(disconnecting)break;
     recoveries++;
     const name=e&&e.name||'Error';
     const msg=e&&e.message||String(e);
     const transient=['FramingError','ParityError','BufferOverrunError','BreakError'].includes(name)||/framing error|parity error|buffer overrun|break error/i.test(msg);
     log('USB lectura '+name+': '+msg+' · recuperación '+recoveries);
     if(el('serialDiagnostic'))el('serialDiagnostic').textContent='USB: '+name+' · reintentando lectura ('+recoveries+')';
     if(!transient&&name!=='NetworkError')log('Error USB no reconocido; comprobar conexión y controlador.');
     // Pausa para evitar que un controlador defectuoso provoque bucles de CPU.
     await new Promise(resolve=>setTimeout(resolve,Math.min(250*recoveries,1500)));
   }finally{
     if(reader===activeReader)reader=null;
     if(activeReader){try{activeReader.releaseLock()}catch(e){}}
   }
 }
 if(!disconnecting){
   log('El puerto USB dejó de ofrecer datos; se cerró la conexión.');
   if(el('serialDiagnostic'))el('serialDiagnostic').textContent='Puerto USB cerrado; verifica el cable.';
   await disconnect();
 }
}
async function disconnect(){if(disconnecting)return;disconnecting=true;conn(false);try{if(reader)await reader.cancel()}catch(e){}try{if(reader)reader.releaseLock()}catch(e){}reader=null;try{await queue.catch(()=>{});if(writer)writer.releaseLock()}catch(e){}writer=null;try{if(port)await port.close()}catch(e){}port=null;disconnecting=false}
// App Windows: puerto serie nativo (sin Web Serial).
function nativeRx(chunk){
  serialBuffer+=chunk;
  let end;
  while((end=serialBuffer.indexOf('\n'))>=0){
    receive(serialBuffer.slice(0,end));
    serialBuffer=serialBuffer.slice(end+1);
  }
  if(serialBuffer.length>4096)serialBuffer='';
}
if(window.fajaUSB){
  window.fajaUSB.onData(nativeRx);
  window.fajaUSB.onError(msg=>log('Puerto USB: '+msg));
  window.fajaUSB.onClosed(reason=>{conn(false);log(reason)});
}
el('connect').onclick=async()=>{
 if(window.fajaUSB){
   if(online){try{await send('STOP')}catch(e){}await window.fajaUSB.disconnect().catch(e=>log(e.message));conn(false);return}
   try{
     const result=await window.fajaUSB.connect();
     serialBuffer='';lastDataTime=Date.now();
     conn(true);log('Conectado: '+result.port+' a 115200 baudios');
     await send('PING');
   }catch(e){conn(false);log('No se pudo conectar: '+e.message)}
   return;
 }
 if(online){try{await send('STOP')}catch(e){}await disconnect();log('Desconectado');return}
 try{
   if(!('serial' in navigator))throw Error('Web Serial no disponible: usa Chrome o Edge en HTTPS o localhost.');
   if(el('serialDiagnostic'))el('serialDiagnostic').textContent='Selecciona el CP210x del ESP32 (COM5 en esta PC).';
   port=await navigator.serial.requestPort();
   await port.open({baudRate:115200,dataBits:8,stopBits:1,parity:'none',flowControl:'none',bufferSize:4096});
   // En varias placas ESP32 las líneas DTR/RTS están conectadas a EN/BOOT.
   // Mantenerlas desactivadas evita reinicios involuntarios en la medida de lo posible.
   try{await port.setSignals({dataTerminalReady:false,requestToSend:false});}
   catch(signalsError){log('Control DTR/RTS no disponible: '+signalsError.message);}
   serialBuffer='';lastDataTime=Date.now();
   writer=port.writable.getWriter();
   conn(true);
   log('Puerto USB abierto · 115200, 8N1, sin control de flujo. Esperando telemetría.');
   if(el('serialDiagnostic'))el('serialDiagnostic').textContent='Puerto abierto · esperando datos del ESP32…';
   readLoop();
   await send('PING');
 }catch(e){
   const details=(e&&e.name?e.name+': ':'')+(e&&e.message?e.message:String(e));
   log('No se pudo abrir COM: '+details);
   if(el('serialDiagnostic'))el('serialDiagnostic').textContent='Error al abrir USB: '+details+'. Cierra Serial Monitor/EXE si usan el mismo puerto.';
   await disconnect();
 }
};
function draw(canvas){const rect=canvas.getBoundingClientRect();if(rect.width<10)return;const d=devicePixelRatio||1,w=rect.width,h=Math.max(180,Math.round(rect.height));canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);const ctx=canvas.getContext('2d');ctx.scale(d,d);const L=47,T=18,R=w-18,B=h-32;ctx.clearRect(0,0,w,h);ctx.font='11px Segoe UI';ctx.textAlign='right';
for(let n=0;n<=4;n++){let y=T+(B-T)*n/4;ctx.strokeStyle='#294055';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(R,y);ctx.stroke();ctx.fillStyle='#8ca8c0';ctx.fillText(String(200-50*n),L-9,y+4)}
if(!records.length){ctx.textAlign='center';ctx.fillStyle='#819cb4';ctx.font='14px Segoe UI';ctx.fillText('Sin lecturas del ESP32',w/2,h/2);return}
const max=records[records.length-1].time,min=Math.max(0,max-60);for(const [key,color] of [['set','#49abf5'],['rpm','#38cf9b']]){ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=2;let first=true;for(const r of records){if(r.time<min)continue;const x=L+((r.time-min)/60)*(R-L),y=B-Math.max(0,Math.min(200,r[key]))/200*(B-T);if(first){ctx.moveTo(x,y);first=false}else ctx.lineTo(x,y)}ctx.stroke()}}
function drawAll(){draw(el('projectChart'));draw(el('plantChart'))}window.addEventListener('resize',drawAll);
setInterval(()=>{if(online)send('PING').catch(e=>log('PING: '+e.message))},1200);
setInterval(()=>{if(online&&lastDataTime&&Date.now()-lastDataTime>1700){el('alarm').className='alarm warn';el('alarm').textContent='Sin datos recientes. Revisa el cable USB.';el('belt').classList.remove('moving');el('beltText').textContent='Faja detenida';el('plantState').textContent='SIN DATOS';el('plantState').className='state fault'}},700);
drawAll();

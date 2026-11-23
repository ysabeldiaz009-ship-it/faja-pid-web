'use strict';
/* Cronometro por ensayo, independiente del PID y del sensor RPM.
 * La hora visible arranca en ACK,RUN o ACK,RUN_FOR, se congela con STOP
 * o con parada automatica. RUN_FOR lo ejecuta el ESP32, no el navegador.
 * En enlace tardio DATA=RUN puede arrancar captura, marcada como parcial.
 */
(function(){
  const $=id=>document.getElementById(id);
  const actions=$('projRun')?.closest('.actions');
  if(!actions)return;
  const section=document.createElement('section');
  section.id='trialTimerPanel';section.className='trial-timer-panel';
  section.innerHTML=[
    '<div class="trial-timer-head"><b>Tiempo de ensayo</b><small>Se reinicia automáticamente en cada arranque</small></div>',
    '<div class="trial-timer-main">',
      '<div class="trial-timer-digits" id="trialClock" aria-live="off">00:00.0</div>',
      '<div class="trial-timer-info"><strong id="trialClockState">LISTO</strong><span id="trialClockDetail">Arranca para iniciar el cronómetro</span></div>',
    '</div>',
    '<div class="trial-timer-settings">',
      '<label class="trial-timer-check"><input type="checkbox" id="trialTimedStop"> Detener automáticamente</label>',
      '<label class="trial-timer-length" id="trialDurationLabel">Duración (s)<input id="trialDurationSec" type="number" min="1" max="3600" step="1" value="20" disabled></label>',
    '</div>',
    '<div class="trial-timer-foot">Parada automática ejecutada por el ESP32. El botón Detener siempre permanece disponible.</div>'
  ].join('');
  actions.insertAdjacentElement('afterend',section);
  const badge=document.createElement('span');badge.id='trialClockBadge';badge.className='trial-clock-badge';badge.textContent='⏱ 00:00.0';
  const heading=$('projectMonitorPanel')?.querySelector('.chart-workspace .card-heading');
  if(heading)heading.insertBefore(badge,heading.querySelector('.trial-monitor-controls')||null);
  const auto=$('trialTimedStop'),duration=$('trialDurationSec'),state=$('trialClockState');
  let active=false,started=false,frozen=0,startClock=0,startPacketMs=null,lastPacketMs=null,lastPacketAt=null;
  let scheduled=null,pendingCommand=null,partial=false;
  const clock=()=>performance.now();
  const format=ms=>{
    const v=Math.max(0,Math.floor(ms/100)),m=Math.floor(v/600),ss=Math.floor(v/10)%60,tenth=v%10;
    return String(m).padStart(2,'0')+':'+String(ss).padStart(2,'0')+'.'+tenth;
  };
  const requestedSec=()=>{
    const value=duration.value.trim(),s=Number(value);
    if(!value||!Number.isInteger(s)||s<1||s>3600)throw Error('Duración válida: 1 a 3600 segundos.');
    return s;
  };
  function controls(){
    auto.disabled=active;
    duration.disabled=active||!auto.checked;
  }
  function repaint(){
    const elapsed=active?frozen+Math.max(0,clock()-startClock):frozen;
    const time=format(elapsed);
    $('trialClock').textContent=time;badge.textContent='⏱ '+time;
    state.textContent=active?'EN MARCHA':started?'DETENIDO':'LISTO';
    section.classList.toggle('is-running',active);
    const detail=$('trialClockDetail');
    if(active){
      detail.textContent=(scheduled?'Parada automática a los '+scheduled+' s':'Parada manual')+
        (partial?' · captura desde primera lectura':'');
    }else if(started)detail.textContent='Duración registrada: '+time+(scheduled?' · objetivo '+scheduled+' s':'');
    else detail.textContent='Arranca para iniciar el cronómetro';
    controls();
  }
  function begin(partialCapture=false){
    active=true;started=true;frozen=0;startClock=clock();partial=partialCapture;
    startPacketMs=null;lastPacketMs=null;lastPacketAt=null;
    repaint();
  }
  function finish(authoritativeDuration=null){
    if(!active)return;
    const wall=frozen+Math.max(0,clock()-startClock);
    frozen=Number.isFinite(authoritativeDuration)?Math.max(0,authoritativeDuration):wall;
    active=false;startClock=0;repaint();
  }
  function onData(parts){
    const values=parts.slice(1,8).map(Number);
    if(values.length!==7||values.some(x=>!Number.isFinite(x)))return;
    const [ms,,,,,running,fault]=values;
    if(running===1&&fault===0){
      if(!active){
        // Caso excepcional: la web se conectó cuando ya giraba el motor.
        begin(true);
      }
      if(startPacketMs===null)startPacketMs=ms;
      lastPacketMs=ms;lastPacketAt=clock();
    }else if(active){
      // Marca temporal ESP32 y tiempo visual. Ante una parada antes
      // de la primera muestra activa, se conserva el cronómetro local.
      finish();
    }
  }
  const previousReceive=receive;
  receive=function(line){
    previousReceive(line);
    const parts=line.trim().split(',');
    if(parts[0]==='DATA')onData(parts);
    else if(parts[0]==='ACK'&&(parts[1]==='RUN'||parts[1]==='RUN_FOR')){
      if(!active)begin(false);
      pendingCommand=null;
    }else if(parts[0]==='ACK'&&parts[1]==='TIMER_DONE'){
      finish(scheduled!==null?scheduled*1000:null);
    }else if(parts[0]==='ACK'&&parts[1]==='STOP'){
      finish();
    }else if(parts[0]==='FAULT'||parts[0]==='ACK'&&parts[1]==='ESTOP'){
      finish();
    }else if(parts[0]==='ERR'&&pendingCommand&&!active){
      pendingCommand=null;repaint();
    }
  };
  const previousConn=conn;
  conn=function(value){previousConn(value);if(!value){finish();pendingCommand=null;}repaint();};
  auto.addEventListener('change',()=>{controls();repaint();});
  duration.addEventListener('change',()=>{if(!active&&auto.checked){try{requestedSec();duration.setCustomValidity('');}catch(e){duration.setCustomValidity(e.message);duration.reportValidity();}}});
  window.fajaStartCommand=()=>{
    // Arranque manual y automatizado comparten el mismo contador.
    if(active)throw Error('El ensayo ya está en marcha.');
    scheduled=auto.checked?requestedSec():null;
    pendingCommand=scheduled?'RUN_FOR,'+scheduled:'RUN,1';
    return pendingCommand;
  };
  window.fajaTrialClock={snapshot:()=>({active,elapsedMs:active?frozen+(clock()-startClock):frozen,
    scheduledSec:scheduled,partial}),reset:()=>{
    if(active)return false;frozen=0;started=false;scheduled=null;pendingCommand=null;repaint();return true;
  }};
  setInterval(()=>{if(active)repaint()},80);
  repaint();
})();

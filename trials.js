'use strict';
/* Gestor de pruebas: registra exclusivamente RUN=1, cierra al pasar a RUN=0.
   Mantiene ensayos terminados en sessionStorage de la pestaña; sin enviar datos fuera. */
(function(){
 const $=id=>document.getElementById(id);
 const KEY='faja_pid_trials_v1',MAX=12;
 const saved=(()=>{try{const v=JSON.parse(sessionStorage.getItem(KEY)||'[]');return Array.isArray(v)?v.filter(x=>x&&Array.isArray(x.samples)):[]}catch{return []}})();
 let trials=saved.slice(-MAX),active=null,selected=null,prevRunning=false,lastBootMs=null;
 let sequence=Math.max(0,...trials.map(x=>parseInt(String(x.id).match(/^E(\d+)$/)?.[1]||'0',10)));
 function persist(){try{sessionStorage.setItem(KEY,JSON.stringify(trials.slice(-MAX)))}catch(e){log('Almacenamiento temporal lleno: conserva el CSV de tus ensayos.');}}
 function fmt(v,n=1){return Number.isFinite(v)?Number(v).toFixed(n):'—'}
 function currentMeta(ms){return active?{trialId:active.id,trialStart:active.started,elapsedSec:Math.max(0,(ms-active.firstMs)/1000).toFixed(2),supplyV:active.supplyV,load:active.load,notes:active.notes}:{}}
 function nextId(){return 'E'+String(++sequence).padStart(2,'0')}
 function list(){return active?[...trials,active]:trials}
 function viewed(){return list().find(x=>x.id===selected)||null}
 function showSnapshot(){
   const t=viewed(),row=t?.samples?.[t.samples.length-1];
   if(!row){
     if(!active&&!t){
       const live=last;
       for(const [key,value,digits] of [['projSet',live.set,0],['projRpm',live.rpm,1],['projError',live.err,1],['projPwm',live.pwm,1]])
         $(key).textContent=Number.isFinite(value)?Number(value).toFixed(digits):'—';
     }
     return;
   }
   const vals=[['projSet',row.ref,0],['projRpm',row.rpm,1],['projError',row.error,1],['projPwm',row.pwm,1]];
   for(const [id,value,digits] of vals)$(id).textContent=Number.isFinite(Number(value))?Number(value).toFixed(digits):'—';
 }
 function pick(id){
   if(active&&id!==active.id)return;
   const trial=list().find(x=>x.id===id);
   selected=trial?trial.id:null;
   window.fajaReplaceSamples(trial?trial.samples:[]);
   showSnapshot();
   if(typeof window.renderCompactResults==='function')window.renderCompactResults();
   sync();
 }
 function startTrial(ms,ref){
   if(active)return;
   const id=nextId(),started=new Date().toISOString();
   const mode=window.fajaTestMetadata?.().mode||document.querySelector('[name="engMode"]:checked')?.value||'PID';
   const condition=window.fajaRunConditions?.()||{};
   active={id,started,firstMs:ms,lastMs:ms,ref,mode,kp:$('kp').value,ki:$('ki').value,kd:$('kd').value,...condition,
       samples:[],ended:null,reason:'',status:'running'};
   selected=id;
   if(window.fajaResetModelTrial)window.fajaResetModelTrial();
   window.fajaReplaceSamples(active.samples);
   const name=$('engTestId');if(name)name.value=id;
   sync();
 }
 function endTrial(reason){
   if(!active)return;
   active.ended=new Date().toISOString();
   active.status='finished';
   active.reason=reason||'stop';
   trials.push(active);trials=trials.slice(-MAX);
   selected=active.id;
   active=null;
   persist();sync();
   if(typeof window.renderCompactResults==='function')window.renderCompactResults();
   drawAll();
 }
 function discardSelected(){
   if(active||last.run){$('cmpContext').textContent='Detén el ensayo antes de descartarlo.';return;}
   const t=viewed();if(!t)return;
   if(!window.confirm('¿Descartar '+t.id+'? Este ensayo se eliminará del registro temporal.'))return;
   trials=trials.filter(x=>x.id!==t.id);selected=trials.length?trials[trials.length-1].id:null;
   persist();pick(selected);drawAll();
 }
 function exportSamples(){return list().flatMap(x=>x.samples)}
 function newSeries(){
   if(active||last.run){log('Detén el motor antes de iniciar una serie nueva.');return false;}
   if(!window.confirm('¿Iniciar serie nueva? Se descartarán los ensayos temporales E01, E02… Guarda el CSV si deseas conservarlos.'))return false;
   trials=[];selected=null;sequence=0;lastBootMs=null;persist();pick(null);sync();drawAll();return true;
 }
 function sync(){
   const trial=viewed();
   const message=active?'Registrando '+active.id:trial?'Ensayo '+trial.id+' · '+trial.samples.length+' muestras':'Sin ensayos';
   const status=$('trialStatus');if(status)status.textContent=message;
   const label=$('trialMonitorStatus');if(label)label.textContent=active?'● '+active.id+' · grabando':trial?'■ '+trial.id+' · detenido':'Listo para iniciar';
   const sel=$('trialSelect');
   if(sel){
     const prev=sel.value;
     sel.innerHTML='<option value="">Sin ensayos</option>'+list().map(x=>'<option value="'+x.id+'">'+x.id+' · '+Math.round(x.ref)+' RPM · '+(x.status==='running'?'en curso':x.samples.length+' muestras')+'</option>').join('');
     sel.value=selected||'';
     sel.disabled=!!active;
   }
   const del=$('trialDiscard');if(del)del.disabled=!!active||!trial;
   const b=$('cmpClear');if(b){b.textContent='Descartar ensayo';b.disabled=!!active||!trial}
   const count=$('sampleCount');if(count)count.textContent=(trial?.samples.length||0)+' muestras';
   showSnapshot();
 }
 const monitor=document.querySelector('#projectMonitorPanel .chart-workspace .card-heading');
 if(monitor){
   const group=document.createElement('div');group.className='trial-monitor-controls';
   group.innerHTML='<span id="trialMonitorStatus">Listo para iniciar</span><button type="button" id="trialDiscard" title="Eliminar el ensayo visualizado, sin cambiar el estado del motor">Descartar ensayo</button>';
   monitor.append(group);
 }
 const toolbar=$('csvActionSlot');
 if(toolbar){
   const wrap=document.createElement('div');wrap.className='trial-toolbar';
   wrap.innerHTML='<label for="trialSelect">Ensayo</label><select id="trialSelect"><option>Sin ensayos</option></select>';
   toolbar.parentElement.insertBefore(wrap,toolbar);
   const status=document.createElement('span');status.id='trialStatus';status.className='trial-status';status.textContent='Sin ensayos';
   toolbar.parentElement.append(status);
 }
 $('trialSelect')?.addEventListener('change',e=>pick(e.target.value));
 $('trialDiscard')?.addEventListener('click',discardSelected);
 const previousReceive=receive;
 receive=function(line){
   const fields=line.trim().split(',');
   if(fields[0]==='DATA'&&fields.length>=8){
     const values=fields.slice(1,8).map(Number);
     if(values.every(Number.isFinite)){
       const [ms,ref,rpm,error,pwm,run,fault]=values;
       if(lastBootMs!==null&&ms<lastBootMs&&active)endTrial('reinicio ESP32');
       lastBootMs=ms;
       const running=run===1&&!fault;
       if(running&&!active)startTrial(ms,ref);
       // La última lectura con marcha=0 solo cierra la sesión: no se agrega a la tabla.
       previousReceive(line);
       if(active){
         active.lastMs=ms;
         if(!running)endTrial(fault?'falla':'detenido');
         else if(active.samples.length&&active.samples.length%10===0)sync();
       }
       prevRunning=running;
       return;
     }
   }
   previousReceive(line);
   if(fields[0]==='FAULT'&&active)endTrial('falla');
 };
 const previousConn=conn;
 conn=function(value){previousConn(value);if(!value){endTrial('desconexión');prevRunning=false}sync()};
 window.fajaTrialManager={isActive:()=>!!active,currentMeta,exportSamples,discardSelected,newSeries,select:pick,list,viewed};
 if(trials.length){selected=trials[trials.length-1].id;window.fajaReplaceSamples(trials[trials.length-1].samples);}
 else window.fajaReplaceSamples([]);
 sync();drawAll();
})();
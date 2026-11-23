/* Faja PID Web v2.0 — herramientas académicas, acceso visual y métricas. */
'use strict';
(function () {
 const by=id=>document.getElementById(id);
 const numberFormat=n=>{
   if(!Number.isFinite(n))return 'Indefinido';
   if(Math.abs(n)<1e-10)return '0';
   if(Math.abs(n)<.0001||Math.abs(n)>=1e7)return n.toExponential(4);
   return String(Number(n.toFixed(6)));
 };
 const clip=(x,min,max)=>Math.max(min,Math.min(max,x));
 const frac=(a,b)=>'<span class="fraction"><span>'+a+'</span><span>'+b+'</span></span>';
 const formula=(head,equation,note,cls)=>'<div class="math-group"><div class="math-label">'+head+'</div><div class="math-formula'+(cls?' '+cls:'')+'">'+equation+'</div>'+(note?'<div class="math-note">'+note+'</div>':'')+'</div>';
 const templates={
  first:{fields:[['K','Ganancia K (RPM/duty)',150],['tau','Constante τ (s)',.5],['Ts','Muestreo Ts (s)',.1]]},
  second:{fields:[['b1','Numerador b₁',0],['b0','Numerador b₀',120],['a2','Denominador a₂',.1],['a1','Denominador a₁',.7],['a0','Denominador a₀',1]]},
  motor:{fields:[['R','Resistencia R (Ω)',4],['L','Inductancia L (H)',.01],['J','Inercia J (kg·m²)',.0001],['B','Fricción B (N·m·s/rad)',.0001],['Kt','Constante de par Kt',.05],['Ke','Constante Ke',.05]]},
  jury:{fields:[['a1','Coeficiente a₁ en z²+a₁z+a₂',-.9],['a2','Coeficiente a₂ en z²+a₁z+a₂',.2]]},
  pid:{fields:[['Kp','Kp',.8],['Ki','Ki',.2],['Kd','Kd',.05],['Ts','Ts (s)',.1],['r','Referencia r[k] (RPM)',120],['y','Medición y[k] (RPM)',90],['prev','RPM anterior y[k−1]',88],['I','Integral anterior I[k−1]',4],['D','Derivada filtrada anterior',0]]},
  speed:{fields:[['rpm','Velocidad medida (RPM)',120],['radio','Radio efectivo del rodillo (mm)',15]]},
  states:{fields:[['a11','A₁₁',.8],['a12','A₁₂',.1],['a21','A₂₁',0],['a22','A₂₂',.7],['b1','B₁',1],['b2','B₂',.4],['c1','C₁',1],['c2','C₂',0],['d','D',0]]}
 };
 let plainResult='';
 function buildFields(){
   const t=templates[by('mathTemplate').value];
   by('mathFields').innerHTML='';
   for(const [id,label,value] of t.fields){
     const wrap=document.createElement('div');
     const lab=document.createElement('label');lab.textContent=label;lab.htmlFor='f_'+id;
     const input=document.createElement('input');
     input.id='f_'+id;input.type='number';input.step='any';input.value=value;
     input.addEventListener('change',compute);
     input.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();compute();}});
     wrap.append(lab,input);by('mathFields').append(wrap);
   }
   compute();
 }
 function rootPair(a,b,c,variable){
   variable=variable||'z';
   if(a===0)return 'No es de segundo orden';
   const delta=b*b-4*a*c;
   if(delta>=0)return variable+'₁='+numberFormat((-b+Math.sqrt(delta))/(2*a))+'; '+variable+'₂='+numberFormat((-b-Math.sqrt(delta))/(2*a));
   return variable+'₁,₂='+numberFormat(-b/(2*a))+' ± j'+numberFormat(Math.sqrt(-delta)/Math.abs(2*a));
 }
 function compute(){
   try{
     const type=by('mathTemplate').value,inputs=templates[type].fields;
     const v={};
     for(const [id] of inputs){const value=by('f_'+id).value;if(value.trim()==='')throw Error('Completa todos los campos.');v[id]=Number(value);if(!Number.isFinite(v[id]))throw Error('Hay un valor no válido.');}
     const f=numberFormat;let sections=[];
     const put=(heading,eq,note,cls)=>sections.push(formula(heading,eq,note,cls));
     if(type==='first'){
       if(v.tau<=0||v.Ts<=0)throw Error('τ y Ts deben ser positivos.');
       const aa=Math.exp(-v.Ts/v.tau),bb=v.K*(1-aa);
       put('Modelo continuo', 'G(s) = '+frac(f(v.K), f(v.tau)+'s + 1'), 'Entrada: duty normalizado (0 a 1). Salida: RPM.');
       put('Sustitución ZOH', 'a = e<sup>−Ts/τ</sup> = e<sup>−'+f(v.Ts)+'/'+f(v.tau)+'</sup> = '+f(aa));
       put('Función discreta', 'G(z) = '+frac(f(bb)+' z<sup>−1</sup>','1 − '+f(aa)+' z<sup>−1</sup>'),'Ts = '+f(v.Ts)+' s; ZOH de un modelo de primer orden.');
       put('Ecuación en diferencias','y[k] = '+f(aa)+'·y[k−1] + '+f(bb)+'·u[k−1]');
       put('Polos y estabilidad','z = '+f(aa)+' <span class="math-success">|z| &lt; 1</span>','Estable para τ y Ts positivos. Este resultado es del modelo ingresado, no una medición física.');
     }else if(type==='second'){
       if(v.a2===0)throw Error('a₂ debe ser diferente de cero para un modelo de segundo orden.');
       const omega2=v.a0/v.a2;
       const wn=omega2>0?Math.sqrt(omega2):NaN;
       const damping=Number.isFinite(wn)&&wn>0?v.a1/(2*v.a2*wn):NaN;
       put('Función ingresada','G(s) = '+frac(f(v.b1)+'s + '+f(v.b0),f(v.a2)+'s² + '+f(v.a1)+'s + '+f(v.a0)));
       put('Polos continuos','Soluciones de '+f(v.a2)+'s² + '+f(v.a1)+'s + '+f(v.a0)+' = 0',rootPair(v.a2,v.a1,v.a0,'s'));
       put('Parámetros del denominador','ω<sub>n</sub> = '+f(wn)+' rad/s; ζ = '+f(damping),'Si a₀/a₂ ≤ 0, la frecuencia natural real de esta forma no está definida.');
       put('Discretización','Pendiente de calcular para este modelo','La conversión ZOH completa de orden dos requiere definir Ts y efectuar una discretización matricial o algorítmica; no se inventan coeficientes.');
     }else if(type==='motor'){
       if(v.L<=0||v.J<=0||v.R<=0)throw Error('R, L y J deben ser positivos.');
       const a2=v.L*v.J,a1=v.L*v.B+v.R*v.J,a0=v.R*v.B+v.Kt*v.Ke;
       put('Ecuaciones físicas','V = L·di/dt + R·i + Ke·ω<br>J·dω/dt + B·ω = Kt·i − T<sub>L</sub>');
       put('Modelo continuo de motor DC','G<sub>ω,V</sub>(s) = '+frac('Kt','LJ·s² + (LB+RJ)·s + (RB+KtKe)'));
       put('Sustitución de parámetros','G<sub>ω,V</sub>(s) = '+frac(f(v.Kt),f(a2)+'s² + '+f(a1)+'s + '+f(a0)),'Salida: velocidad del motor en rad/s; entrada: voltaje. La reducción y la faja requieren modelamiento adicional.');
       put('Pendiente experimental','R, L, J, B, Kt y Ke del conjunto real','Los valores predeterminados son demostrativos, no fichas del motor TT.');
     }else if(type==='jury'){
       const c1=1+v.a1+v.a2,c2=1-v.a1+v.a2,c3=1-v.a2;
       const stable=c1>0&&c2>0&&c3>0;
       put('Polinomio característico','P(z)=z² + ('+f(v.a1)+')z + ('+f(v.a2)+')');
       put('Condición 1','1+a₁+a₂ = '+f(c1)+(c1>0?' &gt; 0 ✓':' ≤ 0 ✗'));
       put('Condición 2','1−a₁+a₂ = '+f(c2)+(c2>0?' &gt; 0 ✓':' ≤ 0 ✗'));
       put('Condición 3','1−a₂ = '+f(c3)+(c3>0?' &gt; 0 ✓':' ≤ 0 ✗'));
       put('Conclusión',stable?'ESTABLE en el círculo unitario':'NO CUMPLE Jury',rootPair(1,v.a1,v.a2),stable?'math-success':'math-bad');
     }else if(type==='pid'){
       if(v.Ts<=0||v.Kp<0||v.Ki<0||v.Kd<0)throw Error('Ts>0 y ganancias no negativas.');
       const e=v.r-v.y,candidate=clip(v.I+v.Ki*e*v.Ts,0,100);
       const rawDer=-(v.y-v.prev)/v.Ts,filtered=.8*v.D+.2*rawDer;
       const u0=v.Kp*e+candidate+v.Kd*filtered;
       const windup=(u0>100&&e>0)||(u0<0&&e<0);
       const integral=windup?v.I:candidate;
       const output=clip(v.Kp*e+integral+v.Kd*filtered,0,100);
       put('Error de seguimiento','e[k] = '+f(v.r)+' − '+f(v.y)+' = '+f(e)+' RPM');
       put('Integral tentativa','I<sub>c</sub> = limitar('+f(v.I)+' + '+f(v.Ki)+'·'+f(e)+'·'+f(v.Ts)+', 0,100) = '+f(candidate));
       put('Derivada filtrada','D = 0,8('+f(v.D)+') + 0,2('+f(rawDer)+') = '+f(filtered));
       put('Anti-windup','I[k] = '+f(integral),windup?'Saturación en el sentido del error: se conserva la integral anterior.':'Se acepta la integral tentativa.');
       put('PWM aplicado','u[k] = '+f(output)+' %','Forma posicional del firmware ESP32. Este cálculo aislado no sustituye el control en ejecución.');
     }else if(type==='speed'){
       if(v.rpm<0||v.radio<=0)throw Error('RPM≥0 y radio>0.');
       const omega=2*Math.PI*v.rpm/60,linear=omega*v.radio/1000;
       put('Conversión a velocidad angular','ω = '+frac('2π · '+f(v.rpm),'60')+' = '+f(omega)+' rad/s');
       put('Conversión a velocidad de faja','v = ω·r = '+f(omega)+' × '+f(v.radio/1000)+' = '+f(linear)+' m/s');
       put('Frecuencia de giro','f = RPM/60 = '+f(v.rpm/60)+' Hz','Este valor es mecánico; no confundir con los 10 000 Hz del PWM.');
     }else if(type==='states'){
       const ab1=v.a11*v.b1+v.a12*v.b2,ab2=v.a21*v.b1+v.a22*v.b2;
       const ca1=v.c1*v.a11+v.c2*v.a21,ca2=v.c1*v.a12+v.c2*v.a22;
       const detCtrl=v.b1*ab2-v.b2*ab1,detObs=v.c1*ca2-v.c2*ca1;
       put('Matrices ingresadas','A = ['+f(v.a11)+', '+f(v.a12)+'; '+f(v.a21)+', '+f(v.a22)+']<br>B = ['+f(v.b1)+'; '+f(v.b2)+']; C = ['+f(v.c1)+', '+f(v.c2)+']; D = '+f(v.d));
       put('Forma de estado','x[k+1] = A·x[k] + B·u[k]<br>y[k] = C·x[k] + D·u[k]');
       put('Controlabilidad','det([B, AB]) = '+f(detCtrl),Math.abs(detCtrl)>1e-9?'Rango 2; sistema controlable.':'Determinante cero; no es totalmente controlable.',Math.abs(detCtrl)>1e-9?'math-success':'math-warning');
       put('Observabilidad','det([C; CA]) = '+f(detObs),Math.abs(detObs)>1e-9?'Rango 2; sistema observable.':'Determinante cero; no es totalmente observable.',Math.abs(detObs)>1e-9?'math-success':'math-warning');
     }
     const html=sections.join('');
     by('mathOutput').innerHTML=html;
     by('mathState').textContent='Cálculo completado · ejemplo o valores ingresados';
     plainResult='Plantilla: '+by('mathTemplate').selectedOptions[0].text+'\n'+inputs.map(([id,label])=>label+': '+v[id]).join('\n')+'\n\n'+by('mathOutput').innerText;
   }catch(ex){by('mathOutput').textContent=ex.message;by('mathState').textContent='Revisa los datos';plainResult='';}
 }
 by('mathTemplate').addEventListener('change',buildFields);
 by('mathCompute').addEventListener('click',compute);
 by('mathReset').addEventListener('click',buildFields);
 by('mathCopy').addEventListener('click',async()=>{
   if(!plainResult)return;
   try{await navigator.clipboard.writeText(plainResult);by('mathState').textContent='Desarrollo copiado';}
   catch(e){by('mathState').textContent='El navegador impide copiar; selecciona el resultado manualmente.';}
 });
 buildFields();

 // Barrera visual para el trabajo temporal: PIN visible en config.js, no es autenticación robusta.
 function tryPin(){
   const pin=(window.FAJA_WEB_CONFIG&&window.FAJA_WEB_CONFIG.PIN)||'2468';
   if(by('pinInput').value===pin){document.body.classList.add('unlocked');by('pinInput').value='';sessionStorage.setItem('faja_pin_ok','1');drawAll();}
   else {by('pinError').textContent='PIN incorrecto.';by('pinInput').value='';}
 }
 by('pinEnter').addEventListener('click',tryPin);
 by('pinInput').addEventListener('keydown',ev=>{if(ev.key==='Enter')tryPin();});
 if(sessionStorage.getItem('faja_pin_ok')==='1')document.body.classList.add('unlocked');
 else by('pinInput').focus();

 // Registro de datos reales en memoria de la pestaña.
 // HMI: temperatura VIRTUAL, no medida ni calibrada. El valor inicial es
 // un ambiente SUPUESTO de 25 C. Formula de respuesta de primer orden por
 // lazo PWM con enfriamiento cuando el motor no gira. No usar para proteccion.
 const thermalModel={ambient:25,value:25,lastMs:null,maxRise:30,heatTau:150,coolTau:240};
 function updateTemperatureModel(ms,pwm,running,fault){
   const model=thermalModel;
   if(model.lastMs!==null){
     const elapsed=ms>=model.lastMs?(ms-model.lastMs)/1000:0;
     // No extrapolar horas por reconexion ni datos stale; se modela solo
     // intervalo de telemetria confiable (maximo 2 segundos).
     const dt=Math.max(0,Math.min(2,elapsed));
     const duty=(running===1&&!fault)?Math.max(0,Math.min(100,pwm))/100:0;
     const target=model.ambient+model.maxRise*duty*duty;
     const tau=duty>0?model.heatTau:model.coolTau;
     model.value += (target-model.value)*(1-Math.exp(-dt/tau));
   }
   model.lastMs=ms;
   by('pTempModel').textContent=model.value.toFixed(1);
 }
 let samples=[],previousTrend=null;
  window.fajaSamples=samples;
 let timerAvailable=false;
 const origReceive=receive;
 receive=function(line){
   origReceive(line);
   const x=line.trim().split(',');
   if((x[0]==='READY'&&x[1]==='FAJA_PID_V2')||(x[0]==='CAPS'&&x[1]==='TIMER')){
     timerAvailable=true;
     by('timerStart').disabled=false;
     by('timerState').textContent='Temporizador disponible: se ejecuta dentro del ESP32.';
     return;
   }
   if(x[0]==='ACK'&&x[1]==='TIMER_DONE'){
     by('timerState').textContent='Tiempo cumplido: ESP32 confirmó la parada.';
     return;
   }
   if(x[0]!=='DATA'||x.length<8)return;
   const v=x.slice(1,8).map(Number);
   if(v.some(y=>!Number.isFinite(y)))return;
   const [ms,ref,rpm,error,pwm,running,fault]=v;
   updateTemperatureModel(ms,pwm,running,fault);
   const meta=window.fajaTestMetadata?window.fajaTestMetadata():{};
    samples.push({ms,ref,rpm,error,pwm,running,fault,...meta});
   if(samples.length>30000)samples.shift();
   by('dataCounter').textContent=samples.length+' muestras';
   by('dataDuration').textContent=(samples.length>1?(ms-samples[0].ms)/1000:0).toFixed(1)+' s registrados';
   by('pVoltage').textContent=(pwm*.05).toFixed(2);
   by('pRotHz').textContent=(rpm/60).toFixed(2);
   if(!running||fault){by('pTrend').textContent='Detenido';previousTrend=null;}
   else {
     if(previousTrend&&ms-previousTrend.ms>=900){
       const delta=rpm-previousTrend.rpm;
       by('pTrend').textContent=delta>3?'Acelerando':delta< -3?'Desacelerando':'Estable';
       previousTrend={ms,rpm};
     } else if(!previousTrend){previousTrend={ms,rpm};by('pTrend').textContent='Evaluando';}
   }
 };
 by('saveCsv').addEventListener('click',()=>{
   if(!samples.length){log('No hay muestras para exportar.');return;}
   const header='tiempo_ms,referencia_rpm,rpm_real,error_rpm,pwm_pct,marcha,falla,modo,kp,ki,kd,ensayo,diametro_rodillo_cm,meta_tiempo_ms,rpm_sin_filtrar,edad_pulso_ms,periodo_pulso_ms,pulsos,modelo_aplicado,K_modelo_rpm_por_duty,tau_modelo_s,rpm_modelo,error_modelo_rpm,error_modelo_pct,Ts_controlador_s,pulsos_por_vuelta';
   const rows=samples.map(x=>[x.ms,x.ref,x.rpm,x.error,x.pwm,x.running,x.fault,x.mode||'',x.kp??'',x.ki??'',x.kd??'',x.testId||'',x.diameter??'',x.metaTimestamp??'',x.rawRpm??'',x.pulseAgeMs??'',x.pulsePeriodMs??'',x.pulseCount??'',x.modelApplied?1:0,x.modelApplied?(x.modelK??''):'',x.modelApplied?(x.modelTau??''):'',x.modelApplied?(x.pred??''):'',x.modelApplied&&x.active?(x.absModel??''):'',x.modelApplied&&x.active&&Number.isFinite(x.errorModelPct)?x.errorModelPct:'',0.1,1].join(','));
   const blob=new Blob(['\ufeff'+[header,...rows].join('\r\n')],{type:'text/csv;charset=utf-8'});
   const url=URL.createObjectURL(blob),anchor=document.createElement('a');
   anchor.href=url;anchor.download='Faja_PID_datos_'+new Date().toISOString().slice(0,19).replace(/:/g,'-')+'.csv';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
   log('CSV exportado: '+samples.length+' muestras.');
 });
 by('clearData').addEventListener('click',()=>{
   if(last.run){log('Detén el motor antes de limpiar registros.');return;}
   samples=[];window.fajaSamples=samples;records=[];previousTrend=null;by('dataCounter').textContent='0 muestras';by('dataDuration').textContent='0 s registrados';drawAll();log('Registro reiniciado.');
 });
 by('timerStart').title='Disponible solamente con firmware FAJA_PID_V2.';
 by('timerStart').addEventListener('click',async()=>{
   if(!timerAvailable||!online){log('No se ha confirmado la función de parada autónoma del ESP32.');return;}
   const seconds=Number(by('timerSeconds').value);
   if(!Number.isInteger(seconds)||seconds<1||seconds>3600){log('Tiempo válido: 1 a 3600 segundos.');return;}
   try{
     await apply();
     await send('RUN_FOR,'+seconds);
     by('timerState').textContent='Marcha temporizada solicitada: '+seconds+' s. El ESP32 controla el tiempo.';
   }catch(ex){log('Temporizador: '+ex.message);}
 });
 const secure=window.isSecureContext;
 if(!('serial' in navigator)){
   by('deviceHint').textContent=secure?'Web Serial no disponible: usa Chrome/Edge.':'Se necesita HTTPS para Web Serial.';
 }else{by('deviceHint').textContent='Web Serial disponible · selecciona puerto COM';}
 const origConn=conn;
 conn=function(connected){
   origConn(connected);
   if(!connected){
     for(const key of ['pVoltage','pRotHz'])by(key).textContent='—';
     by('pTrend').textContent='—';
     previousTrend=null;
     timerAvailable=false;by('timerStart').disabled=true;
     by('timerState').textContent='Temporizador no disponible hasta verificar firmware FAJA_PID_V2.';
   }
 };
})();

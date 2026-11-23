'use strict';
/* Métricas experimentales de pruebas de control de velocidad.
   No confundir periodos de muestreo del controlador con intervalos de telemetría. */
(function(root){
 const finite=x=>Number.isFinite(x);
 function crossing(points,target,start=0){
   for(let i=Math.max(1,start);i<points.length;i++){
     const a=points[i-1],b=points[i],dy=b.y-a.y;
     if(a.y<=target&&b.y>=target){
       if(dy===0)return b.t;
       return a.t+(target-a.y)*(b.t-a.t)/dy;
     }
   }
   return null;
 }
 function calc(trial,opt={}){
   const tolerance=opt.tolerance===5?5:2;
   const data=(trial?.samples||[]).filter(x=>finite(Number(x.ms))&&finite(Number(x.rpm))&&x.running&&!x.fault);
   const result={id:trial?.id||'',tolerance,samples:data.length,measured:!!data.length,
    rise:null,firstReach:null,settling:null,peak:null,overshoot:null,steadyRpm:null,steadyError:null,
    mae:null,rmse:null,pwmAverage:null,pwmMaximum:null,saturationSec:null,saturationPct:null,
    duration:0,modelK:null,modelTau:null,identificationStatus:null,status:'sin datos',samplingMedian:null};
   if(!data.length)return result;
   const first=data[0],ms0=Number(first.ms);
   const pts=data.map(x=>({t:(Number(x.ms)-ms0)/1000,y:Number(x.rpm),ref:Number(x.ref),pwm:Number(x.pwm)}));
   const tEnd=pts[pts.length-1].t;result.duration=Math.max(0,tEnd);
   const ref=finite(Number(trial.ref))?Number(trial.ref):pts[0].ref;
   result.ref=ref;result.peak=Math.max(...pts.map(x=>x.y));
   const changingReference=pts.some(x=>Math.abs(x.ref-ref)>0.5);
   if(changingReference){result.status='Referencia variable: analizar por tramos';return result;}
   if(ref>0){
    result.overshoot=Math.max(0,(result.peak-ref)/ref*100);
    result.firstReach=crossing(pts,ref);
    const startValue=pts[0].y;
    const level10=startValue+0.1*(ref-startValue),level90=startValue+0.9*(ref-startValue);
    const t10=crossing(pts,level10),t90=crossing(pts,level90);
    if(t10!==null&&t90!==null&&t90>=t10&&ref>startValue)result.rise=t90-t10;
    // Establecimiento: última salida de la banda ±tol, y permanencia >= 2 s
    // evitando aceptar como establecimiento solo el último punto del ensayo.
    let lastOutside=-1;
    for(let i=0;i<pts.length;i++)if(Math.abs(pts[i].y-ref)>ref*tolerance/100)lastOutside=i;
    const candidate=lastOutside+1;
    if(candidate<pts.length&&tEnd-pts[candidate].t>=2&&pts.length-candidate>=5){
      result.settling=pts[candidate].t;
    }
   }
   const tailStart=Math.max(0,tEnd- Math.max(2,Math.min(5,tEnd*.20)));
   const tail=pts.filter(x=>x.t>=tailStart);
   if(tail.length>=3){
     result.steadyRpm=tail.reduce((a,x)=>a+x.y,0)/tail.length;
     if(ref>0)result.steadyError=Math.abs(result.steadyRpm-ref)/ref*100;
   }
   if(ref>0){
     const errors=pts.map(x=>x.ref-x.y);
     result.mae=errors.reduce((s,e)=>s+Math.abs(e),0)/errors.length;
     result.rmse=Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/errors.length);
   }
   const pwms=pts.map(x=>x.pwm);
   result.pwmAverage=pwms.reduce((a,b)=>a+b,0)/pwms.length;
   result.pwmMaximum=Math.max(...pwms);
   let sat=0;
   const deltas=[];
   for(let i=1;i<pts.length;i++){
     let dt=pts[i].t-pts[i-1].t;
     if(dt>0&&dt<5){deltas.push(dt);if(pts[i-1].pwm>=98)sat+=dt;}
   }
   result.saturationSec=sat;
   result.saturationPct=tEnd>0?sat/tEnd*100:0;
   if(deltas.length){deltas.sort((a,b)=>a-b);result.samplingMedian=deltas[Math.floor(deltas.length/2)];}
   if(trial.mode==='PWM'){
     const pwm=pts[0].pwm;
     const nearConstant=pts.every(x=>Math.abs(x.pwm-pwm)<=1.5);
     if(!nearConstant||pwm<=0){result.identificationStatus='PWM no constante';}
     else if(result.duration<3||result.steadyRpm===null){result.identificationStatus='Datos insuficientes';}
     else{
       // Identificación a partir de velocidad inicial y nivel final (si se mantiene).
       const y0=pts[0].y, final=result.steadyRpm;
       if(final<=y0+5)result.identificationStatus='Sin incremento suficiente';
       else{
         result.modelK=(final-y0)/(pwm/100);
         const tauLevel=y0+0.6321205588*(final-y0);
         result.modelTau=crossing(pts,tauLevel);
         result.identificationStatus=result.modelTau===null?'No se alcanza 63,2 %':'Estimación preliminar';
       }
     }
   }
   result.status=result.samplingMedian!==null&&result.samplingMedian>0.4?'Resolución temporal limitada':'Calculado con telemetría';
   return result;
 }
 root.fajaPerformance={calc};
})(window);

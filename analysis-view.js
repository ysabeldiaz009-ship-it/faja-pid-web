'use strict';
/* Vistas complementarias del ensayo: comparación breve, momentos clave y muestras completas.
   Los cálculos se derivan del registro, no reemplazan ni modifican datos originales. */
(function(){
 const $=id=>document.getElementById(id);
 const select=$('cmpView'),panel=$('projectDataPanel'),mgr=window.fajaTrialManager;
 if(!select||!panel||!mgr)return;
 const keyOption=document.createElement('option');
 keyOption.value='key';keyOption.textContent='Momentos clave';select.insertBefore(keyOption,select.firstChild);
 const allOption=document.createElement('option');
 allOption.value='all';allOption.textContent='Todas las muestras';select.appendChild(allOption);
 const resetButton=document.createElement('button');
 resetButton.id='trialNewSeries';resetButton.type='button';resetButton.textContent='Nueva serie';
 resetButton.title='Reinicia la numeración de ensayos E01, E02…; requiere confirmación';
 const toolbar=panel.querySelector('.trial-toolbar');
 if(toolbar)toolbar.append(resetButton);
 resetButton.addEventListener('click',()=>{if(mgr.newSeries())render();});
 const pageArea=document.createElement('div');pageArea.className='analysis-page';pageArea.hidden=true;
 pageArea.innerHTML='<button type="button" id="analysisPrev">Anterior</button><span id="analysisPageStatus">Página 1</span><button type="button" id="analysisNext">Siguiente</button>';
 const footer=$('cmpTableFooter');footer.parentElement.insertBefore(pageArea,footer);
 const oldRender=window.renderCompactResults;
 let page=0,oldTrialId=null;
 const round=(n,d=1)=>Number.isFinite(n)?Number(n).toFixed(d):'—';
 const header=(names)=>{$('cmpTableHead').innerHTML='<tr>'+names.map(h=>'<th>'+h+'</th>').join('')+'</tr>'};
 const cells=(row)=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>';
 const empty=(msg,n)=>'<tr><td colspan="'+n+'" class="cmp-empty">'+msg+'</td></tr>';
 const timing=(trial,row)=>trial?.samples?.length?round((row.ms-trial.samples[0].ms)/1000,2):'—';
 function nearest(samples,seconds){
   if(!Number.isFinite(seconds)||!samples.length)return null;
   return samples.reduce((best,x)=>Math.abs((x.ms-samples[0].ms)/1000-seconds)<Math.abs((best.ms-samples[0].ms)/1000-seconds)?x:best,samples[0]);
 }
 function importantRows(trial,tol){
   if(!trial||!trial.samples.length)return [];
   const s=trial.samples.filter(x=>x.running&&!x.fault);
   if(!s.length)return [];
   const m=window.fajaPerformance.calc(trial,{tolerance:tol});
   const peak=s.reduce((best,x)=>x.rpm>best.rpm?x:best,s[0]);
   const validEvents=[
     ['Inicio',s[0]],
     ['Primer alcance',nearest(s,m.firstReach)],
     ['Pico RPM',peak],
     ['Establecimiento ±'+tol+' %',nearest(s,m.settling)],
     ['Última lectura en marcha',s[s.length-1]]
   ];
   return validEvents.map(([label,x])=>[
     label,x?timing(trial,x):'No alcanzado',x?round(x.rpm):'—',x?round(x.pwm):'—',
     x?round(Math.abs(x.ref-x.rpm)):'—'
   ]);
 }
 function render(){
   oldRender?.();
   const mode=select.value,trial=mgr.viewed(),trials=mgr.list();
   if(trial?.id!==oldTrialId){oldTrialId=trial?.id;page=0;}
   const isCompare=mode==='trials';
   panel.classList.toggle('is-compare-summary',isCompare);
   $('trialNewSeries').disabled=mgr.isActive()||!trials.length;
   pageArea.hidden=mode!=='all';
   if(mode==='key'){
     header(['Momento','t desde inicio (s)','RPM medida','PWM (%)','|Error| (RPM)']);
     $('cmpTableTitle').textContent='Momentos clave · '+(trial?.id||'sin ensayo');
     $('cmpContext').textContent='Cinco momentos representativos del ensayo seleccionado.';
     const r=importantRows(trial,Number($('performanceTolerance')?.value||2));
     $('cmpRows').innerHTML=r.length?r.map(cells).join(''):empty('Inicia un ensayo para mostrar sus momentos clave.',5);
     $('cmpTableFooter').textContent='La tabla utiliza muestras reales próximas a cada evento; el tiempo del indicador se calcula con interpolación.';
     $('cmpCount').textContent=trial?trial.samples.length+' muestras guardadas':'Sin muestras';
   }else if(isCompare){
     header(['Ensayo','Kp / Ki / Kd','Referencia','RPM promedio final','Error est.','Establecimiento','Sobreimpulso']);
     $('cmpTableTitle').textContent='Comparación entre ensayos';
     $('cmpContext').textContent='Diferencias entre configuraciones y respuesta obtenida.';
     const tol=Number($('performanceTolerance')?.value||2);
     const r=trials.map(t=>{
       const m=window.fajaPerformance.calc(t,{tolerance:tol});
       return[t.id,[t.kp,t.ki,t.kd].map(x=>x??'—').join(' / '),round(t.ref)+' RPM',
         round(m.steadyRpm)+' RPM',
         round(m.steadyError,2)+' %',
         Number.isFinite(m.settling)?round(m.settling,2)+' s':'No alcanzado',
         Number.isFinite(m.overshoot)?round(m.overshoot,2)+' %':'—'];
     });
     $('cmpRows').innerHTML=r.length?r.map(cells).join(''):empty('Aún no hay ensayos para comparar.',7);
     $('cmpCount').textContent=trials.length+' ensayos';
     $('cmpTableFooter').textContent='Selecciona un ensayo para revisar sus métricas y mediciones individuales.';
   }else if(mode==='all'){
     header(['t (s)','Referencia','RPM real','PWM (%)','Error (RPM)','Marcha']);
     $('cmpTableTitle').textContent='Todas las muestras · '+(trial?.id||'sin ensayo');
     $('cmpContext').textContent='Registro completo del ensayo seleccionado, mostrado en páginas.';
     const s=trial?.samples||[],limit=30,pages=Math.max(1,Math.ceil(s.length/limit));page=Math.min(page,pages-1);
     const r=s.slice(page*limit,(page+1)*limit).map(x=>[
       timing(trial,x),round(x.ref),round(x.rpm),round(x.pwm),round(x.error),
       x.running&&!x.fault?'Sí':'No']);
     $('cmpRows').innerHTML=r.length?r.map(cells).join(''):empty('No hay muestras registradas.',6);
     $('analysisPageStatus').textContent='Página '+(page+1)+' de '+pages;
     $('analysisPrev').disabled=page===0;$('analysisNext').disabled=page>=pages-1;
     $('cmpCount').textContent=s.length+' muestras';
     $('cmpTableFooter').textContent='Registro completo disponible también mediante Exportar CSV.';
   }
 }
 window.renderCompactResults=render;
 $('analysisPrev').addEventListener('click',()=>{page=Math.max(0,page-1);render()});
 $('analysisNext').addEventListener('click',()=>{page++;render()});
 select.value='key';
 select.addEventListener('change',()=>{page=0;render()});
 $('performanceTolerance')?.addEventListener('change',render);
 $('trialSelect')?.addEventListener('change',()=>{page=0;render()});
 render();
})();
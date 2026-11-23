'use strict';
/* GitHub Pages version detection: compare the assets advertised by the newest
 * index.html with the assets that booted the current tab. Query parameters and
 * no-store bypass Brave's normal HTML cache, without a hard-coded version manifest.
 * Never interrupt an active motor trial. Any USB connection requires a one-click
 * user-confirmed reload because refreshing releases Web Serial.
 */
(function(){
  if(location.protocol!=='https:'||!location.hostname.endsWith('.github.io'))return;
  const assetSignature=doc=>[...doc.querySelectorAll('script[src],link[rel="stylesheet"][href]')]
    .map(node=>node.getAttribute('src')||node.getAttribute('href')).join('\n');
  const activeSignature=assetSignature(document);
  const marker=s=>{
    let h=2166136261;
    for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);
    return (h>>>0).toString(36);
  };
  let nextFingerprint='',busy=false,checking=false;
  let panel=null,updateButton=null,updateHint=null;
  const connected=()=>typeof online!=='undefined'&&Boolean(online);
  const motorRunning=()=>typeof last!=='undefined'&&Boolean(last.run)||
    Boolean(window.fajaTrialManager?.isActive());
  const currentVersion='faja_index_assets_'+marker(activeSignature);
  const nextUrl=(fingerprint)=>{
    const url=new URL(location.href);
    url.searchParams.set('ui',marker(fingerprint));
    return url.toString();
  };
  const createPanel=()=>{
    if(panel)return;
    panel=document.createElement('div');
    panel.id='fajaUpdateNotice';panel.className='faja-update-notice';
    panel.setAttribute('role','status');
    panel.setAttribute('aria-live','polite');
    panel.hidden=true;
    panel.innerHTML='<span class="faja-update-mark">Nueva versión de la interfaz disponible</span>'+
      '<button id="fajaUpdateNow" type="button">Actualizar interfaz</button>'+
      '<small id="fajaUpdateHint"></small>';
    const header=document.querySelector('header.top')||document.querySelector('.top')||document.body.firstElementChild;
    header.insertAdjacentElement('afterend',panel);
    updateButton=panel.querySelector('button');
    updateHint=panel.querySelector('small');
    updateButton.addEventListener('click',()=>{
      if(!nextFingerprint||motorRunning())return;
      if(connected()&&!window.confirm('La actualización cerrará la conexión USB con el ESP32. Comprueba que el motor esté detenido. Tus ensayos finalizados seguirán guardados en esta pestaña. ¿Actualizar ahora?'))return;
      sessionStorage.setItem('faja_last_auto_reload',marker(nextFingerprint));
      location.replace(nextUrl(nextFingerprint));
    });
  };
  const render=()=>{
    if(!nextFingerprint)return;
    createPanel();panel.hidden=false;
    const running=motorRunning(),usb=connected();
    updateButton.disabled=running;
    updateHint.textContent=running
      ?'Ensayo en marcha: actualización bloqueada hasta detener el motor.'
      :usb?'Al actualizar, conecta nuevamente el puerto COM.'
      :'Puedes actualizar sin copiar otro enlace.';
  };
  async function check(){
    if(checking)return;
    checking=true;
    try{
      const url=new URL('./index.html',location.href);
      url.searchParams.set('__faja_check',Date.now().toString());
      const response=await fetch(url.toString(),{cache:'no-store'});
      if(!response.ok)return;
      const remote=new DOMParser().parseFromString(await response.text(),'text/html');
      const candidate=assetSignature(remote);
      if(!candidate||candidate===activeSignature){if(nextFingerprint){nextFingerprint='';if(panel)panel.hidden=true;}return;}
      nextFingerprint=candidate;
      // Once per build: automatic refresh when safely offline; when USB is
      // connected show a button instead of interrupting tests and measurements.
      if(!motorRunning()&&!connected()&&sessionStorage.getItem('faja_last_auto_reload')!==marker(candidate)){
        sessionStorage.setItem('faja_last_auto_reload',marker(candidate));
        location.replace(nextUrl(candidate));
        return;
      }
      render();
    }catch(_e){/* No connection or GitHub Pages transient delay: retry later. */}
    finally{checking=false;}
  }
  window.fajaWebUpdate={check,refreshNotice:render,currentVersion};
  setTimeout(check,9000);
  setInterval(check,45000);
  // Rehabilitar 'Actualizar' inmediatamente después de terminar el ensayo.
  setInterval(()=>{if(nextFingerprint&&panel)render()},1200);
})();
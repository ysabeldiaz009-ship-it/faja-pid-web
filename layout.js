(function(){
"use strict";
const items=[["monitor","projectMonitorPanel","projectMonitorTab"],
             ["math","projectMathPanel","projectMathTab"],
             ["data","projectDataPanel","projectDataTab"]];
function openProjectView(view){
 for(const [code,panel,tab] of items){
  const active=code===view;
  document.getElementById(panel).hidden=!active;
  const t=document.getElementById(tab);
  t.classList.toggle("active",active);
  t.setAttribute("aria-selected",String(active));
 }
 if(view==="monitor"){
  requestAnimationFrame(()=>{try{drawAll()}catch(e){console.warn("Chart redraw",e)}});
 }
}
for(const [view,_,tab] of items)document.getElementById(tab).addEventListener("click",()=>openProjectView(view));
openProjectView("monitor");
})();
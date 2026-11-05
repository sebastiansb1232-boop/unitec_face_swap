/* Interacciones del estudio. No procesa ni envía capturas. */
'use strict';
const guide=document.querySelector('#guide-dialog');
document.querySelectorAll('[data-open-guide]').forEach(button=>button.addEventListener('click',()=>guide.showModal()));
document.querySelector('#close-guide').addEventListener('click',()=>guide.close());
guide.addEventListener('click',event=>{if(event.target===guide){const r=guide.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)guide.close();}});
document.querySelectorAll('.filter-chip').forEach(button=>button.addEventListener('click',()=>{
  document.querySelector('#active-filter-name').textContent=button.querySelector('strong').textContent;
  document.querySelector('#other-filter-info').classList.toggle('hidden',button.dataset.filter==='retrato');
}));
document.querySelector('#go-portrait').addEventListener('click',()=>document.querySelector('[data-filter="retrato"]').click());
document.querySelector('#fullscreen-toggle').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector('.camera-panel').requestFullscreen();}
  catch{document.querySelector('#studio-status').textContent='La vista ampliada no está disponible en este navegador.';}
});
document.addEventListener('fullscreenchange',()=>{
  const button=document.querySelector('#fullscreen-toggle');button.querySelector('span').textContent=document.fullscreenElement?'Reducir':'Ampliar';
  button.setAttribute('aria-label',document.fullscreenElement?'Salir de pantalla completa':'Ampliar la vista de cámara');
});

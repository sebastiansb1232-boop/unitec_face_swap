'use strict';
const $=s=>document.querySelector(s);
const names={ninguno:'Original',silueta:'Malla',perro:'Perrito',deform:'Deformar',remolino:'Remolino'};
let page=0,revision=0,selected=null;
const dates=value=>new Date(value).toLocaleString('es',{dateStyle:'medium',timeStyle:'short'});
// Elimina el token fijo de versiones anteriores; nunca se usa para autenticar.
localStorage.removeItem('admin_token');
async function api(url,options={}) {
  const res=await fetch(url,{...options,signal:AbortSignal.timeout(25000)});
  const json=await res.json();
  if(res.status===401){showLogin();throw new Error(json.error);}
  if(!res.ok)throw new Error(json.error || 'No se pudo completar la solicitud.');
  return json;
}
function showLogin(){
  revision++;$('#admin-dashboard').classList.add('hidden');$('#admin-login').classList.remove('hidden');
  $('#gallery').replaceChildren();$('#photo-detail').close();$('#detail-image').removeAttribute('src');
  $('#detail-download').removeAttribute('href');selected=null;
}
$('#admin-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;$('#admin-error').textContent='';
  try{
    await api('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('#admin-email').value,password:$('#admin-pwd').value})});
    $('#admin-pwd').value='';page=0;await loadPhotos();
  }catch(error){$('#admin-error').textContent=error.message;}
  finally{button.disabled=false;}
});
$('#logout-btn').addEventListener('click',async()=>{
  try{await api('/api/admin/logout',{method:'POST'});showLogin();}
  catch(error){$('#gallery-status').textContent=error.message;}
});
$('#refresh-btn').addEventListener('click',()=>loadPhotos());
$('#prev-page').addEventListener('click',()=>{if(page>0){page--;loadPhotos();}});
$('#next-page').addEventListener('click',()=>{page++;loadPhotos();});
function validImage(row){
  if(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(row.imagen_base64 || ''))return row.imagen_base64;
  // Compatibilidad con imágenes históricas: solo URLs HTTPS de Supabase.
  try{const url=new URL(row.imagen_url);if(url.protocol==='https:' && url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/'))return url.href;}catch{}
  return '';
}
async function loadPhotos(){
  const current=++revision;
  $('#gallery-status').textContent='Cargando fotos…';$('#refresh-btn').disabled=true;
  $('#prev-page').disabled=true;$('#next-page').disabled=true;$('#gallery').replaceChildren();
  try{
    const result=await api('/api/admin/data?offset='+page*25);
    if(current!==revision)return;
    $('#admin-login').classList.add('hidden');$('#admin-dashboard').classList.remove('hidden');
    $('#gallery-status').textContent=result.data.length ? result.data.length+' fotos en esta página.' : 'Todavía no hay fotos en esta página.';
    $('#page-label').textContent='Página '+(page+1);
    $('#prev-page').disabled=page===0;$('#next-page').disabled=!result.hasMore;
    const jobs=result.data.map(row=>{
      const card=document.createElement('button');card.className='photo-card';
      const image=document.createElement('img');image.alt='Cargando foto';image.loading='lazy';
      const copy=document.createElement('span');copy.className='card-copy';
      const name=document.createElement('strong');name.textContent=names[row.filtro] || 'Foto';
      const time=document.createElement('small');time.textContent=dates(row.creado_en);
      const info=document.createElement('small');info.textContent=row.con_landmarks?'Con malla facial':'Solo foto';
      copy.append(name,time,info);card.append(image,copy);$('#gallery').append(card);
      card.addEventListener('click',()=>openPhoto(row.id));
      return async()=>{
        try{
          const result=await api('/api/admin/photos/'+row.id);
          if(current!==revision)return;
          const src=validImage(result.data);
          if(src){image.src=src;image.alt='Foto con filtro '+(names[row.filtro] || 'Original');}
          else image.alt='Imagen no disponible';
        }catch{if(current===revision)image.alt='No se pudo cargar. Abre la foto para reintentar.';}
      };
    });
    // Limitar las descargas simultáneas de imágenes para móviles.
    await Promise.all(Array.from({length:Math.min(3,jobs.length)},async()=>{while(jobs.length && current===revision)await jobs.shift()();}));
  }catch(error){if(current===revision)$('#gallery-status').textContent=error.message;}
  finally{if(current===revision)$('#refresh-btn').disabled=false;}
}
async function openPhoto(id){
  $('#gallery-status').textContent='Abriendo foto…';
  try{
    const result=await api('/api/admin/photos/'+id);selected=result.data;
    const src=validImage(selected);if(!src)throw new Error('La imagen de este registro no está disponible.');
    $('#detail-image').src=src;$('#detail-download').href=src;$('#detail-download').download='anotherface-'+id+'.jpg';
    const points=selected.landmarks_faciales;
    $('#detail-fields').replaceChildren();
    const fields=[['Filtro',names[selected.filtro] || 'Original'],['Fecha',dates(selected.creado_en)],['Puntos',Array.isArray(points)?String(points.length):'No compartidos'],['Registro',id]];
    fields.forEach(([label,value])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;$('#detail-fields').append(dt,dd);});
    $('#show-mesh').checked=false;$('#show-mesh').disabled=!Array.isArray(points);
    $('#mesh-note').textContent=Array.isArray(points)?'Coordenadas del rostro antes del efecto. No representan medidas físicas ni identidad.':'La persona no adjuntó su malla facial.';
    drawMesh();$('#photo-detail').showModal();$('#gallery-status').textContent='';
  }catch(error){$('#gallery-status').textContent=error.message;}
}
function drawMesh(){
  const canvas=$('#detail-mesh'),image=$('#detail-image'),ctx=canvas.getContext('2d');
  canvas.width=image.naturalWidth || 960;canvas.height=image.naturalHeight || 720;
  if(!$('#show-mesh').checked || !Array.isArray(selected?.landmarks_faciales))return;
  ctx.fillStyle='#9effdf';
  selected.landmarks_faciales.forEach(p=>{
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return;
    // Nuevas capturas normalizadas; compatibilidad visual con puntos históricos en píxeles.
    const normalized=selected.landmarks_faciales.length>=468;
    ctx.beginPath();ctx.arc(normalized?p.x*canvas.width:p.x,normalized?p.y*canvas.height:p.y,1.8,0,Math.PI*2);ctx.fill();
  });
}
$('#show-mesh').addEventListener('change',drawMesh);$('#detail-image').addEventListener('load',drawMesh);
$('#close-detail').addEventListener('click',()=>$('#photo-detail').close());
loadPhotos();

'use strict';
const LOCAL='http://127.0.0.1:8766';
const validToken=value=>/^[A-Za-z0-9_-]{32,256}$/.test(value);
function aiConnection(env=process.env){
  let url;
  try{url=new URL((env.ANOTHERFACE_AI_URL||LOCAL).trim());}catch{throw new Error('ANOTHERFACE_AI_URL debe ser una URL válida del motor.');}
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Usa solo el origen del motor en ANOTHERFACE_AI_URL, sin credenciales ni rutas.');
  const remote=!['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if(!['http:','https:'].includes(url.protocol)||remote&&url.protocol!=='https:')throw new Error('La conexión con un motor remoto debe utilizar HTTPS.');
  const token=(env.ANOTHERFACE_AI_TOKEN||'').trim();
  if(remote&&!validToken(token)||token&&!validToken(token))throw new Error('Configura ANOTHERFACE_AI_TOKEN con la clave privada generada por setup:remote.');
  return {base:url.origin,remote,token,headers:token?{Authorization:'Bearer '+token}:{}};
}
module.exports={aiConnection,validToken};

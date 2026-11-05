'use strict';
const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),dotenv=require('dotenv');
const {validToken}=require('../ai-connection');
const root=path.resolve(__dirname,'..'),config=path.join(root,'.env.ai');
function startWorker(){
  if(!fs.existsSync(config))throw new Error('Primero ejecuta npm.cmd run setup:remote para crear la clave privada.');
  const settings=dotenv.parse(fs.readFileSync(config));
  if(!validToken(settings.ANOTHERFACE_AI_TOKEN||''))throw new Error('La clave de .env.ai no es válida. Consulta MIGRAR-RENDER.md.');
  const python=process.env.ANOTHERFACE_PYTHON||path.join(root,'.venv-ai',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  if(!fs.existsSync(python))throw new Error('Falta el entorno de IA. Ejecuta instalar-ia-local.bat en esta PC.');
  const models=process.env.ANOTHERFACE_MODELS||path.join(root,'local-ai/models'),manifest=JSON.parse(fs.readFileSync(path.join(root,'local-ai/models.json')));
  if(manifest.some(item=>{try{return fs.statSync(path.join(models,item.name)).size!==item.bytes;}catch{return true;}}))throw new Error('Faltan modelos completos. Libera espacio y ejecuta .venv-ai\\Scripts\\python.exe local-ai\\download_models.py.');
  const env={...process.env,ANOTHERFACE_AI_TOKEN:settings.ANOTHERFACE_AI_TOKEN,ANOTHERFACE_REQUIRE_AUTH:'1'};
  const child=spawn(python,['-u',path.join(root,'local-ai/service.py')],{cwd:root,env,stdio:'inherit',shell:false});
  let stopping=false,polling=false,reported=false,attempts=0;
  const stop=()=>{if(stopping)return;stopping=true;clearInterval(timer);if(child.exitCode===null)child.kill();};
  const timer=setInterval(async()=>{
    if(polling||reported||stopping)return;polling=true;
    try{
      const r=await fetch('http://127.0.0.1:8766/healthz',{headers:{Authorization:'Bearer '+settings.ANOTHERFACE_AI_TOKEN},signal:AbortSignal.timeout(1500)});
      if(r.status===401){console.error('El puerto 8766 lo ocupa otro motor con una clave distinta. Detén la sesión anterior y vuelve a iniciar.');stop();process.exitCode=1;return;}
      if(r.ok){const data=await r.json();if(data.ready&&data.auth_required){reported=true;clearInterval(timer);console.log('Motor protegido disponible en 127.0.0.1:8766 · '+data.provider);console.log('Deja esta terminal abierta y ejecuta iniciar-tunel-ia.bat en otra terminal.');}}
    }catch{}finally{polling=false;if(++attempts>=120){clearInterval(timer);console.log('El motor sigue cargando. Revisa los mensajes de Python antes de abrir el túnel.');}}
  },1000);
  child.once('error',e=>{console.error(e.message);stop();process.exitCode=1;});
  child.once('exit',code=>{clearInterval(timer);if(!stopping&&code){console.error('El motor se detuvo. Revisa los mensajes anteriores.');process.exitCode=code;}});
  process.once('SIGINT',stop);process.once('SIGTERM',stop);process.once('exit',()=>{if(child.exitCode===null)child.kill();});
  console.log('Cargando el motor de IA de esta PC con autenticación obligatoria…');
}
try{startWorker();}catch(e){console.error(e.message);process.exitCode=1;}

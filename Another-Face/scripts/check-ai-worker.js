'use strict';
const fs=require('node:fs'),path=require('node:path'),dotenv=require('dotenv');
const {validToken}=require('../ai-connection');
async function checkWorker(root,request=global.fetch){
  const file=path.join(root,'.env.ai');
  if(!fs.existsSync(file))throw new Error('Primero ejecuta npm.cmd run setup:remote.');
  const token=dotenv.parse(fs.readFileSync(file)).ANOTHERFACE_AI_TOKEN;
  if(!validToken(token||''))throw new Error('La clave de .env.ai no es válida.');
  const address='http://127.0.0.1:8766/healthz';
  const anonymous=await request(address,{redirect:'error',signal:AbortSignal.timeout(3000)});
  if(anonymous.status!==401)throw new Error('El motor no está protegido. Inícialo con npm.cmd run start:worker antes de abrir el túnel.');
  const authorized=await request(address,{redirect:'error',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(3000)});
  if(!authorized.ok)throw new Error('La clave no coincide con el motor activo. Detén el motor anterior y vuelve a iniciar start:worker.');
  const data=await authorized.json();
  if(!data.ready||data.auth_required!==true)throw new Error('El motor todavía no está listo o no exige autenticación.');
  return {ready:true,provider:data.provider};
}
if(require.main===module)checkWorker(path.resolve(__dirname,'..')).then(data=>console.log('Motor protegido y listo · '+data.provider)).catch(error=>{
  console.error(error.cause?'No se pudo conectar con el motor local. Abre primero npm.cmd run start:worker y espera a que cargue.':error.message);process.exitCode=1;
});
module.exports={checkWorker};

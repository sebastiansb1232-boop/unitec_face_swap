'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),dotenv=require('dotenv');
const {validToken}=require('../ai-connection');
function setupRemote(root){
  const target=path.join(root,'.env.ai');
  if(fs.existsSync(target)){
    const token=dotenv.parse(fs.readFileSync(target)).ANOTHERFACE_AI_TOKEN;
    if(!validToken(token||''))throw new Error('.env.ai existe pero su clave no es válida. Conserva una copia y vuelve a configurarlo.');
    return {file:target,created:false};
  }
  const token=crypto.randomBytes(32).toString('base64url');
  fs.writeFileSync(target,'# Privado: solo en la PC que ejecuta la IA. No subir a GitHub.\nANOTHERFACE_AI_TOKEN='+token+'\n',{flag:'wx',mode:0o600});
  return {file:target,created:true};
}
if(require.main===module){
  try{
    const result=setupRemote(path.resolve(__dirname,'..'));
    console.log(result.created?'Clave privada creada en .env.ai.':'Se reutiliza la clave privada de .env.ai.');
    console.log('Abre ese archivo localmente para copiar el valor a Render. No compartas la clave ni la pegues en el chat.');
    console.log('Siguiente paso: npm.cmd run start:worker');
  }catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={setupRemote};

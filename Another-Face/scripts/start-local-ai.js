'use strict';
const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const python=process.env.ANOTHERFACE_PYTHON||path.join(root,'.venv-ai',process.platform==='win32'?'Scripts/python.exe':'bin/python');
if(!fs.existsSync(python)){
  console.error('Primero ejecuta instalar-ia-local.bat. En Linux/macOS consulta IA-LOCAL.md.');process.exit(1);
}
const children=[],start=(command,args)=>{
  const child=spawn(command,args,{cwd:root,stdio:'inherit',shell:false});children.push(child);
  child.on('error',e=>{console.error(e.message);shutdown(1);});return child;
};
let stopping=false;
function shutdown(code=0){if(stopping)return;stopping=true;for(const child of children)if(child.exitCode===null)child.kill();process.exitCode=code;}
process.on('SIGINT',()=>shutdown());process.on('SIGTERM',()=>shutdown());process.on('exit',()=>{for(const c of children)if(c.exitCode===null)c.kill();});
const ai=start(python,['-u',path.join(root,'local-ai/service.py')]);
ai.on('exit',code=>{if(!stopping&&code)console.error('El motor neuronal se detuvo. La web sigue disponible en modo ligero.');});
start(process.execPath,[path.join(root,'server.js')]).on('exit',code=>shutdown(code||0));
console.log('Abre http://localhost:3000. El modo neuronal estará disponible cuando terminen de cargarse los modelos.');

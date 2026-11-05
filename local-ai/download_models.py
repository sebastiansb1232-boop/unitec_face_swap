"""Descarga explícita de pesos con revisión fijada, tamaño y SHA-256 verificados."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import urllib.request

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()

def main():
    p=argparse.ArgumentParser();p.add_argument('--destination',type=Path,default=Path(__file__).parent/'models');p.add_argument('--portrait',action='store_true',help='Incluye HyperSwap 1C 256 (403 MB adicionales).');p.add_argument('--avatar',action='store_true',help='Incluye LivePortrait 512 y gestos (339 MB; 0.74 MB nuevos si ya tienes los cuatro modelos).');p.add_argument('--background',action='store_true',help='Descarga solo LaMa para relleno de fondo (208 MB).');args=p.parse_args()
    args.destination.mkdir(parents=True,exist_ok=True)
    items=json.loads((Path(__file__).parent/'models.json').read_text())
    print('LaMa ONNX · Apache 2.0. Consulta THIRD_PARTY_NOTICES.md.' if args.background and not args.avatar and not args.portrait else 'Pesos de terceros para investigación no comercial. Consulta IA-LOCAL.md y sus fuentes.',flush=True)
    for item in items:
        if args.background and not args.avatar and not args.portrait and not item.get('optional'):continue
        if item.get('optional') and not {'avatar':args.avatar,'background':args.background}.get(item.get('group'),args.portrait):continue
        dest=args.destination/item['name']
        if dest.exists() and dest.stat().st_size==item['bytes'] and digest(dest)==item['sha256']:
            print(item['name']+': verificado',flush=True);continue
        temporary=dest.with_suffix('.part')
        temporary.unlink(missing_ok=True)
        if shutil.disk_usage(args.destination).free<item['bytes']+64*1024*1024:
            raise RuntimeError('Falta espacio para '+item['name']+'. Libera al menos '+str(round((item['bytes']+64*1024*1024)/1_000_000))+' MB en esta unidad.')
        print('Descargando '+item['name']+' ('+str(round(item['bytes']/1_000_000))+' MB)…',flush=True)
        try:
            request=urllib.request.Request(item['url'],headers={'User-Agent':'Anotherface-research/1.2'})
            with urllib.request.urlopen(request,timeout=60) as response,temporary.open('wb') as output:
                total=0;checkpoint=0
                while chunk:=response.read(1024*1024):
                    total+=len(chunk)
                    if total>item['bytes']:raise RuntimeError('El servidor devolvió un archivo de tamaño inesperado.')
                    output.write(chunk)
                    if total-checkpoint>=25*1024*1024:print(str(round(total/item['bytes']*100))+'%',flush=True);checkpoint=total
            if temporary.stat().st_size!=item['bytes'] or digest(temporary)!=item['sha256']:
                raise RuntimeError('La descarga no pasó la verificación SHA-256.')
            os.replace(temporary,dest);print(item['name']+': listo',flush=True)
        finally:
            temporary.unlink(missing_ok=True)

if __name__=='__main__':main()

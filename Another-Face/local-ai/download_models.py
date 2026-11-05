"""Descarga explícita de pesos con revisión fijada, tamaño y SHA-256 verificados."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import urllib.request

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()

def main():
    p=argparse.ArgumentParser();p.add_argument('--destination',type=Path,default=Path(__file__).parent/'models');args=p.parse_args()
    args.destination.mkdir(parents=True,exist_ok=True)
    items=json.loads((Path(__file__).parent/'models.json').read_text())
    print('Pesos de terceros para investigación no comercial. Consulta IA-LOCAL.md y sus fuentes.',flush=True)
    for item in items:
        dest=args.destination/item['name']
        if dest.exists() and dest.stat().st_size==item['bytes'] and digest(dest)==item['sha256']:
            print(item['name']+': verificado',flush=True);continue
        temporary=dest.with_suffix('.part')
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

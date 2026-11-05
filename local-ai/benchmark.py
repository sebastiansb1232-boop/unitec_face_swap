"""Medición reproducible del modelo local; no usa ni guarda fotografías."""
import argparse
import json
import os
from pathlib import Path
import statistics
import socket
import time

def summarize(samples):
    if not samples or any(x<=0 for x in samples):raise ValueError('Se requieren tiempos positivos.')
    median=statistics.median(samples)
    return {'samples':len(samples),'median_ms':round(median,2),'min_ms':round(min(samples),2),'max_ms':round(max(samples),2),'inference_fps':round(1000/median,2),'supports_30_inference_fps':median<=1000/30}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--samples',type=int,default=3);parser.add_argument('--models',type=Path,default=Path(os.getenv('ANOTHERFACE_MODELS',str(Path(__file__).parent/'models'))));args=parser.parse_args()
    if not 1<=args.samples<=10:parser.error('--samples debe estar entre 1 y 10.')
    try:
        connection=socket.create_connection(('127.0.0.1',8766),timeout=.3);connection.close()
    except OSError:pass
    else:parser.error('Deten start:worker con Ctrl + C antes de medir. No se cargara una segunda copia del modelo.')
    import numpy as np
    from engine import FaceEngine
    print('Deten el motor start:worker antes de medir para no duplicar el uso de GPU.',flush=True)
    engine=FaceEngine(args.models);feed={}
    for item in engine.inputs:
        value=np.zeros(tuple(int(x) for x in item.shape),dtype=np.float16 if item.type=='tensor(float16)' else np.float32)
        if value.ndim==2:value[0,0]=1
        feed[item.name]=value
    if hasattr(engine,'avatar'):feed=engine.avatar.benchmark_feed
    timings=[]
    for i in range(args.samples):
        start=time.perf_counter();engine.swapper.run(None,feed);ms=(time.perf_counter()-start)*1000;timings.append(ms)
        print('Muestra '+str(i+1)+': '+str(round(ms,1))+' ms',flush=True)
    report={'model':engine.model_name,'provider':engine.provider,'native_size':engine.native_size,'gpu_device':engine.device,'threads':engine.threads,'warmup_ms':engine.warmup_ms,**summarize(timings)}
    print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
    print('FPS de una pasada de IA con tensores sinteticos. No incluye camara, seguimiento, codificacion ni red.',flush=True)
    print('Para 30 rostros nuevos/s, la inferencia debe tardar menos de 33.3 ms y el resto de la ruta tambien debe caber en ese presupuesto.',flush=True)
    if not report['supports_30_inference_fps']:print('Esta configuracion no alcanza 30 FPS neuronales. La vista puede seguir a 30 FPS con la ultima textura.',flush=True)

if __name__=='__main__':main()

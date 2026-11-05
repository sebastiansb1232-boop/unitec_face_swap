"""Selección explícita de arquitectura; descargar un peso no modifica el runtime."""
from pathlib import Path
import json

def model_manifest():
    return json.loads((Path(__file__).parent/'models.json').read_text())

def select_swapper(folder, requested='auto'):
    if requested not in ('auto','inswapper','hyperswap','avatar'):
        raise ValueError('ANOTHERFACE_SWAPPER debe ser auto, inswapper, hyperswap o avatar.')
    if requested=='avatar':
        required=[x for x in model_manifest() if x.get('group')=='avatar' and not x.get('enhancement')]
        if len(required)!=4 or any(not (Path(folder)/x['name']).exists() or (Path(folder)/x['name']).stat().st_size!=x['bytes'] for x in required):raise RuntimeError('Faltan modelos de Avatar. Ejecuta instalar-avatar-local.bat.')
        return {'name':'live_portrait_512','file':'live_portrait_generator.onnx','size':512,'type':'avatar'}
    item=next(x for x in model_manifest() if x['name']=='hyperswap_1c_256.onnx')
    path=Path(folder)/item['name']
    installed=path.exists() and path.stat().st_size==item['bytes']
    if requested=='hyperswap' and not installed:
        raise RuntimeError('Falta HyperSwap completo. Ejecuta mejorar-ia-local.bat.')
    if installed and requested!='inswapper':
        return {'name':'hyperswap_1c_256','file':item['name'],'size':256,'type':'hyperswap'}
    return {'name':'inswapper_128_fp16','file':'inswapper_128_fp16.onnx','size':128,'type':'inswapper'}

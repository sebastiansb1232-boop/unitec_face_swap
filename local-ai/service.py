"""Servidor opcional de inferencia, limitado a la interfaz local de la computadora."""
import asyncio
from contextlib import asynccontextmanager
import os
import time
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from api_auth import APIAuth, APIAuthMiddleware
api_auth=APIAuth(os.getenv('ANOTHERFACE_AI_TOKEN','').strip(),os.getenv('ANOTHERFACE_REQUIRE_AUTH')=='1')
from engine import FaceEngine

engine = None
busy = asyncio.Lock()

@asynccontextmanager
async def lifespan(app):
    global engine
    folder = os.getenv('ANOTHERFACE_MODELS', str(Path(__file__).parent/'models'))
    engine = await asyncio.to_thread(FaceEngine,folder)
    async def prune():
        while True:
            await asyncio.sleep(30)
            if engine is not None and not busy.locked():
                now=time.monotonic();engine.sources={k:v for k,v in engine.sources.items() if now-v[1]<900}
    cleanup=asyncio.create_task(prune())
    try:yield
    finally:cleanup.cancel();engine = None

app = FastAPI(lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)
app.add_middleware(APIAuthMiddleware,auth=api_auth)

class ImageInput(BaseModel):
    image: str = Field(max_length=5_400_000)
    points: list[list[float]] = Field(min_length=468,max_length=478)

class ReferenceView(ImageInput):
    side: Literal['left','right']

class ReferenceInput(ImageInput):
    views: list[ReferenceView] = Field(default_factory=list,max_length=2)

class Settings(BaseModel):
    strength: float = Field(default=1,ge=0,le=1)
    mouth: float = Field(default=.22,ge=0,le=1)
    eyes: float = Field(default=.08,ge=0,le=1)
    color: float = Field(default=.45,ge=0,le=1)
    detail: float = Field(default=.15,ge=0,le=.35)
    forehead: float = Field(default=.04,ge=0,le=1)
    chin: float = Field(default=.01,ge=0,le=1)
    softness: float = Field(default=.45,ge=0,le=1)
    quality: Literal['balanced','detail'] = 'balanced'
    transport: Literal['patch','legacy'] = 'legacy'
    texture_codec: Literal['jpeg','png'] = 'jpeg'
    identity_strength: float = Field(default=0,ge=0,le=1)
    driver_id: int = Field(default=0,ge=0,le=2147483647)

class FrameInput(ImageInput):
    client_protocol: int = Field(default=0,ge=0,le=100)
    reference_id: str = Field(min_length=20,max_length=64,pattern=r'^[A-Za-z0-9_-]+$')
    settings: Settings = Field(default_factory=Settings)

@app.get('/healthz')
async def health():
    return {'ready':engine is not None,'provider':engine.provider if engine else None,'model':getattr(engine,'model_name','inswapper_128_fp16'),'native_size':getattr(engine,'native_size',128),'version':10,'app_version':'1.11.0','render_protocol':5,'reference_views':3,'patch_output':True,'auth_required':bool(api_auth.token),'threads':engine.threads if engine else None,'device':engine.device if engine else None,'acceleration_warning':engine.acceleration_warning if engine else None}

async def execute(fn,*args):
    if engine is None: raise HTTPException(503,'El motor todavía se está cargando.')
    if busy.locked(): raise HTTPException(429,'El motor está ocupado; se descarta este fotograma.',headers={'Retry-After':'1'})
    async with busy:
        try: return await asyncio.to_thread(fn,*args)
        except KeyError as e: raise HTTPException(410,str(e).strip("'")) from e
        except ValueError as e: raise HTTPException(400,str(e)) from e
        except Exception as e:
            print('No se pudo procesar el fotograma:',type(e).__name__,flush=True)
            raise HTTPException(503,'No se pudo procesar este fotograma.') from e

@app.post('/reference')
async def reference(data:ReferenceInput):
    if engine is None: raise HTTPException(503,'Motor no disponible.')
    token=await execute(engine.reference,data.image,data.points,[v.model_dump() for v in data.views])
    return {'reference_id':token,'reference_views':1+len(data.views)}

@app.post('/frame')
async def frame(data:FrameInput):
    if data.client_protocol<5 or data.settings.transport!='patch':raise HTTPException(426,'Actualiza el código de Render, recarga la página y reinicia el motor de la PC con la entrega 1.10.')
    if engine is None: raise HTTPException(503,'Motor no disponible.')
    return await execute(engine.frame,data.reference_id,data.image,data.points,data.settings.model_dump())

if __name__=='__main__':
    import uvicorn
    uvicorn.run(app,host='127.0.0.1',port=8766,log_level='warning',access_log=False)

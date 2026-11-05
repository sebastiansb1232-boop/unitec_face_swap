"""Animación local de la fotografía con LivePortrait ONNX, salida real de 512.

La apariencia se extrae de la referencia una sola vez; del conductor se utiliza
pose y cambio de expresión. No se mezclan los píxeles de su piel.
"""
import gc
import os
from pathlib import Path
import time
import cv2
import numpy as np
import onnxruntime as ort

FILES={'feature':'live_portrait_feature_extractor.onnx','motion':'live_portrait_motion_extractor.onnx','generator':'live_portrait_generator.onnx','stitch':'live_portrait_stitcher.onnx'}

def rotation(pitch,yaw,roll):
    x,y,z=np.deg2rad([float(pitch),float(yaw),float(roll)])
    cx,sx=np.cos(x),np.sin(x);cy,sy=np.cos(y),np.sin(y);cz,sz=np.cos(z),np.sin(z)
    rx=np.array([[1,0,0],[0,cx,-sx],[0,sx,cx]])
    ry=np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]])
    rz=np.array([[cz,-sz,0],[sz,cz,0],[0,0,1]])
    return (rz @ ry @ rx).astype(np.float32)

def transform_motion(motion,angles=None,expression=None):
    angles=angles if angles is not None else [motion[k] for k in ['pitch','yaw','roll']]
    r=rotation(*angles);exp=motion['expression'] if expression is None else expression
    points=motion['motion_points'] @ r.T + exp
    points=points*motion['scale'].reshape(1,1,1)
    translation=motion['translation'].copy().reshape(1,1,3);translation[:,:,2]=0
    return (points+translation).astype(np.float32)

def expression_transfer(source,driver,neutral,strength=.65,yaw=0):
    # Mantener anatomía y expresión base del retrato; trasladar solo el gesto.
    amplitude=1-.22*float(strength)
    delta=driver-neutral
    limit=.09*(1-.35*np.clip((abs(float(yaw))-35)/40,0,1))
    norm=np.linalg.norm(delta,axis=-1,keepdims=True)
    return source+delta*(limit/np.sqrt(norm*norm+limit*limit))*amplitude

def choose_view(views,yaw,previous=None,hysteresis=9):
    best=min(range(len(views)),key=lambda i:abs(float(views[i]['yaw'])-yaw))
    if previous is not None and abs(float(views[previous]['yaw'])-yaw)<=abs(float(views[best]['yaw'])-yaw)+hysteresis:return previous
    return best

class PortraitAnimator:
    def __init__(self,folder,plan,options_factory):
        self.sessions={};warnings=[]
        for provider,options in plan:
            candidate={}
            try:
                if provider=='CUDAExecutionProvider' and os.name=='nt' and hasattr(ort,'preload_dlls'):ort.preload_dlls()
                providers=[(provider,options),'CPUExecutionProvider'] if provider!='CPUExecutionProvider' else [provider]
                for key,name in FILES.items():
                    candidate[key]=ort.InferenceSession(str(Path(folder)/name),sess_options=options_factory(provider=='DmlExecutionProvider'),providers=providers)
                    if provider!='CPUExecutionProvider' and provider not in candidate[key].get_providers():raise RuntimeError('Proveedor no inicializado.')
                self.sessions=candidate
                started=time.perf_counter();tensor=np.zeros((1,3,256,256),np.float32)
                feature=self.sessions['feature'].run(None,{'input':tensor})[0];motion=self.extract_motion_tensor(tensor);points=transform_motion(motion)
                feed={'feature_volume':feature,'source':points,'target':points};image=self.sessions['generator'].run(None,feed)[0]
                if image.shape!=(1,3,512,512) or not np.isfinite(image).all():raise RuntimeError('Salida de avatar no válida.')
                self.benchmark_feed=feed;self.warmup_ms=round((time.perf_counter()-started)*1000);self.provider=self.sessions['generator'].get_providers()[0];break
            except Exception:
                self.sessions={};candidate.clear();gc.collect()
                if provider=='CPUExecutionProvider':raise
                warnings.append(provider.replace('ExecutionProvider','')+' no pudo ejecutar Avatar; se probó la alternativa.')
        if not self.sessions:raise RuntimeError('No se pudo cargar Avatar.')
        self.warning=' '.join(warnings) or None
        self.generator=self.sessions['generator']

    @staticmethod
    def tensor(image):
        resized=cv2.resize(image,(256,256),interpolation=cv2.INTER_AREA)
        return np.ascontiguousarray(resized[:,:,::-1].transpose(2,0,1)[None],dtype=np.float32)/255

    def extract_motion_tensor(self,tensor):
        session=self.sessions['motion'];values=session.run(None,{'input':tensor})
        return dict(zip([x.name for x in session.get_outputs()],values))

    def prepare(self,crops):
        views=[]
        for crop in crops:
            tensor=self.tensor(crop['image']);motion=self.extract_motion_tensor(tensor)
            feature=self.sessions['feature'].run(None,{'input':tensor})[0]
            views.append({'side':crop['side'],'yaw':float(motion['yaw']),'motion':motion,'feature':feature,'points':transform_motion(motion)})
        return {'views':views,'driver_id':None,'neutral':None,'active':None}

    def render(self,state,crop,driver_id,strength):
        driving=self.extract_motion_tensor(self.tensor(crop))
        if state['neutral'] is None or state['driver_id']!=driver_id:
            state['neutral']={k:v.copy() for k,v in driving.items()};state['driver_id']=driver_id
        index=choose_view(state['views'],float(driving['yaw']),state['active']);state['active']=index;source=state['views'][index]
        expression=expression_transfer(source['motion']['expression'],driving['expression'],state['neutral']['expression'],strength,float(driving['yaw']))
        angles=[np.clip(float(driving[k]),-limit,limit) for k,limit in [('pitch',40),('yaw',80),('roll',50)]]
        target=transform_motion(source['motion'],angles,expression)
        stitched=self.sessions['stitch'].run(None,{'source':target,'target':source['points']})[0]
        image=self.generator.run(None,{'feature_volume':source['feature'],'source':stitched,'target':source['points']})[0]
        pixels=np.clip(image[0].transpose(1,2,0)[:,:,::-1]*255,0,255)
        return pixels.astype(np.float32),source['side']

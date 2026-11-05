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

def facial_ratios(points):
    if points is None or len(points)<468:return None
    p=np.asarray(points,np.float32);span=lambda a,b:max(float(np.linalg.norm(p[a]-p[b])),1.)
    eyes=[np.clip(span(t,d)/span(a,b),0,.6) for a,b,t,d in [(33,133,159,145),(263,362,386,374)]]
    mouth=float(np.median([np.linalg.norm(p[a]-p[b])/span(61,291) for a,b in [(13,14),(82,87),(312,317)]]))
    return np.asarray([*eyes,np.clip(mouth,0,.9)],np.float32)

def retarget_goals(source,driver,neutral):
    # Apertura relativa: conservar las proporciones del retrato al calibrar.
    eyes=np.clip(source[:2].mean()*driver[:2].mean()/max(float(neutral[:2].mean()),.04),0,.6)
    mouth=np.clip(source[2]+driver[2]-neutral[2],0,.85)
    return float(eyes),float(mouth)

def bounded_residual(delta,limit=.045):
    norm=np.linalg.norm(delta,axis=-1,keepdims=True)
    return delta*(limit/np.sqrt(norm*norm+limit*limit))

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
        self.sessions={};self.retargeters={};warnings=[]
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
        # Dos redes pequeñas de LivePortrait (< 1 MB juntas), en CPU para no
        # reservar otra sesión DirectML ni competir por la memoria de la GPU.
        for kind in ['eye','lip']:
            file=Path(folder)/('live_portrait_'+kind+'_retargeter.onnx')
            if file.is_file():
                try:self.retargeters[kind]=ort.InferenceSession(str(file),sess_options=options_factory(False,threads=1),providers=['CPUExecutionProvider'])
                except Exception:warnings.append('No se pudo cargar el ajuste de '+kind+'.')
        self.warning=' '.join(warnings) or None

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
            points=transform_motion(motion);ratios=facial_ratios(crop.get('points'))
            view={'side':crop['side'],'yaw':float(motion['yaw']),'motion':motion,'feature':feature,'points':points,'ratios':ratios}
            if ratios is not None:
                for kind in self.retargeters:view[kind+'_baseline']=self.retarget(kind,points,ratios,float(ratios[:2].mean() if kind=='eye' else ratios[2]))
            views.append(view)
        return {'views':views,'driver_id':None,'neutral':None,'active':None}

    def retarget(self,kind,points,ratios,goal):
        values=[*ratios[:2],goal] if kind=='eye' else [ratios[2],goal]
        feed=np.concatenate([points.reshape(-1),np.asarray(values,np.float32)])[None].astype(np.float32)
        output=self.retargeters[kind].run(None,{'input':feed})[0]
        if output.size!=63 or not np.isfinite(output).all():raise RuntimeError('Ajuste de gesto no válido.')
        return output.reshape(1,21,3)

    def render(self,state,crop,driver_id,strength,landmarks=None):
        driving=self.extract_motion_tensor(self.tensor(crop))
        ratios=facial_ratios(landmarks)
        if state['neutral'] is None or state['driver_id']!=driver_id:
            state['neutral']={k:v.copy() for k,v in driving.items()};state['driver_id']=driver_id;state['neutral_ratios']=ratios
        index=choose_view(state['views'],float(driving['yaw']),state['active']);state['active']=index;source=state['views'][index]
        expression=expression_transfer(source['motion']['expression'],driving['expression'],state['neutral']['expression'],strength,float(driving['yaw']))
        angles=[np.clip(float(driving[k]),-limit,limit) for k,limit in [('pitch',40),('yaw',80),('roll',50)]]
        target=transform_motion(source['motion'],angles,expression)
        if ratios is not None and source['ratios'] is not None and state.get('neutral_ratios') is not None:
            goals=retarget_goals(source['ratios'],ratios,state['neutral_ratios']);correction=np.zeros_like(target)
            for kind,goal in zip(['eye','lip'],goals):
                if kind in self.retargeters:correction+=bounded_residual(self.retarget(kind,source['points'],source['ratios'],goal)-source[kind+'_baseline'])*.55
            delta_rotation=rotation(*angles)@rotation(*[source['motion'][k] for k in ['pitch','yaw','roll']]).T
            target+=correction@delta_rotation.T
        stitched=self.sessions['stitch'].run(None,{'source':target,'target':source['points']})[0]
        image=self.generator.run(None,{'feature_volume':source['feature'],'source':stitched,'target':source['points']})[0]
        pixels=np.clip(image[0].transpose(1,2,0)[:,:,::-1]*255,0,255)
        return pixels.astype(np.float32),source['side']

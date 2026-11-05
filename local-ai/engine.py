"""Intercambio ONNX local. Alineación de cinco puntos y composición por regiones.

La convención de entrada y la proyección de identidad siguen la documentación de
InsightFace (MIT). No contiene código de Deep Live Cam ni sus ediciones de pago.
"""
import os
os.environ.setdefault('OPENCV_IO_MAX_IMAGE_PIXELS', '4000000')
import base64
import gc
import json
from pathlib import Path
import secrets
import time
import cv2
import numpy as np
import onnx
from onnx import numpy_helper
import onnxruntime as ort
from runtime_config import provider_plan
cv2.setNumThreads(1)

OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
EYES = [[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7], [263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249]]
MOUTH = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146]
FOREHEAD = [10,338,297,332,284,251,300,293,334,296,336,9,107,66,105,63,70,21,54,103,67,109]
CHIN = [152,377,400,378,379,365,18,200,199,175,171,140,176,148]
TEMPLATE = np.array([[38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],[41.5493,92.3655],[70.7299,92.2041]], dtype=np.float32)

def decode_image(data):
    if not isinstance(data, str) or len(data) > 5_400_000 or not data.startswith(('data:image/jpeg;base64,', 'data:image/png;base64,')):
        raise ValueError('Se requiere una imagen JPEG o PNG de menos de 4 MB.')
    try:
        binary = base64.b64decode(data.split(',', 1)[1], validate=True)
        image = cv2.imdecode(np.frombuffer(binary, dtype=np.uint8), cv2.IMREAD_COLOR)
    except Exception as error:
        raise ValueError('La imagen no se pudo decodificar.') from error
    if image is None or max(image.shape[:2]) > 2048 or image.shape[0] * image.shape[1] > 4_000_000:
        raise ValueError('La imagen debe tener como máximo 2048 píxeles por lado.')
    return image

def points_array(points, shape):
    p = np.asarray(points, dtype=np.float32)
    h, w = shape[:2]
    if p.shape not in [(468,2),(478,2)] or not np.isfinite(p).all() or np.max(np.abs(p)) > max(w,h)*2:
        raise ValueError('La malla facial no es válida.')
    return p

def five_points(points):
    eyes = points[[468,473]] if len(points) == 478 else np.array([(points[33]+points[133])/2, (points[263]+points[362])/2])
    eyes = eyes[np.argsort(eyes[:,0])]
    mouth = points[[61,291]]; mouth = mouth[np.argsort(mouth[:,0])]
    if np.linalg.norm(eyes[0]-eyes[1]) < 18:
        raise ValueError('Acerca el rostro a la cámara.')
    return np.array([eyes[0], eyes[1], points[1], mouth[0], mouth[1]], dtype=np.float32)

def alignment(points, size):
    """Similitud por mínimos cuadrados; mantiene la convención 112/128 de ArcFace."""
    destination = TEMPLATE.copy()
    if size % 112 == 0:
        destination *= size/112
    elif size % 128 == 0:
        destination[:,0] += 8
        destination *= size/128
    else:
        raise ValueError('Tamaño de alineación no compatible.')
    source = np.asarray(points, np.float64)
    target = destination.astype(np.float64)
    center_a, center_b = source.mean(0), target.mean(0)
    a, b = source-center_a, target-center_b
    u, singular, vt = np.linalg.svd(b.T @ a / len(a))
    sign = np.ones(2); sign[-1] = np.sign(np.linalg.det(u @ vt))
    rotation = u @ np.diag(sign) @ vt
    scale = (singular*sign).sum() / max((a*a).sum()/len(a), 1e-8)
    matrix = np.empty((2,3)); matrix[:,:2] = scale*rotation
    matrix[:,2] = center_b-matrix[:,:2] @ center_a
    if not np.isfinite(matrix).all():
        raise ValueError('No se pudo alinear el rostro.')
    return matrix.astype(np.float32)

def transform(points, matrix):
    return np.asarray(points) @ matrix[:,:2].T + matrix[:,2]

def region_mask(points, ids, size=256, feather=13):
    mask = np.zeros((size,size), np.float32)
    hull = cv2.convexHull(np.rint(points[ids]).astype(np.int32))
    cv2.fillConvexPoly(mask, hull, 1.)
    return np.clip(cv2.GaussianBlur(mask, (feather,feather), 0), 0, 1)

def composite_patch(generated, original, points, settings):
    """Colores acotados, textura de la captura y máscaras suaves de ojos y boca."""
    size = 256
    fake = cv2.resize(generated, (size,size), interpolation=cv2.INTER_LANCZOS4).astype(np.float32)
    real = original.astype(np.float32)
    feather=int(11+float(settings.get('softness',.65))*20)|1
    face_mask = region_mask(points, OVAL, size, feather)
    face_mask[:5,:] = face_mask[-5:,:] = 0; face_mask[:,:5] = face_mask[:,-5:] = 0
    face_mask = cv2.GaussianBlur(face_mask, (13,13), 0)
    core = face_mask > .85
    color = float(settings.get('color', .45))
    if core.sum() > 60 and color > 0:
        # El modelo ya aporta luz del conductor: corregir con moderación evita una cara plana.
        a = cv2.cvtColor(np.uint8(np.clip(fake,0,255)), cv2.COLOR_BGR2LAB).astype(np.float32)
        b = cv2.cvtColor(original, cv2.COLOR_BGR2LAB).astype(np.float32)
        am, bm = np.median(a[core], axis=0), np.median(b[core], axis=0)
        spread_a, spread_b = a[core].std(0), b[core].std(0)
        gain = np.clip(spread_b/np.maximum(spread_a,4), .8, 1.2)
        corrected = (a-am)*gain+am+np.clip(bm-am, -22, 22)
        matched = cv2.cvtColor(np.uint8(np.clip(corrected,0,255)), cv2.COLOR_LAB2BGR).astype(np.float32)
        fake += (matched-fake)*color
    detail = float(settings.get('detail', .15))
    luminance = cv2.cvtColor(original, cv2.COLOR_BGR2GRAY).astype(np.float32)
    micro = np.clip(luminance-cv2.GaussianBlur(luminance,(0,0),1.3), -12,12)
    fake += micro[:,:,None]*detail
    eye_strengths=[]
    for a,b,top,bottom in [(33,133,159,145),(263,362,386,374)]:
        width=np.linalg.norm(points[a]-points[b]);height=np.linalg.norm(points[top]-points[bottom])
        blink=float(np.clip((.18-height/max(width,1))/.1,0,1)) if width>5 else 0
        eye_strengths.append(max(float(settings.get('eyes',.35)),blink*.95))
    width=np.linalg.norm(points[61]-points[291]);openness=np.linalg.norm(points[13]-points[14])/max(width,1)
    mouth_strength=max(float(settings.get('mouth',.7)),float(np.clip((openness-.12)/.15,0,1))*.92 if width>5 else 0)
    for ids, strength in [(MOUTH,mouth_strength), (EYES[0],eye_strengths[0]),(EYES[1],eye_strengths[1]),(FOREHEAD,settings.get('forehead',.75)),(CHIN,settings.get('chin',.12))]:
        mask = region_mask(points, ids, size, 15)*float(strength)
        fake = fake*(1-mask[:,:,None])+real*mask[:,:,None]
    return np.uint8(np.clip(fake,0,255)), np.clip(face_mask*float(settings.get('strength',1)),0,1)

class FaceEngine:
    def __init__(self, models_dir):
        folder = Path(models_dir)
        manifest = json.loads((Path(__file__).parent/'models.json').read_text())
        for item in manifest:
            path = folder/item['name']
            if not path.exists() or path.stat().st_size != item['bytes']:
                raise RuntimeError('Faltan modelos completos. Ejecuta instalar-ia-local.bat o local-ai/download_models.py.')
        # Extraer la matriz antes de crear las sesiones mantiene menor el pico de memoria.
        model = onnx.load(str(folder/'inswapper_128_fp16.onnx'), load_external_data=False)
        candidates = [x for x in model.graph.initializer if list(x.dims)==[512,512]]
        if not candidates:
            raise RuntimeError('El modelo de intercambio no contiene la proyección de identidad esperada.')
        self.projection = numpy_helper.to_array(candidates[-1]).astype(np.float32).copy()
        del model; gc.collect()
        available = ort.get_available_providers()
        requested = os.getenv('ANOTHERFACE_PROVIDER','auto').lower()
        self.device=int(os.getenv('ANOTHERFACE_GPU_DEVICE','0'))
        plan=provider_plan(available,requested,self.device)
        self.threads=max(1,min(8,int(os.getenv('ANOTHERFACE_THREADS',str(min(4,max(1,(os.cpu_count() or 4)//2)))))))
        def session_options(dml=False,threads=None):
            options=ort.SessionOptions();options.intra_op_num_threads=threads or self.threads;options.inter_op_num_threads=1
            options.execution_mode=ort.ExecutionMode.ORT_SEQUENTIAL;options.enable_mem_pattern=not dml
            options.graph_optimization_level=ort.GraphOptimizationLevel.ORT_ENABLE_ALL;options.log_severity_level=3
            options.add_session_config_entry('session.intra_op.allow_spinning','0')
            options.add_session_config_entry('session.inter_op.allow_spinning','0')
            return options
        # ArcFace se ejecuta una vez por referencia. Reservar la GPU al intercambio evita competencia.
        self.recognizer=ort.InferenceSession(str(folder/'arcface_w600k_r50.onnx'),sess_options=session_options(threads=1),providers=['CPUExecutionProvider'])
        warnings=[]
        self.swapper=None
        if requested not in ['auto','cpu'] and plan[0][0]=='CPUExecutionProvider':warnings.append('El proveedor solicitado no está instalado; se utiliza CPU.')
        for provider,options in plan:
            try:
                if provider=='CUDAExecutionProvider' and os.name=='nt' and hasattr(ort,'preload_dlls'):ort.preload_dlls()
                providers=[(provider,options),'CPUExecutionProvider'] if provider!='CPUExecutionProvider' else [provider]
                candidate=ort.InferenceSession(str(folder/'inswapper_128_fp16.onnx'),sess_options=session_options(provider=='DmlExecutionProvider'),providers=providers)
                if provider!='CPUExecutionProvider' and provider not in candidate.get_providers():
                    warnings.append(provider.replace('ExecutionProvider','')+' no pudo inicializarse.')
                    del candidate;gc.collect();continue
                self.swapper=candidate;break
            except Exception:
                if provider=='CPUExecutionProvider':raise
                warnings.append(provider.replace('ExecutionProvider','')+' no pudo inicializarse.')
        if self.swapper is None:raise RuntimeError('No se pudo iniciar ningún proveedor de inferencia.')
        self.acceleration_warning=' '.join(warnings) or None
        self.provider = self.swapper.get_providers()[0]
        self.inputs=self.swapper.get_inputs()
        self.sources = {}
        print('Another Face · motor '+self.provider+' · '+str(self.threads)+' hilos CPU'+(' · GPU '+str(self.device) if self.provider!='CPUExecutionProvider' else ''),flush=True)

    def reference(self, image_data, landmark_data):
        image = decode_image(image_data); points = points_array(landmark_data, image.shape)
        matrix = alignment(five_points(points),112)
        crop = cv2.warpAffine(image, matrix, (112,112), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)
        tensor = cv2.dnn.blobFromImage(crop, 1/127.5, (112,112), (127.5,127.5,127.5), swapRB=True)
        embedding = self.recognizer.run(None,{self.recognizer.get_inputs()[0].name:tensor})[0].reshape(1,-1)
        embedding /= max(float(np.linalg.norm(embedding)), 1e-8)
        latent = embedding @ self.projection
        latent /= max(float(np.linalg.norm(latent)),1e-8)
        now = time.monotonic()
        self.sources = {k:v for k,v in self.sources.items() if now-v[1]<900}
        if len(self.sources)>=8:
            del self.sources[min(self.sources, key=lambda k:self.sources[k][1])]
        token = secrets.token_urlsafe(24); self.sources[token]=(latent.astype(np.float32),now)
        return token

    def frame(self, token, image_data, landmark_data, settings):
        request_started=time.perf_counter()
        if token not in self.sources or time.monotonic()-self.sources[token][1]>900:
            raise KeyError('La referencia caducó. Vuelve a activar el modo neuronal.')
        latent,_ = self.sources[token]; self.sources[token]=(latent,time.monotonic())
        image = decode_image(image_data); points = points_array(landmark_data,image.shape)
        started = time.perf_counter(); matrix = alignment(five_points(points),128)
        crop = cv2.warpAffine(image,matrix,(128,128),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT_101)
        tensor = cv2.dnn.blobFromImage(crop,1/255,(128,128),swapRB=True)
        feed = {}
        for item in self.inputs:
            value = tensor if len(item.shape)==4 else latent
            feed[item.name]=value.astype(np.float16 if item.type=='tensor(float16)' else np.float32,copy=False)
        inference_started=time.perf_counter()
        prediction = self.swapper.run(None,feed)[0]
        inference_ms=(time.perf_counter()-inference_started)*1000
        generated = np.uint8(np.clip(prediction[0].transpose(1,2,0)[:,:,::-1]*255,0,255))
        matrix256=matrix*2
        target=cv2.warpAffine(image,matrix256,(256,256),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT_101)
        patch,mask=composite_patch(generated,target,transform(points,matrix256),settings)
        inverse=cv2.invertAffineTransform(matrix256); h,w=image.shape[:2]
        warped=cv2.warpAffine(patch,inverse,(w,h),flags=cv2.INTER_LINEAR)
        alpha=cv2.warpAffine(mask,inverse,(w,h),flags=cv2.INTER_LINEAR)[:,:,None]
        # Igualar gradientes en la unión elimina parches de baja frecuencia sin alisar la cara.
        clone_mask=np.uint8(np.clip(alpha[:,:,0]*255,0,255))
        x,y,width,height=cv2.boundingRect(clone_mask)
        if width>10 and height>10 and x>1 and y>1 and x+width<w-1 and y+height<h-1:
            center=(x+width//2,y+height//2)
            try:warped=cv2.seamlessClone(warped,image,clone_mask,center,cv2.NORMAL_CLONE)
            except cv2.error:pass
        result=np.uint8(np.clip(image*(1-alpha)+warped*alpha,0,255))
        ok,jpeg=cv2.imencode('.jpg',result,[cv2.IMWRITE_JPEG_QUALITY,92])
        if not ok: raise RuntimeError('No se pudo codificar el resultado.')
        elapsed=(time.perf_counter()-request_started)*1000
        return {'image':'data:image/jpeg;base64,'+base64.b64encode(jpeg).decode('ascii'),'ms':round(elapsed),'provider':self.provider,'timing':{'inference_ms':round(inference_ms,1),'other_ms':round(elapsed-inference_ms,1)}}

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
from model_config import model_manifest, select_swapper
cv2.setNumThreads(1)

OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
EYES = [[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7], [263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249]]
MOUTH = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146]
FOREHEAD = [10,338,297,332,284,251,300,293,334,296,336,9,107,66,105,63,70,21,54,103,67,109]
CHIN = [152,377,400,378,379,365,18,200,199,175,171,140,176,148]
FACE_TRIANGLES=np.asarray(json.loads((Path(__file__).parent/'face_triangles.json').read_text()),np.int32)
TEMPLATE = np.array([[38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],[41.5493,92.3655],[70.7299,92.2041]], dtype=np.float32)
FFHQ = np.array([[.37691676,.46864664],[.62285697,.46912813],[.50123859,.61331904],[.39308822,.72541100],[.61150205,.72490465]],np.float32)

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
    # El iris se desplaza al mirar a los lados; no debe arrastrar todo el rostro.
    eyes = np.array([(points[33]+points[133])/2, (points[263]+points[362])/2])
    eyes = eyes[np.argsort(eyes[:,0])]
    mouth = points[[61,291]]; mouth = mouth[np.argsort(mouth[:,0])]
    if np.linalg.norm(eyes[0]-eyes[1]) < 18:
        raise ValueError('Acerca el rostro a la cámara.')
    return np.array([eyes[0], eyes[1], points[1], mouth[0], mouth[1]], dtype=np.float32)

def alignment(points, size, template=None):
    """Similitud por mínimos cuadrados; mantiene la convención 112/128 de ArcFace."""
    destination = TEMPLATE.copy() if template is None else np.asarray(template,np.float32)*size
    if template is not None:pass
    elif size % 112 == 0:
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

def inward_face_mask(points, size=256, feather=7):
    """Transición solo dentro del contorno; nunca extiende color al fondo."""
    binary=np.zeros((size,size),np.uint8)
    coordinates=np.rint(points[:468]).astype(np.int32)
    # Unión de la superficie proyectada: incluye la nariz que sobresale al girar.
    for triangle in FACE_TRIANGLES:cv2.fillConvexPoly(binary,coordinates[triangle],1)
    for ids in [*EYES,MOUTH]:cv2.fillPoly(binary,[coordinates[ids]],1)
    binary[:2,:]=binary[-2:,:]=0;binary[:,:2]=binary[:,-2:]=0
    binary=cv2.erode(binary,np.ones((3,3),np.uint8),iterations=1)
    distance=cv2.distanceTransform(binary,cv2.DIST_L2,3)
    alpha=np.clip((distance-.5)/max(float(feather),1),0,1)
    return alpha*alpha*(3-2*alpha)

def pixel_boost(crop, infer, quality='balanced', native_size=128):
    """Una pasada nativa o cuatro fases. El tamaño real lo fija la arquitectura."""
    if quality=='balanced':
        small=cv2.resize(crop,(native_size,native_size),interpolation=cv2.INTER_AREA)
        return infer(small),1
    if quality!='detail':raise ValueError('El perfil de detalle no es válido.')
    size=native_size*2
    high=cv2.resize(crop,(size,size),interpolation=cv2.INTER_LINEAR)
    result=np.empty((size,size,3),np.float32)
    for row in range(2):
        for column in range(2):
            phase=np.ascontiguousarray(high[row::2,column::2])
            result[row::2,column::2]=infer(phase)
    return result,4

def rebuild_mask(phases, native_size):
    if not phases:return None
    if len(phases) not in (1,4) or any(p.shape!=(native_size,native_size) or not np.isfinite(p).all() for p in phases):
        raise RuntimeError('El modelo devolvió una máscara no válida.')
    if len(phases)==1:return np.clip(phases[0],0,1)
    mask=np.empty((native_size*2,native_size*2),np.float32)
    for i,phase in enumerate(phases):mask[i//2::2,i%2::2]=phase
    return np.clip(mask,0,1)

def composite_patch(generated, original, points, settings, preserve_features=True, model_mask=None):
    """Colores acotados, textura de la captura y máscaras suaves de ojos y boca."""
    size = original.shape[0]
    fake = cv2.resize(generated, (size,size), interpolation=cv2.INTER_LANCZOS4).astype(np.float32)
    real = original.astype(np.float32)
    face_mask = inward_face_mask(points,size,4+float(settings.get('softness',.5))*8)
    if model_mask is not None:
        # El contorno generado puede diferir del conductor. La máscara aprendida
        # manda dentro de una región facial ampliada, sin pintar todo el recorte.
        guard=cv2.dilate(np.uint8(face_mask>0),np.ones((max(3,int(size*.08)|1),)*2,np.uint8))
        distance=cv2.distanceTransform(guard,cv2.DIST_L2,3)
        guard_alpha=np.clip((distance-.5)/max(3,size*.02),0,1)
        learned=cv2.resize(model_mask,(size,size),interpolation=cv2.INTER_LINEAR)
        learned=np.clip((learned-.08)/.65,0,1);learned=learned*learned*(3-2*learned)
        face_mask=np.minimum(guard_alpha,learned)
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
    # Nitidez de la cara generada: nunca reinyectar arrugas o sombras del conductor.
    micro=np.clip(fake-cv2.GaussianBlur(fake,(0,0),.8),-8,8)
    fake += micro*detail*.6*face_mask[:,:,None]
    eye_strengths=[]
    for a,b,top,bottom in [(33,133,159,145),(263,362,386,374)]:
        width=np.linalg.norm(points[a]-points[b]);height=np.linalg.norm(points[top]-points[bottom])
        blink=float(np.clip((.18-height/max(width,1))/.1,0,1)) if width>5 else 0
        eye_strengths.append(max(float(settings.get('eyes',.35)),blink*.95))
    width=np.linalg.norm(points[61]-points[291]);openness=np.linalg.norm(points[13]-points[14])/max(width,1)
    mouth_strength=max(float(settings.get('mouth',.7)),float(np.clip((openness-.12)/.15,0,1))*.92 if width>5 else 0)
    if preserve_features:
        for ids, strength in [(MOUTH,mouth_strength), (EYES[0],eye_strengths[0]),(EYES[1],eye_strengths[1]),(FOREHEAD,settings.get('forehead',.10)),(CHIN,settings.get('chin',.05))]:
            mask = region_mask(points, ids, size, 11)*float(strength)
            fake = fake*(1-mask[:,:,None])+real*mask[:,:,None]
    return np.uint8(np.clip(fake,0,255)), np.clip(face_mask*float(settings.get('strength',1)),0,1)

class FaceEngine:
    def __init__(self, models_dir):
        folder = Path(models_dir)
        manifest = model_manifest()
        for item in (x for x in manifest if not x.get('optional')):
            path = folder/item['name']
            if not path.exists() or path.stat().st_size != item['bytes']:
                raise RuntimeError('Faltan modelos completos. Ejecuta instalar-ia-local.bat o local-ai/download_models.py.')
        self.model=select_swapper(folder,os.getenv('ANOTHERFACE_SWAPPER','auto').lower())
        self.model_name=self.model['name'];self.native_size=self.model['size']
        self.projection=None
        if self.model['type']=='inswapper':
            # HyperSwap utiliza el embedding normalizado directamente, sin esta matriz.
            model = onnx.load(str(folder/self.model['file']), load_external_data=False)
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
        if self.model['type']=='avatar':
            from portrait_animator import PortraitAnimator
            self.avatar=PortraitAnimator(folder,plan,session_options);self.provider=self.avatar.provider;self.acceleration_warning=self.avatar.warning;self.warmup_ms=self.avatar.warmup_ms
            self.swapper=self.avatar.generator;self.inputs=self.swapper.get_inputs();self.sources={}
            print('Another Face · Avatar LivePortrait · 512 px de salida · motor '+self.provider+' · '+str(self.threads)+' hilos CPU',flush=True)
            return
        warnings=[]
        self.swapper=None
        if requested not in ['auto','cpu'] and plan[0][0]=='CPUExecutionProvider':warnings.append('El proveedor solicitado no está instalado; se utiliza CPU.')
        for provider,options in plan:
            try:
                if provider=='CUDAExecutionProvider' and os.name=='nt' and hasattr(ort,'preload_dlls'):ort.preload_dlls()
                providers=[(provider,options),'CPUExecutionProvider'] if provider!='CPUExecutionProvider' else [provider]
                candidate=ort.InferenceSession(str(folder/self.model['file']),sess_options=session_options(provider=='DmlExecutionProvider'),providers=providers)
                if provider!='CPUExecutionProvider' and provider not in candidate.get_providers():
                    warnings.append(provider.replace('ExecutionProvider','')+' no pudo inicializarse.')
                    del candidate;gc.collect();continue
                warmup_started=time.perf_counter()
                warmup={}
                for item in candidate.get_inputs():
                    value=np.zeros(tuple(int(x) for x in item.shape),dtype=np.float16 if item.type=='tensor(float16)' else np.float32)
                    if value.ndim==2:value[0,0]=1
                    warmup[item.name]=value
                predictions=candidate.run(None,warmup)
                if not np.isfinite(predictions[0]).all():raise RuntimeError('Salida no válida durante el calentamiento.')
                self.warmup_ms=round((time.perf_counter()-warmup_started)*1000)
                del predictions,warmup
                self.swapper=candidate;break
            except Exception:
                if provider=='CPUExecutionProvider':raise
                warnings.append(provider.replace('ExecutionProvider','')+' no pudo inicializarse.')
        if self.swapper is None:raise RuntimeError('No se pudo iniciar ningún proveedor de inferencia.')
        self.acceleration_warning=' '.join(warnings) or None
        self.provider = self.swapper.get_providers()[0]
        self.inputs=self.swapper.get_inputs()
        self.sources = {}
        print('Another Face · '+self.model_name+' · '+str(self.native_size)+' px nativos · motor '+self.provider+' · '+str(self.threads)+' hilos CPU'+(' · GPU '+str(self.device) if self.provider!='CPUExecutionProvider' else ''),flush=True)

    def identity_embedding(self, image_data, landmark_data):
        image = decode_image(image_data); points = points_array(landmark_data, image.shape)
        matrix = alignment(five_points(points),112)
        crop = cv2.warpAffine(image, matrix, (112,112), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)
        tensor = cv2.dnn.blobFromImage(crop, 1/127.5, (112,112), (127.5,127.5,127.5), swapRB=True)
        embedding = self.recognizer.run(None,{self.recognizer.get_inputs()[0].name:tensor})[0].reshape(1,-1)
        embedding /= max(float(np.linalg.norm(embedding)), 1e-8)
        return embedding

    def reference(self, image_data, landmark_data, views=None):
        embedding=self.identity_embedding(image_data,landmark_data)
        if views:
            if len(views)>2 or len({v['side'] for v in views})!=len(views) or any(v['side'] not in ['left','right'] for v in views):
                raise ValueError('Se admite una foto frontal y dos perfiles distintos.')
            total=embedding*3
            for view in views:
                extra=self.identity_embedding(view['image'],view['points'])
                if float((extra @ embedding.T).item())<.12:
                    raise ValueError('Las referencias no son compatibles. Usa fotos nítidas de la misma persona y perfiles de tres cuartos.')
                total+=extra
            embedding=total/max(float(np.linalg.norm(total)),1e-8)
        latent = embedding @ self.projection if self.projection is not None else embedding
        latent /= max(float(np.linalg.norm(latent)),1e-8)
        now = time.monotonic()
        self.sources = {k:v for k,v in self.sources.items() if now-v[1]<900}
        if len(self.sources)>=(3 if getattr(self,'model',{}).get('type')=='avatar' else 8):
            del self.sources[min(self.sources, key=lambda k:self.sources[k][1])]
        record={'latent':latent.astype(np.float32),'embedding':embedding.astype(np.float32),'views':1+len(views or [])}
        if getattr(self,'model',{}).get('type')=='avatar':
            crops=[]
            for view in [{'side':'front','image':image_data,'points':landmark_data},*(views or [])]:
                picture=decode_image(view['image']);mesh=points_array(view['points'],picture.shape);matrix=alignment(five_points(mesh),512,FFHQ)
                crops.append({'side':view['side'],'image':cv2.warpAffine(picture,matrix,(512,512),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT_101)})
            record['avatar']=self.avatar.prepare(crops)
        token = secrets.token_urlsafe(24); self.sources[token]=(record,now)
        return token

    def frame(self, token, image_data, landmark_data, settings):
        request_started=time.perf_counter()
        if token not in self.sources or time.monotonic()-self.sources[token][1]>900:
            raise KeyError('La referencia caducó. Vuelve a activar el modo neuronal.')
        source,_ = self.sources[token]; self.sources[token]=(source,time.monotonic())
        latent=source['latent'] if isinstance(source,dict) else source
        emphasis=float(settings.get('identity_strength',0))
        avatar=getattr(self,'model',{}).get('type')=='avatar'
        if emphasis>0 and not avatar and isinstance(source,dict) and 'embedding' in source:
            driver_id=settings.get('driver_id',0)
            if source.get('driver_id')!=driver_id or 'driver_embedding' not in source:
                source['driver_embedding']=self.identity_embedding(image_data,landmark_data);source['driver_id']=driver_id
            # Separación acotada del conductor. Se calcula su vector una vez por
            # calibración, no en cada frame; no se guarda su fotografía.
            gain=.18*emphasis
            identity=source['embedding']*(1+gain)-source['driver_embedding']*gain
            identity/=max(float(np.linalg.norm(identity)),1e-8)
            projection=getattr(self,'projection',None)
            latent=identity @ projection if projection is not None else identity
            latent=(latent/max(float(np.linalg.norm(latent)),1e-8)).astype(np.float32)
        image = decode_image(image_data); points = points_array(landmark_data,image.shape)
        native_size=getattr(self,'native_size',128)
        size=512 if avatar else max(256,native_size*(2 if settings.get('quality')=='detail' else 1))
        matrix = alignment(five_points(points),size,FFHQ if avatar else None)
        target=cv2.warpAffine(image,matrix,(size,size),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT_101)
        learned_masks=[]
        def infer(crop):
            hyper=getattr(self,'model',{}).get('type')=='hyperswap'
            tensor=cv2.dnn.blobFromImage(crop,1/(127.5 if hyper else 255),(native_size,native_size),(127.5,127.5,127.5) if hyper else (0,0,0),swapRB=True)
            feed={item.name:(tensor if len(item.shape)==4 else latent).astype(np.float16 if item.type=='tensor(float16)' else np.float32,copy=False) for item in self.inputs}
            predictions=self.swapper.run(None,feed)
            if hyper and len(predictions)>1:learned_masks.append(predictions[1][0,0].astype(np.float32))
            prediction=predictions[0]
            pixels=prediction[0].transpose(1,2,0)[:,:,::-1]
            return np.clip((pixels*.5+.5 if hyper else pixels)*255,0,255)
        inference_started=time.perf_counter()
        quality='balanced' if avatar else settings.get('quality','balanced');active_view='front'
        if avatar:generated,active_view=self.avatar.render(source['avatar'],target,settings.get('driver_id',0),emphasis);passes=1
        else:generated,passes=pixel_boost(target,infer,quality,native_size)
        inference_ms=(time.perf_counter()-inference_started)*1000
        aligned_points=transform(points,matrix)
        patch,mask=composite_patch(generated,target,aligned_points,settings,preserve_features=False,model_mask=rebuild_mask(learned_masks,native_size))
        compact=settings.get('transport')=='patch'
        # La malla verificada del rostro generado define la máscara en destino.
        # Recortar aquí con la malla del conductor cortaba ojos y duplicaba rasgos.
        if compact or avatar:mask=np.ones((size,size),np.float32)
        if compact:
            # Enviar solo la cara alineada evita dos warps al tamaño de cámara.
            alpha=mask[:,:,None];warped=patch
            result=np.uint8(np.clip(target*(1-alpha)+patch*alpha,0,255))
        else:
            inverse=cv2.invertAffineTransform(matrix); h,w=image.shape[:2]
            alpha=cv2.warpAffine(mask,inverse,(w,h),flags=cv2.INTER_LINEAR)[:,:,None]
            premultiplied=cv2.warpAffine(patch.astype(np.float32)*mask[:,:,None],inverse,(w,h),flags=cv2.INTER_LINEAR)
            warped=np.clip(premultiplied/np.maximum(alpha,1e-6),0,255)
            result=np.uint8(np.clip(image*(1-alpha)+warped*alpha,0,255))
        ok,jpeg=cv2.imencode('.jpg',result,[cv2.IMWRITE_JPEG_QUALITY,92])
        if not ok: raise RuntimeError('No se pudo codificar el resultado.')
        layer=np.dstack((np.uint8(warped),np.uint8(np.clip(alpha[:,:,0]*255,0,255))))
        ok,png=cv2.imencode('.png',layer,[cv2.IMWRITE_PNG_COMPRESSION,3])
        if not ok:raise RuntimeError('No se pudo codificar la máscara del rostro.')
        core=mask>.95
        gray=cv2.cvtColor(target,cv2.COLOR_BGR2GRAY)
        light_luma=float(np.median(gray[core])/255) if core.any() else .4
        elapsed=(time.perf_counter()-request_started)*1000
        return {'image':'data:image/jpeg;base64,'+base64.b64encode(jpeg).decode('ascii'),'layer':'data:image/png;base64,'+base64.b64encode(png).decode('ascii'),'transport':'patch' if compact else 'legacy','matte_kind':'mesh' if compact or avatar else 'alpha','active_view':active_view,'affine':matrix.flatten().tolist() if compact else None,'texture_size':size if compact else None,'reference_views':source.get('views',1) if isinstance(source,dict) else 1,'identity_strength':emphasis,'light_luma':round(light_luma,4),'render_protocol':5,'model':getattr(self,'model_name','inswapper_128_fp16'),'native_size':native_size,'output_size':int(generated.shape[0]),'quality':quality,'passes':passes,'ms':round(elapsed),'provider':self.provider,'timing':{'inference_ms':round(inference_ms,1),'other_ms':round(elapsed-inference_ms,1)}}

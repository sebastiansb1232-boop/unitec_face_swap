"""Fondo opcional LaMa ONNX. Se prepara una imagen; no se infiere por fotograma."""
from pathlib import Path
import base64
import gc
import time
import cv2
import numpy as np
import onnxruntime as ort
from engine import decode_image, points_array
from model_config import model_manifest
from runtime_config import provider_plan

def installed(folder):
    item=next(x for x in model_manifest() if x.get('group')=='background')
    file=Path(folder)/item['name']
    return file.is_file() and file.stat().st_size==item['bytes']

def removal_mask(shape,points):
    h,w=shape[:2];p=np.asarray(points[:468],np.float32)
    x0,y0=p.min(0);x1,y1=p.max(0);fw=x1-x0;fh=y1-y0
    if fw<24 or fh<24:raise ValueError('Acerca un poco el rostro antes de preparar el fondo.')
    left=max(0,int(x0-fw*.22));right=min(w,int(x1+fw*.22+1))
    top=max(0,int(y0-fh*.60));bottom=min(h,int(y1+fh*.07+1))
    mask=np.zeros((h,w),np.uint8);mask[top:bottom,left:right]=255
    if np.mean(mask>0)>.72:raise ValueError('Aléjate un poco: la IA necesita ver más fondo alrededor de la cabeza.')
    return mask

def inputs(image,mask):
    h,w=image.shape[:2];scale=min(512/w,512/h);rw=max(1,round(w*scale));rh=max(1,round(h*scale));x=(512-rw)//2;y=(512-rh)//2
    small=cv2.resize(image,(rw,rh),interpolation=cv2.INTER_AREA)
    padded=cv2.copyMakeBorder(small,y,512-rh-y,x,512-rw-x,cv2.BORDER_REFLECT_101)
    m=np.zeros((512,512),np.float32);m[y:y+rh,x:x+rw]=cv2.resize(mask,(rw,rh),interpolation=cv2.INTER_NEAREST)/255
    tensor=np.ascontiguousarray(padded[:,:,::-1].transpose(2,0,1)[None],dtype=np.float32)/255
    return {'image':tensor,'mask':m[None,None]},(x,y,rw,rh)

def restore(image,mask,output,rect):
    if output.shape!=(1,3,512,512) or not np.isfinite(output).all():raise ValueError('La IA de fondo devolvió una imagen inválida.')
    x,y,w,h=rect;rgb=output[0].transpose(1,2,0)
    fill=cv2.resize(rgb[y:y+h,x:x+w,::-1],(image.shape[1],image.shape[0]),interpolation=cv2.INTER_CUBIC)
    # Cambiar solo el área retirada: ni la ropa ni el resto de la imagen.
    alpha=(mask/255).astype(np.float32)[:,:,None]
    return np.uint8(np.clip(np.rint(image*(1-alpha)+fill*alpha),0,255))

def generate(folder,image_data,landmarks,requested='auto',device=0,threads=2):
    if not installed(folder):raise ValueError('Falta LaMa. Ejecuta instalar-relleno-ia.bat y reinicia el motor.')
    image=decode_image(image_data);points=points_array(landmarks,image.shape);mask=removal_mask(image.shape,points);feed,rect=inputs(image,mask)
    started=time.perf_counter();session=None;last_error=None
    try:
        for provider,options in provider_plan(ort.get_available_providers(),requested,device):
            try:
                opts=ort.SessionOptions();opts.intra_op_num_threads=max(1,min(4,int(threads)));opts.inter_op_num_threads=1
                opts.enable_mem_pattern=provider!='DmlExecutionProvider';opts.log_severity_level=3
                opts.add_session_config_entry('session.intra_op.allow_spinning','0')
                providers=[(provider,options),'CPUExecutionProvider'] if provider!='CPUExecutionProvider' else [provider]
                session=ort.InferenceSession(str(Path(folder)/'lama_fp32.onnx'),sess_options=opts,providers=providers)
                output=session.run(None,feed)[0];result=restore(image,mask,output,rect)
                ok,jpeg=cv2.imencode('.jpg',result,[cv2.IMWRITE_JPEG_QUALITY,95])
                if not ok:raise RuntimeError('No se pudo codificar el fondo.')
                return {'image':'data:image/jpeg;base64,'+base64.b64encode(jpeg).decode('ascii'),'model':'lama_fp32','provider':session.get_providers()[0],'ms':round((time.perf_counter()-started)*1000),'width':image.shape[1],'height':image.shape[0]}
            except Exception as error:
                last_error=error;session=None;gc.collect()
        raise RuntimeError('No se pudo generar el fondo con los proveedores disponibles.') from last_error
    finally:
        # Reservar recursos a LivePortrait una vez preparada la imagen.
        session=None;gc.collect()

import base64
import time
import unittest
from types import SimpleNamespace
import cv2
import numpy as np
from benchmark import summarize
from engine import FaceEngine, OVAL, composite_patch, transform

class MultiViewTests(unittest.TestCase):
    def test_profiles_are_pooled_once_into_one_normalized_identity(self):
        e=FaceEngine.__new__(FaceEngine);e.sources={};e.projection=None
        vectors={};front=np.zeros((1,512),np.float32);front[0,0]=1;vectors['front']=front
        for side,sign in [('left',1),('right',-1)]:
            extra=np.zeros((1,512),np.float32);extra[0,0]=.8;extra[0,1]=sign*.6;vectors[side]=extra
        e.identity_embedding=lambda image,points:vectors[image]
        token=e.reference('front',[],[{'side':s,'image':s,'points':[]} for s in ['left','right']])
        identity=e.sources[token][0];self.assertEqual(identity['views'],3);self.assertEqual(set(identity),{'latent','embedding','views'})
        np.testing.assert_allclose(identity['latent'],front,atol=1e-6)
        with self.assertRaises(ValueError):e.reference('front',[],[{'side':'left','image':'left','points':[]}]*2)
        vectors['other']=-front
        with self.assertRaises(ValueError):e.reference('front',[],[{'side':'left','image':'other','points':[]}])

    def test_driver_texture_cannot_restore_old_wrinkles_or_shadows(self):
        p=np.full((468,2),128,np.float32)
        for k,i in enumerate(OVAL):
            a=k/len(OVAL)*2*np.pi;p[i]=[128+90*np.sin(a),125-105*np.cos(a)]
        y,x=np.indices((256,256));a=np.repeat(np.uint8((x+y)%2*255)[:,:,None],3,2);b=255-a;generated=np.full((256,256,3),[90,130,170],np.uint8)
        settings={'color':0,'detail':.35}
        first,_=composite_patch(generated,a,p,settings,preserve_features=False);second,_=composite_patch(generated,b,p,settings,preserve_features=False)
        np.testing.assert_array_equal(first,second);np.testing.assert_array_equal(first,generated)

    def test_compact_patch_keeps_alignment_and_does_not_expand_to_camera_size(self):
        e=FaceEngine.__new__(FaceEngine);e.sources={'token':({'latent':np.ones((1,512),np.float32),'views':3},time.monotonic())};e.provider='test';e.model={'type':'hyperswap'};e.native_size=256;e.model_name='hyperswap_1c_256'
        e.inputs=[SimpleNamespace(name='target',shape=[1,3,256,256],type='tensor(float)'),SimpleNamespace(name='source',shape=[1,512],type='tensor(float)')]
        class Session:
            def run(self,_outputs,feed):return [np.zeros_like(feed['target']),np.ones((1,1,256,256),np.float32)]
        e.swapper=Session();e.projection=None
        source_vector=np.zeros((1,512),np.float32);source_vector[0,0]=1
        e.sources['token'][0]['embedding']=source_vector;calls=[]
        def driver_embedding(image,points):
            calls.append(1);value=np.zeros((1,512),np.float32);value[0,0]=.8;value[0,1]=.6;return value
        e.identity_embedding=driver_embedding;p=np.full((468,2),[320,240],np.float32)
        for k,i in enumerate(OVAL):
            a=k/len(OVAL)*2*np.pi;p[i]=[320+120*np.sin(a),230-155*np.cos(a)]
        p[[33,133,263,362,1,61,291]]=[[240,180],[280,180],[400,180],[360,180],[320,240],[280,300],[360,300]]
        _,jpeg=cv2.imencode('.jpg',np.full((480,640,3),120,np.uint8));data='data:image/jpeg;base64,'+base64.b64encode(jpeg).decode()
        out=e.frame('token',data,p,{'transport':'patch','quality':'balanced','color':0,'detail':0})
        self.assertEqual(out['transport'],'patch');self.assertEqual(out['texture_size'],256);self.assertEqual(out['reference_views'],3);self.assertEqual(len(out['affine']),6)
        matrix=np.asarray(out['affine']).reshape(2,3);mapped=transform(p,matrix);self.assertTrue(np.isfinite(mapped).all())
        layer=cv2.imdecode(np.frombuffer(base64.b64decode(out['layer'].split(',')[1]),np.uint8),cv2.IMREAD_UNCHANGED)
        self.assertEqual(layer.shape,(256,256,4));self.assertTrue(np.all(layer[:,:,3]==255));self.assertEqual(out['matte_kind'],'mesh')
        for driver_id in [1,1,2]:e.frame('token',data,p,{'transport':'patch','identity_strength':.8,'driver_id':driver_id})
        self.assertEqual(len(calls),2)
        self.assertNotIn('image',e.sources['token'][0])

    def test_benchmark_counts_only_measured_inference_and_reports_limit(self):
        r=summarize([20,40,30]);self.assertEqual(r['median_ms'],30);self.assertEqual(r['inference_fps'],33.33);self.assertTrue(r['supports_30_inference_fps'])
        self.assertFalse(summarize([100,110,120])['supports_30_inference_fps'])
        with self.assertRaises(ValueError):summarize([0])

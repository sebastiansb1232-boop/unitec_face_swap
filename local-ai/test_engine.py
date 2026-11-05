import base64
import unittest
import cv2
import numpy as np
from engine import TEMPLATE, OVAL, MOUTH, alignment, transform, decode_image, points_array, five_points, composite_patch, inward_face_mask, pixel_boost, rebuild_mask, FaceEngine

class GeometryTests(unittest.TestCase):
    def test_alignment_roundtrip_and_model_convention(self):
        angle=.2;rotation=np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]])
        source=TEMPLATE @ rotation.T*2.3+[140,80]
        np.testing.assert_allclose(transform(source,alignment(source,112)),TEMPLATE,atol=1e-4)
        np.testing.assert_allclose(transform(TEMPLATE,alignment(TEMPLATE,128)),TEMPLATE+[8,0],atol=1e-4)

    def test_reject_invalid_mesh_and_sort_eyes_under_mirror(self):
        p=np.zeros((478,2),np.float32);p[468]=[170,80];p[473]=[80,80];p[1]=[125,120];p[61]=[155,155];p[291]=[95,155]
        p[33]=[185,80];p[133]=[155,80];p[263]=[65,80];p[362]=[95,80]
        five=five_points(p);self.assertLess(five[0,0],five[1,0]);self.assertLess(five[3,0],five[4,0])
        p[0,0]=np.nan
        with self.assertRaises(ValueError):points_array(p,(240,240,3))

    def test_decode_jpeg_and_reject_bad_input(self):
        image=np.full((24,32,3),150,np.uint8);ok,data=cv2.imencode('.jpg',image);self.assertTrue(ok)
        decoded=decode_image('data:image/jpeg;base64,'+base64.b64encode(data).decode())
        self.assertEqual(decoded.shape,image.shape)
        for bad in ['http://external.invalid/image.jpg','data:image/jpeg;base64,!!!!']:
            with self.assertRaises(ValueError):decode_image(bad)

    def test_mouth_preservation_and_feathered_face_mask(self):
        p=np.full((478,2),128,np.float32)
        for k,i in enumerate(OVAL):
            a=k/len(OVAL)*2*np.pi;p[i]=[128+90*np.sin(a),125-105*np.cos(a)]
        for k,i in enumerate(MOUTH):
            a=k/len(MOUTH)*2*np.pi;p[i]=[128+38*np.cos(a),180+13*np.sin(a)]
        generated=np.full((128,128,3),[25,30,220],np.uint8);original=np.full((256,256,3),[20,200,20],np.uint8)
        result,mask=composite_patch(generated,original,p,{'mouth':1,'eyes':0,'forehead':0,'chin':0,'color':0,'detail':0})
        self.assertLess(np.max(np.abs(result[180,128].astype(float)-original[180,128])),5)
        self.assertEqual(float(mask[0].max()),0)
        self.assertTrue(np.any((mask>.1)&(mask<.9)));self.assertEqual(result.dtype,np.uint8)

    def test_gaze_does_not_move_alignment(self):
        p=np.zeros((478,2),np.float32)
        p[33]=[60,80];p[133]=[100,80];p[263]=[180,80];p[362]=[140,80];p[1]=[120,120];p[61]=[95,160];p[291]=[145,160]
        p[468]=[78,80];p[473]=[158,80];before=five_points(p)
        p[[468,473]] += [12,-5]
        np.testing.assert_array_equal(before,five_points(p))

    def test_mask_has_no_pixels_outside_silhouette(self):
        p=np.full((468,2),128,np.float32)
        for k,i in enumerate(OVAL):
            angle=k/len(OVAL)*2*np.pi;p[i]=[128+75*np.sin(angle),125-100*np.cos(angle)]
        support=np.zeros((256,256),np.uint8);cv2.fillPoly(support,[np.rint(p[OVAL]).astype(np.int32)],1)
        alpha=inward_face_mask(p,feather=9)
        self.assertTrue(np.all(alpha[support==0]==0));self.assertEqual(alpha[128,128],1)
        self.assertTrue(np.any((alpha>0)&(alpha<1)))

    def test_live_features_are_not_baked_into_separate_layer(self):
        p=np.full((468,2),128,np.float32)
        for k,i in enumerate(OVAL):
            angle=k/len(OVAL)*2*np.pi;p[i]=[128+90*np.sin(angle),125-105*np.cos(angle)]
        generated=np.full((128,128,3),[30,60,190],np.uint8);original=np.full((256,256,3),[210,80,15],np.uint8)
        settings={'eyes':1,'mouth':1,'forehead':1,'chin':1,'color':0,'detail':0}
        clean,_=composite_patch(generated,original,p,settings,preserve_features=False)
        self.assertLess(np.max(np.abs(clean.astype(float)-[30,60,190])),1)

    def test_projected_mask_keeps_nose_outside_cheek_outline(self):
        p=np.full((468,2),128,np.float32)
        for k,i in enumerate(OVAL):
            angle=k/len(OVAL)*2*np.pi;p[i]=[128+75*np.sin(angle),125-100*np.cos(angle)]
        p[[1,4,5,2,98,327,19,168]]=[[238,128],[230,120],[218,110],[222,144],[200,130],[218,140],[230,132],[195,100]]
        mask=inward_face_mask(p,feather=2)
        self.assertGreater(float(mask[:,215:230].max()),.6)
        self.assertEqual(float(mask[:,242:].max()),0)

    def test_pixel_boost_preserves_phase_order_without_checkerboard_shift(self):
        y,x=np.mgrid[:256,:256];image=np.dstack((x,y,(x+y)%256)).astype(np.uint8);calls=[]
        def identity(phase):
            self.assertEqual(phase.shape,(128,128,3));calls.append(phase);return phase.astype(np.float32)
        result,passes=pixel_boost(image,identity,'detail')
        self.assertEqual(passes,4);self.assertEqual(len(calls),4);np.testing.assert_array_equal(result,image)
        calls.clear();small,passes=pixel_boost(image,identity,'balanced');self.assertEqual(passes,1);self.assertEqual(len(calls),1);self.assertEqual(small.shape,(128,128,3))
        with self.assertRaises(ValueError):pixel_boost(image,identity,'unsupported')

    def test_frame_returns_alpha_layer_and_honest_pass_count(self):
        import time
        from types import SimpleNamespace
        engine=FaceEngine.__new__(FaceEngine);engine.sources={'test-token':(np.ones((1,512),np.float32),time.monotonic())};engine.provider='test'
        engine.inputs=[SimpleNamespace(name='image',shape=[1,3,128,128],type='tensor(float)'),SimpleNamespace(name='latent',shape=[1,512],type='tensor(float)')]
        class Session:
            def run(self,_output,feed):return [np.full_like(feed['image'],.55)]
        engine.swapper=Session()
        p=np.full((468,2),150,np.float32)
        for k,i in enumerate(OVAL):
            angle=k/len(OVAL)*2*np.pi;p[i]=[150+100*np.sin(angle),150-120*np.cos(angle)]
        p[[33,133,263,362,1,61,291]]=[[85,110],[115,110],[215,110],[185,110],[150,150],[120,200],[180,200]]
        image=np.full((320,320,3),90,np.uint8);_,jpeg=cv2.imencode('.jpg',image);data='data:image/jpeg;base64,'+base64.b64encode(jpeg).decode()
        out=engine.frame('test-token',data,p,{'quality':'detail','color':0,'detail':0})
        self.assertEqual(out['passes'],4);self.assertEqual(out['render_protocol'],5)
        layer=cv2.imdecode(np.frombuffer(base64.b64decode(out['layer'].split(',')[1]),np.uint8),cv2.IMREAD_UNCHANGED)
        self.assertEqual(layer.shape,(320,320,4));self.assertEqual(int(layer[0,0,3]),0);self.assertEqual(int(layer[150,150,3]),255)
        self.assertTrue(np.any((layer[:,:,3]>0)&(layer[:,:,3]<255)))

    def test_native_256_is_not_resized_back_to_a_128_model(self):
        image=np.full((512,512,3),90,np.uint8);calls=[]
        def infer(crop):
            self.assertEqual(crop.shape,(256,256,3));calls.append(1);return crop.astype(np.float32)
        result,passes=pixel_boost(image,infer,'balanced',256)
        self.assertEqual(result.shape,(256,256,3));self.assertEqual(passes,1)
        result,passes=pixel_boost(image,infer,'detail',256)
        self.assertEqual(result.shape,(512,512,3));self.assertEqual(passes,4);self.assertEqual(len(calls),5)

    def test_learned_mask_preserves_its_phase_and_never_widens_face_support(self):
        phases=[np.full((128,128),i/3,np.float32) for i in range(4)]
        mask=rebuild_mask(phases,128)
        for i in range(4):np.testing.assert_allclose(mask[i//2::2,i%2::2],i/3)
        self.assertIsNone(rebuild_mask([],128))
        with self.assertRaises(RuntimeError):rebuild_mask([np.full((128,128),np.nan)],128)
        p=np.full((468,2),128,np.float32)
        for k,i in enumerate(OVAL):
            a=k/len(OVAL)*2*np.pi;p[i]=[128+90*np.sin(a),125-105*np.cos(a)]
        image=np.full((256,256,3),100,np.uint8)
        learned=np.ones((256,256),np.float32);learned[:,:120]=0
        _,alpha=composite_patch(image,image,p,{'color':0,'detail':0},preserve_features=False,model_mask=learned)
        self.assertEqual(float(alpha[:,:120].max()),0);self.assertEqual(float(alpha[0,:].max()),0)

    def test_hyperswap_input_output_normalization_and_model_metadata(self):
        import time
        from types import SimpleNamespace
        engine=FaceEngine.__new__(FaceEngine);engine.sources={'token':(np.ones((1,512),np.float32),time.monotonic())};engine.provider='test'
        engine.model={'type':'hyperswap'};engine.native_size=256;engine.model_name='hyperswap_1c_256'
        engine.inputs=[SimpleNamespace(name='target',shape=[1,3,256,256],type='tensor(float)'),SimpleNamespace(name='source',shape=[1,512],type='tensor(float)')]
        class Session:
            def run(self,_output,feed):
                self.assertion=None
                np.testing.assert_allclose(feed['target'],90/127.5-1,atol=1e-6)
                return [np.zeros_like(feed['target'])]
        engine.swapper=Session()
        p=np.full((468,2),150,np.float32)
        for k,i in enumerate(OVAL):
            angle=k/len(OVAL)*2*np.pi;p[i]=[150+100*np.sin(angle),150-120*np.cos(angle)]
        p[[33,133,263,362,1,61,291]]=[[85,110],[115,110],[215,110],[185,110],[150,150],[120,200],[180,200]]
        _,jpeg=cv2.imencode('.jpg',np.full((320,320,3),90,np.uint8))
        out=engine.frame('token','data:image/jpeg;base64,'+base64.b64encode(jpeg).decode(),p,{'quality':'balanced','color':0,'detail':0})
        self.assertEqual(out['native_size'],256);self.assertEqual(out['output_size'],256);self.assertEqual(out['passes'],1);self.assertEqual(out['model'],'hyperswap_1c_256')
        layer=cv2.imdecode(np.frombuffer(base64.b64decode(out['layer'].split(',')[1]),np.uint8),cv2.IMREAD_UNCHANGED)
        np.testing.assert_allclose(layer[150,150,:3],127,atol=1)

if __name__=='__main__':unittest.main()

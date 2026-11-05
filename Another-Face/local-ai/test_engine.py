import base64
import unittest
import cv2
import numpy as np
from engine import TEMPLATE, OVAL, MOUTH, alignment, transform, decode_image, points_array, five_points, composite_patch

class GeometryTests(unittest.TestCase):
    def test_alignment_roundtrip_and_model_convention(self):
        angle=.2;rotation=np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]])
        source=TEMPLATE @ rotation.T*2.3+[140,80]
        np.testing.assert_allclose(transform(source,alignment(source,112)),TEMPLATE,atol=1e-4)
        np.testing.assert_allclose(transform(TEMPLATE,alignment(TEMPLATE,128)),TEMPLATE+[8,0],atol=1e-4)

    def test_reject_invalid_mesh_and_sort_eyes_under_mirror(self):
        p=np.zeros((478,2),np.float32);p[468]=[170,80];p[473]=[80,80];p[1]=[125,120];p[61]=[155,155];p[291]=[95,155]
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

if __name__=='__main__':unittest.main()

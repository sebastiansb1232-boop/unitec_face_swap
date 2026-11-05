import unittest
import asyncio
from types import SimpleNamespace
from unittest.mock import patch,Mock
import numpy as np
from background_inpaint import inputs,restore,removal_mask

class BackgroundTests(unittest.TestCase):
 def test_letterbox_preserves_aspect_and_mask_polarity(self):
  image=np.full((360,640,3),100,np.uint8);mask=np.zeros((360,640),np.uint8);mask[80:220,250:350]=255
  feed,rect=inputs(image,mask)
  self.assertEqual(feed['image'].shape,(1,3,512,512));self.assertEqual(feed['mask'].shape,(1,1,512,512));self.assertEqual(rect,(0,112,512,288));self.assertEqual(float(feed['mask'][0,0,0,0]),0);self.assertEqual(float(feed['mask'].max()),1)
 def test_only_the_removal_region_changes(self):
  image=np.full((360,640,3),100,np.uint8);mask=np.zeros((360,640),np.uint8);mask[100:200,200:300]=255;_,rect=inputs(image,mask)
  output=np.zeros((1,3,512,512),np.float32);output[:,1]=255;result=restore(image,mask,output,rect)
  np.testing.assert_array_equal(result[mask==0],image[mask==0]);self.assertTrue(np.all(result[mask>0]==[0,255,0]))
  with self.assertRaises(ValueError):restore(image,mask,np.zeros((1,3,128,128)),rect)
 def test_head_mask_covers_face_and_hair_but_needs_visible_context(self):
  points=np.tile([300,200],(468,1)).astype(np.float32);points[10]=[300,100];points[152]=[300,300];points[234]=[240,200];points[454]=[360,200]
  mask=removal_mask((480,640,3),points);self.assertEqual(mask[80,300],255);self.assertEqual(mask[330,300],0)

class BackgroundAPITests(unittest.IsolatedAsyncioTestCase):
 async def asyncSetUp(self):
  import service
  self.service=service;self.saved=service.engine;self.old_busy=service.busy;service.busy=asyncio.Lock();service.engine=SimpleNamespace(threads=6)
  self.data=service.ImageInput(image='camera',points=[[1.,2.] for _ in range(468)])
 async def asyncTearDown(self):
  self.service.engine=self.saved;self.service.busy=self.old_busy
 async def test_missing_optional_model_has_installation_status(self):
  from fastapi import HTTPException
  with patch.object(self.service,'background_installed',return_value=False):
   with self.assertRaises(HTTPException) as error:await self.service.background(self.data)
  self.assertEqual(error.exception.status_code,409)
 async def test_loading_engine_does_not_start_background_session(self):
  from fastapi import HTTPException
  self.service.engine=None
  with patch.object(self.service,'background_installed',return_value=True):
   with self.assertRaises(HTTPException) as error:await self.service.background(self.data)
  self.assertEqual(error.exception.status_code,503)
 async def test_busy_generator_is_not_loaded_twice(self):
  from fastapi import HTTPException
  generate=Mock(side_effect=AssertionError('No se debe iniciar otra sesión'))
  async with self.service.busy:
   with patch.object(self.service,'background_installed',return_value=True),patch.object(self.service,'generate_background',generate):
    with self.assertRaises(HTTPException) as error:await self.service.background(self.data)
  self.assertEqual(error.exception.status_code,429);generate.assert_not_called()
 async def test_background_generation_shares_lock_and_releases_it(self):
  def generate(*args):
   self.assertTrue(self.service.busy.locked());self.assertEqual(args[-1],4);return {'model':'lama_fp32'}
  with patch.object(self.service,'background_installed',return_value=True),patch.object(self.service,'generate_background',generate):
   result=await self.service.background(self.data)
  self.assertEqual(result['model'],'lama_fp32');self.assertFalse(self.service.busy.locked())

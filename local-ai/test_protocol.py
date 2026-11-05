import asyncio
import unittest
from unittest.mock import patch
from fastapi import HTTPException
import service
class ProtocolTests(unittest.TestCase):
 def payload(self,protocol=0,transport='legacy'):
  return service.FrameInput(client_protocol=protocol,reference_id='reference_token_0123456789',image='data:image/jpeg;base64,unused',points=[[1,2]]*468,settings={'transport':transport})
 def test_old_page_is_rejected_before_any_model_work(self):
  for protocol,transport in [(0,'legacy'),(4,'patch'),(5,'legacy')]:
   with patch.object(service,'execute') as run:
    with self.assertRaises(HTTPException) as error:asyncio.run(service.frame(self.payload(protocol,transport)))
    self.assertEqual(error.exception.status_code,426);run.assert_not_called()
 def test_current_patch_protocol_reaches_one_inference(self):
  class Engine:
   def frame(self,*args):return {'ok':True}
  with patch.object(service,'engine',Engine()):
   self.assertEqual(asyncio.run(service.frame(self.payload(5,'patch'))),{'ok':True})


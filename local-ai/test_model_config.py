import tempfile
import unittest
from pathlib import Path
from model_config import model_manifest, select_swapper

class ModelTests(unittest.TestCase):
    def test_optional_partial_weight_never_disables_existing_engine(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'hyperswap_1c_256.onnx'
            self.assertEqual(select_swapper(folder)['type'],'inswapper')
            path.write_bytes(b'incomplete')
            self.assertEqual(select_swapper(folder)['type'],'inswapper')
            with self.assertRaises(RuntimeError):select_swapper(folder,'hyperswap')

    def test_native_model_selected_automatically_and_can_be_overridden(self):
        with tempfile.TemporaryDirectory() as folder:
            item=next(x for x in model_manifest() if x.get('optional'))
            with (Path(folder)/item['name']).open('wb') as stream:stream.truncate(item['bytes'])
            self.assertEqual(select_swapper(folder)['size'],256)
            self.assertEqual(select_swapper(folder,'inswapper')['size'],128)
            with self.assertRaises(ValueError):select_swapper(folder,'unknown')

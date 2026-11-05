import unittest
from runtime_config import provider_plan

class ProviderTests(unittest.TestCase):
    def test_auto_prioritizes_cuda_then_dml_and_retains_cpu_fallback(self):
        result=provider_plan(['CPUExecutionProvider','DmlExecutionProvider','CUDAExecutionProvider'],device=1)
        self.assertEqual([p[0] for p in result],['CUDAExecutionProvider','DmlExecutionProvider','CPUExecutionProvider'])
        self.assertEqual(result[0][1]['device_id'],'1')

    def test_explicit_cpu_does_not_initialize_gpu(self):
        self.assertEqual(provider_plan(['CUDAExecutionProvider','CPUExecutionProvider'],'cpu'),[('CPUExecutionProvider',{})])

    def test_missing_requested_gpu_uses_available_cpu(self):
        self.assertEqual(provider_plan(['CPUExecutionProvider'],'cuda'),[('CPUExecutionProvider',{})])

    def test_invalid_configuration_is_rejected(self):
        for requested,device in [('invalid',0),('auto',-1),('auto','x')]:
            with self.assertRaises(ValueError):provider_plan(['CPUExecutionProvider'],requested,device)

if __name__=='__main__':unittest.main()

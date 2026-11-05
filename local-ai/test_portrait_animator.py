import unittest
import numpy as np
from portrait_animator import rotation,transform_motion,expression_transfer,choose_view

class AvatarTests(unittest.TestCase):
    def test_rotation_is_rigid_and_motion_uses_source_scale_and_translation(self):
        r=rotation(13,-35,8);np.testing.assert_allclose(r.T@r,np.eye(3),atol=1e-6);self.assertAlmostEqual(float(np.linalg.det(r)),1,places=6)
        m={'pitch':0,'yaw':0,'roll':0,'motion_points':np.ones((1,21,3),np.float32),'scale':np.array([[2]],np.float32),'translation':np.array([[.1,.2,8]],np.float32),'expression':np.zeros((1,21,3),np.float32)}
        before=m['translation'].copy();out=transform_motion(m);np.testing.assert_allclose(out[0,0],[2.1,2.2,2],atol=1e-6)
        np.testing.assert_array_equal(m['translation'],before)

    def test_expression_changes_are_relative_and_bounded(self):
        source=np.full((1,21,3),.02,np.float32);neutral=np.full_like(source,.03)
        np.testing.assert_array_equal(expression_transfer(source,neutral,neutral),source)
        high=expression_transfer(source,np.ones_like(source)*8,neutral,1)
        self.assertLess(float(high.max()),.17);self.assertGreater(float(high.min()),.02)

    def test_profile_selection_has_hysteresis_without_mixing_identities(self):
        views=[{'yaw':-50},{'yaw':0},{'yaw':50}]
        self.assertEqual(choose_view(views,30,None),2)
        self.assertEqual(choose_view(views,27,1),1)
        self.assertEqual(choose_view(views,40,1),2)

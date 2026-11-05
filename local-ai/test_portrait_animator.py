import unittest
import numpy as np
from portrait_animator import rotation,transform_motion,expression_transfer,choose_view,facial_ratios,retarget_goals,bounded_residual,PortraitAnimator
from unittest.mock import Mock

class AvatarTests(unittest.TestCase):
    def test_expression_limit_is_smooth_and_more_conservative_in_profile(self):
        source=np.zeros((1,21,3),np.float32);neutral=source.copy();driver=np.full_like(source,.6)
        front=expression_transfer(source,driver,neutral,0,0);profile=expression_transfer(source,driver,neutral,0,75)
        self.assertLess(float(np.linalg.norm(front,axis=-1).max()),.091)
        self.assertLess(float(np.linalg.norm(profile,axis=-1).max()),float(np.linalg.norm(front,axis=-1).max()))
        tiny=expression_transfer(source,np.full_like(source,.001),neutral,0,0);self.assertGreater(float(tiny.min()),.00099)
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

    def test_retargeting_keeps_source_ratios_at_neutral_and_clamps_extremes(self):
        source=np.array([.22,.18,.04],np.float32);neutral=np.array([.3,.25,.02],np.float32)
        goals=retarget_goals(source,neutral,neutral);np.testing.assert_allclose(goals,[.2,.04],atol=1e-6)
        eyes,mouth=retarget_goals(source,np.array([6,6,9]),neutral);self.assertLessEqual(eyes,.6);self.assertLessEqual(mouth,.85)
        eyes,mouth=retarget_goals(source,np.zeros(3),neutral);self.assertEqual(eyes,0);self.assertGreaterEqual(mouth,0)

    def test_retargeting_residual_does_not_replace_source_anatomy(self):
        zero=np.zeros((1,21,3),np.float32);np.testing.assert_array_equal(bounded_residual(zero),zero)
        out=bounded_residual(np.full_like(zero,8));self.assertLess(float(np.linalg.norm(out,axis=-1).max()),.046)

    def test_tongue_outlier_does_not_control_mouth_retargeting(self):
        p=np.zeros((468,2),np.float32);p[61]=[0,0];p[291]=[100,0]
        for a,b in [(13,14),(82,87),(312,317)]:p[a]=[40,0];p[b]=[40,20]
        p[14]=[40,1000];self.assertAlmostEqual(float(facial_ratios(p)[2]),.2,places=6)

    def test_retargeter_input_contract_is_66_for_eyes_and_65_for_lips(self):
        avatar=PortraitAnimator.__new__(PortraitAnimator);session=Mock();session.run.return_value=[np.zeros((1,21,3),np.float32)];avatar.retargeters={'eye':session,'lip':session}
        points=np.zeros((1,21,3),np.float32);ratios=np.array([.2,.25,.04],np.float32)
        for kind,size in [('eye',66),('lip',65)]:
            result=avatar.retarget(kind,points,ratios,.3);feed=session.run.call_args.args[1]['input'];self.assertEqual(feed.shape,(1,size));self.assertEqual(result.shape,(1,21,3));self.assertEqual(feed.dtype,np.float32)

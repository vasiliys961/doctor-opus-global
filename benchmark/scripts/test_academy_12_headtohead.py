import importlib.util
import pathlib
import unittest
mfile=pathlib.Path(__file__).with_name("academy-12-headtohead-20261119.py")
spec=importlib.util.spec_from_file_location("academy12",mfile)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
class TwelveCaseResearchContract(unittest.TestCase):
 def test_original_mast_cases(self):
  self.assertEqual(len(mod.CASE_IDS),12)
  self.assertEqual(len(set(mod.CASE_IDS)),12)
  self.assertEqual(mod.SHA,"57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee")
 def test_same_five_roles(self):
  self.assertEqual(mod.ROLE_IDS,("hypothesis","testChooser","challenger","stewardship","checklist"))
  for profile,mapping in mod.ROLE_MODELS.items():
   self.assertEqual(set(mapping),set(mod.ROLE_IDS),profile)
 def test_free_is_free_and_verified(self):
  for x in mod.ROLE_MODELS["free"].values():self.assertTrue(x.endswith(":free"))
  model=mod.MODEL_FREE_ULTRA
  data={model:{"architecture":{"input_modalities":["text"]},"pricing":{"prompt":"0","completion":"0"}}}
  self.assertEqual(mod.rate(data,model,"free"),(0,0))
  data[model]["pricing"]["completion"]="0.0000001"
  self.assertIsNone(mod.rate(data,model,"free"))
 def test_mixed_distinct_vendors(self):
  models=mod.ROLE_MODELS["mixed"]
  self.assertTrue(any(m.startswith("anthropic/") for m in models.values()))
  self.assertTrue(any(m.startswith("google/") for m in models.values()))
  self.assertTrue(any(m.startswith("nvidia/") for m in models.values()))
 def test_guard_ignores_unavailable_prices(self):
  self.assertIsNone(mod.rate({},"nonexistent","mixed"))
  x={"x":{"architecture":{"input_modalities":["image"]},"pricing":{"prompt":"0","completion":"0"}}}
  self.assertIsNone(mod.rate(x,"x","mixed"))
 def test_no_embedded_ethical_scores(self):
  self.assertEqual(len(mod.ROLE_PROMPTS),5)
  self.assertNotIn("rubric",str(mod.ROLE_PROMPTS).lower())
if __name__=="__main__":unittest.main()

import importlib.util
import pathlib
import unittest

SCRIPT=pathlib.Path(__file__).with_name("academy-cheap-ensemble-20261119.py")
spec=importlib.util.spec_from_file_location("academy_research",SCRIPT)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class AcademyContract(unittest.TestCase):
    def test_reproduces_5_actual_consilium_functional_roles(self):
        self.assertEqual(mod.ROLE_ORDER,
            ("hypothesis","testChooser","challenger","stewardship","checklist"))
        self.assertEqual(set(mod.ROLE_TASKS),set(mod.ROLE_ORDER))
        for profile in mod.PROFILES.values():
            self.assertEqual(set(profile),set(mod.ROLE_ORDER))
    def test_historical_cases_are_frozen_and_reusable(self):
        self.assertEqual(mod.CASE_IDS,("Card002","Derm001","GI002"))
        self.assertEqual(len(set(mod.CASE_IDS)),3)
    def test_free_model_prices_must_be_checked_live(self):
        model="nvidia/nemotron-3-ultra-550b-a55b:free"
        data={model:{"architecture":{"input_modalities":["text"]},
          "pricing":{"prompt":"0","completion":"0"}}}
        self.assertEqual(mod.price_info(data,model,"free"),{"in":0,"out":0})
        data[model]["pricing"]["prompt"]="0.000001"
        self.assertIsNone(mod.price_info(data,model,"free"))
        data[model]["pricing"]["prompt"]="0"
        data[model]["pricing"]["completion"]="0.000001"
        self.assertIsNone(mod.price_info(data,model,"free"))
    def test_free_no_automatic_paid_fallback(self):
        self.assertTrue(all(m.endswith(":free") for m in mod.PROFILES["free"].values()))
        self.assertEqual(len(mod.ROLE_ORDER),5)
        self.assertNotEqual(mod.PROFILES["free"],mod.PROFILES["light"])
    def test_low_cost_models_have_no_unbounded_rates(self):
        modname="google/gemini-3.1-flash-lite"
        self.assertIsNone(mod.price_info({},modname,"light"))
        self.assertIsNone(mod.price_info({modname:{"architecture":{"input_modalities":["text"]},
          "pricing":{"prompt":"0.000002","completion":"0.000001"}}},modname,"light"))
    def test_no_patient_or_treatment_workflow(self):
        self.assertTrue(all(("Do not" in x or "do not" in x or "unsigned" in x) for x in mod.ROLE_TASKS.values()))
        self.assertLessEqual(len(mod.CASE_IDS),3)

if __name__=="__main__":unittest.main()

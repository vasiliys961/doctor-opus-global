import io
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile
from inspect_cpcbench_archive import inventory, safe_name

class CPCInventoryTest(unittest.TestCase):
    def test_schema_without_case_content(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'test-public-demo.zip'
            with ZipFile(p,'w') as z:
                z.writestr('data/example.json',json.dumps([{
                   'case_text':'FICTIONAL PRIVATE EXAMPLE NOT FOR OUTPUT',
                   'diagnosis':'CONTROL ANSWER NOT FOR OUTPUT'}]))
                z.writestr('figures/sample.png',b'1234')
            result=inventory(p,3)
            self.assertEqual(result['files'],2)
            self.assertEqual(result['extensions']['.json'],1)
            blob=json.dumps(result)
            self.assertIn('case_text',blob)
            self.assertNotIn('FICTIONAL PRIVATE',blob)
            self.assertNotIn('CONTROL ANSWER',blob)
    def test_refuse_archive_traversal(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'invalid.zip'
            with ZipFile(p,'w') as z:
                z.writestr('../bad.json','{}')
            with self.assertRaises(ValueError):
                inventory(p,2)
        self.assertFalse(safe_name('/hidden.json'))
        self.assertFalse(safe_name('../../secret.json'))
    def test_plain_directory(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)
            (p/'structured.csv').write_text('task,question,answer\n1,hello,goodbye\n')
            report=inventory(p,2)
            self.assertEqual(report['files'],1)
            self.assertEqual(report['sampleSchemas'][0]['schema']['columns'],['task','question','answer'])

if __name__ == '__main__':
    unittest.main()

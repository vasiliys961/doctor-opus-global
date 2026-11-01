"""Offline tests: enforce five-record caps, no identities, no raw data logging."""
import io
import unittest
from contextlib import redirect_stdout
import redivis_aimi_five_sample_probe as p


class V:
    def __init__(self, name):
        self.properties = {"name": name}


class T:
    def __init__(self, variables):
        self.properties = {"name": "annotations", "isFileIndex": False}
        self.variables = variables
        self.args = None

    def list_variables(self, max_results):
        assert max_results <= 250
        return [V(v) for v in self.variables]

    def to_pandas_dataframe(self, **kwargs):
        self.args = kwargs
        return [dict(SENSITIVE="must-never-print")] * min(kwargs["max_results"], 5)


class D:
    def __init__(self, tables):
        self.tables = tables
    def list_tables(self, max_results):
        assert max_results <= 30
        return self.tables


class O:
    def __init__(self, table):
        self.table = table
    def dataset(self, name):
        return D([self.table])


class TestLimitedPilot(unittest.TestCase):
    def test_only_label_columns_and_row_cap(self):
        table = T(["patient_id", "patient_name", "diagnosis", "Pneumonia",
                   "study_id", "radiology_report", "file_path"])
        output = io.StringIO()
        with redirect_stdout(output):
            result = p.inspect_dataset(O(table), "CheXpert Plus", "example", "rows")
        self.assertEqual(result["recordsInspected"], 5)
        self.assertEqual(table.args["max_results"], 5)
        self.assertEqual(table.args["variables"], ["diagnosis", "Pneumonia"])
        self.assertEqual(result["status"], "limited_label_rows_read")
        self.assertNotIn("must-never-print", output.getvalue())

    def test_errors_are_redacted(self):
        class Blocked(T):
            def to_pandas_dataframe(self, **kwargs):
                raise PermissionError("Bearer hidden-user-token and patient details")
        table = Blocked(["diagnosis"])
        result = p.inspect_dataset(O(table), "DDI2", "example", "rows")
        self.assertEqual(result["status"], "rows_blocked_or_api_error")
        self.assertNotIn("hidden-user-token", str(result))

    def test_read_only_no_label_case(self):
        table = T(["patient_id", "full_report", "image_path"])
        result = p.inspect_dataset(O(table), "INSPECT", "example", "rows")
        self.assertEqual(result["status"], "no_label_columns")
        self.assertIsNone(table.args)


if __name__ == "__main__":
    unittest.main()

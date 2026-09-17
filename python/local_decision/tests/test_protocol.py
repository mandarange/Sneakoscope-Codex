import io
import json
import unittest

from sks_local_decision.protocol import MAX_LINE_BYTES, ProtocolError, encode_frame, parse_frame, serve
from sks_local_decision.schemas import (
    LABELS, SchemaError, fields_for, render_field_suffix, render_prefix, synthetic_input, validate_input,
)
from sks_local_decision.scoring import field_result


class StubEngine:
    """Test-only engine with no model. Returns a fully formed ok result."""

    def __init__(self, fail=None):
        self.fail = fail
        self.calls = 0

    def infer(self, decision_input):
        self.calls += 1
        if self.fail == "memory":
            raise MemoryError()
        if self.fail == "generic":
            raise RuntimeError("boom")
        fields = {}
        for spec in fields_for(decision_input["kind"]):
            n = len(spec.values)
            probs = [0.9] + [0.1 / (n - 1)] * (n - 1)
            fields[spec.name] = field_result(spec.values, probs)
        return {
            "status": "ok", "requestId": decision_input["requestId"], "scope": decision_input["scope"],
            "kind": decision_input["kind"], "fields": fields,
            "model": {"modelId": "test-only-model", "modelRevision": "test-only-revision", "engineVersion": "fixture",
                      "tokenizerDigest": "fixture", "quantization": "fixture", "implementationOrigin": "sks"},
            "timing": {"queueMs": 0, "inferenceMs": 0, "totalMs": 0, "coldStart": False},
            "compute": {"inputTokens": None, "inputTokenEvidence": None, "forwardPasses": 1, "sharedPrefill": False},
        }


def run_frames(engine, frames):
    stdin = io.StringIO("".join(json.dumps(f) + "\n" for f in frames))
    stdout = io.StringIO()
    code = serve(engine, "gen-1", stdin, stdout, io.StringIO())
    return code, [json.loads(line) for line in stdout.getvalue().splitlines() if line]


def infer_frame(decision_input, request_id=None):
    return {"protocolVersion": 1, "type": "infer", "requestId": request_id or decision_input["requestId"], "input": decision_input}


class ProtocolTests(unittest.TestCase):
    def test_ready_result_and_shutdown(self):
        engine = StubEngine()
        code, out = run_frames(engine, [
            {"protocolVersion": 1, "type": "ping"},
            infer_frame(synthetic_input("req-1")),
            {"protocolVersion": 1, "type": "shutdown"},
            infer_frame(synthetic_input("req-never")),
        ])
        self.assertEqual(code, 0)
        self.assertEqual(out[0], {"protocolVersion": 1, "type": "pong", "generationId": "gen-1"})
        self.assertEqual(out[1]["type"], "result")
        self.assertEqual(out[1]["generationId"], "gen-1")
        self.assertEqual(out[1]["requestId"], "req-1")
        self.assertEqual(out[1]["result"]["status"], "ok")
        self.assertEqual(sorted(out[1]["result"]["fields"]), ["effortAdvice", "fanoutAdvice", "workloadClass"])
        self.assertEqual(len(out), 2)
        self.assertEqual(engine.calls, 1)

    def test_invalid_input_never_reaches_the_engine(self):
        engine = StubEngine()
        bad = synthetic_input("req-2")
        bad["facts"]["baselineAgents"] = "four"
        code, out = run_frames(engine, [infer_frame(bad)])
        self.assertEqual(out[0]["result"], {"status": "unavailable", "requestId": "req-2", "reason": "invalid_request"})
        self.assertEqual(engine.calls, 0)
        _, out = run_frames(engine, [infer_frame(synthetic_input("req-3"), request_id="req-other")])
        self.assertEqual(out[0]["type"], "error")
        self.assertEqual(out[0]["reason"], "request_id_mismatch")
        self.assertEqual(engine.calls, 0)

    def test_malformed_and_unknown_frames(self):
        engine = StubEngine()
        stdin = io.StringIO('{"protocolVersion":1,"type":"infer"' + "\n" + '{"protocolVersion":2,"type":"ping"}\n' + '{"protocolVersion":1,"type":"dance"}\n')
        stdout = io.StringIO()
        serve(engine, "gen-1", stdin, stdout, io.StringIO())
        out = [json.loads(line) for line in stdout.getvalue().splitlines()]
        self.assertEqual([o["type"] for o in out], ["error", "error", "error"])
        self.assertTrue(out[0]["reason"].startswith("protocol:malformed_json"))
        self.assertTrue(out[1]["reason"].startswith("protocol:protocol_version"))
        self.assertEqual(out[2]["reason"], "unknown_frame:dance")
        self.assertEqual(engine.calls, 0)

    def test_engine_failures_become_typed_unavailable(self):
        _, out = run_frames(StubEngine(fail="memory"), [infer_frame(synthetic_input("req-m"))])
        self.assertEqual(out[0]["result"], {"status": "unavailable", "requestId": "req-m", "reason": "oom"})
        _, out = run_frames(StubEngine(fail="generic"), [infer_frame(synthetic_input("req-g"))])
        self.assertEqual(out[0]["result"], {"status": "unavailable", "requestId": "req-g", "reason": "worker_crashed"})

    def test_frame_size_limits(self):
        with self.assertRaises(ProtocolError):
            encode_frame({"type": "result", "pad": "x" * (MAX_LINE_BYTES + 1)})
        with self.assertRaises(ProtocolError):
            parse_frame("x" * (MAX_LINE_BYTES + 1))

    def test_validate_input_mirrors_typescript_rules(self):
        good = validate_input(synthetic_input("req-v"))
        self.assertEqual(good["kind"], "planning")
        cases = [
            ({"extra": 1}, "unexpected_keys"),
            ({"kind": "release"}, "not_in_enum"),
            ({"summary": ""}, "empty_string"),
            ({"summary": "x" * (8 * 1024 + 1)}, "summary_too_large"),
            ({"schemaVersion": 2}, "unsupported_schema_version"),
        ]
        for patch, code in cases:
            value = synthetic_input("req-v")
            value.update(patch)
            with self.assertRaises(SchemaError) as ctx:
                validate_input(value)
            self.assertEqual(ctx.exception.code, code, patch)
        facts_cases = [
            ({"baselineAgents": 1.5}, "not_an_integer"),
            ({"baselineAgents": True}, "not_an_integer"),
            ({"baselineAgents": 999}, "integer_out_of_range"),
            ({"baselineEffort": "ultra"}, "not_in_enum"),
            ({"highRisk": "true"}, "not_a_boolean"),
        ]
        for patch, code in facts_cases:
            value = synthetic_input("req-v")
            value["facts"].update(patch)
            with self.assertRaises(SchemaError) as ctx:
                validate_input(value)
            self.assertEqual(ctx.exception.code, code, patch)
        value = synthetic_input("req-v")
        del value["facts"]["evidenceFresh"]
        with self.assertRaises(SchemaError):
            validate_input(value)

    def test_prompt_templates_are_fixed_and_bounded(self):
        prefix = render_prefix(synthetic_input("req-p"))
        self.assertTrue(prefix.startswith("<|im_start|>system\n"))
        self.assertTrue(prefix.endswith("<|im_end|>\n"))
        self.assertIn("untrusted text", prefix)
        for spec in fields_for("planning") + fields_for("recovery"):
            suffix, labels = render_field_suffix(spec)
            self.assertEqual(len(labels), len(spec.values))
            self.assertEqual(tuple(labels), LABELS[: len(spec.values)])
            self.assertTrue(suffix.endswith("<|im_start|>assistant\n"))
            for value in spec.values:
                self.assertNotIn(value, ("pass", "release", "skip_test", "skip_tests"))


if __name__ == "__main__":
    unittest.main()

#if canImport(XCTest)
import XCTest

final class ModelRefreshSummaryTests: XCTestCase {
    private let noon = Date(timeIntervalSince1970: 1_798_000_000)

    func testSuccessfulRefreshShowsTimeAndModelCount() {
        let outcome = ModelRefreshSummary.outcome(fromJSON: [
            "schema": "sks.desktop-bridge-command-result.v1",
            "ok": true,
            "result": ["model_refresh": ["ok": true, "total": 14, "line": "Model list refreshed: 14 models (+2 −1) generation 3f2a9c1e"]]
        ], at: noon)
        XCTAssertTrue(outcome.ok)
        XCTAssertTrue(outcome.text.hasPrefix("Model list updated at "))
        XCTAssertTrue(outcome.text.hasSuffix("(14 models)"))
    }

    func testFailedRefreshWithSchemaKeyIsAFailure() {
        let outcome = ModelRefreshSummary.outcome(fromJSON: [
            "schema": "sks.desktop-bridge-command-result.v1",
            "ok": false,
            "result": ["model_refresh": ["ok": false, "line": "Model list refresh failed; the previous list stays active."]]
        ], at: noon)
        XCTAssertFalse(outcome.ok)
        XCTAssertEqual(outcome.text, "Model list refresh failed; the previous list stays active.")
    }

    func testOuterOkWithFailedRefreshIsAFailure() {
        let outcome = ModelRefreshSummary.outcome(fromJSON: ["schema": "x", "ok": true, "result": ["model_refresh": ["ok": false]]], at: noon)
        XCTAssertFalse(outcome.ok)
    }

    func testUnreadableOutputIsAFailure() {
        XCTAssertFalse(ModelRefreshSummary.outcome(fromJSONText: "not json", at: noon).ok)
    }
}
#endif

#if canImport(XCTest)
import XCTest

final class LocalDecisionModelsTests: XCTestCase {
    private func statusPayload(mode: String = "off", consent: Bool = false, present: Bool = false, nextStep: String) -> [String: Any] {
        [
            "schema": "sks.jev-decision-status.v1",
            "ok": true,
            "mode": mode,
            "provider": "openrouter",
            "model": "typesafe/jev-1.13",
            "consentCloud": consent,
            "credential": ["present": present, "source": present ? "env" : NSNull()],
            "recovery": ["supported": false, "reason": "unsupported_no_sks_handler"],
            "nextStep": nextStep
        ]
    }

    func testCenterCommandsMatchThePinnedCLIContract() {
        XCTAssertEqual(LocalDecisionCommand.status, ["decision", "status", "--json"])
        XCTAssertEqual(LocalDecisionCommand.enable, [
            "decision", "enable",
            "--provider", "openrouter",
            "--model", "typesafe/jev-1.13",
            "--consent-cloud",
            "--json"
        ])
        XCTAssertEqual(LocalDecisionCommand.disable, ["decision", "disable", "--json"])
        XCTAssertTrue(LocalDecisionCommand.mutationSucceeded(
            ["schema": LocalDecisionCommand.enableSchema, "ok": true],
            schema: LocalDecisionCommand.enableSchema
        ))
        XCTAssertFalse(LocalDecisionCommand.mutationSucceeded(
            ["schema": LocalDecisionCommand.enableSchema, "ok": false],
            schema: LocalDecisionCommand.enableSchema
        ))
        XCTAssertFalse(LocalDecisionCommand.mutationSucceeded(
            ["schema": LocalDecisionCommand.statusSchema, "ok": true],
            schema: LocalDecisionCommand.enableSchema
        ))
    }

    func testStatusDecodesOffWithoutAKeyAndStillAllowsEnable() {
        let status = LocalDecisionStatus.decode(from: statusPayload(nextStep: "missing_key"))
        XCTAssertNotNil(status)
        XCTAssertEqual(status?.nextStep, .missingKey)
        XCTAssertEqual(status?.badgeText, "Off · deterministic baseline")
        XCTAssertEqual(status?.modeTitle, "Off")
        XCTAssertTrue(status?.canEnable == true)
        XCTAssertTrue(status?.canDisable == false)
        XCTAssertTrue(status?.guidance.contains("OpenRouter key") == true)
        XCTAssertTrue(status?.guidance.contains("turn the mode on") == true)
        XCTAssertTrue(status?.enableConsentMessage.contains("No OpenRouter key") == true)
        XCTAssertTrue(status?.modelLabel.contains("typesafe/jev-1.13") == true)
    }

    func testStatusReflectsEnabledJev() {
        let status = LocalDecisionStatus.decode(from: statusPayload(mode: "jev", consent: true, present: true, nextStep: "ready"))
        XCTAssertEqual(status?.badgeText, "Ready · Jev via OpenRouter")
        XCTAssertEqual(status?.modeTitle, "Jev")
        XCTAssertTrue(status?.badgeReady == true)
        XCTAssertTrue(status?.canEnable == false)
        XCTAssertTrue(status?.canDisable == true)
        XCTAssertTrue(status?.guidance.contains("Jev is on") == true)
        XCTAssertTrue(status?.guidance.contains("official preparation") == true)
    }

    func testEnabledJevWithoutAKeyIsNotReady() {
        let status = LocalDecisionStatus.decode(from: statusPayload(mode: "jev", consent: true, present: false, nextStep: "missing_key"))
        XCTAssertEqual(status?.badgeText, "Jev on · add OpenRouter key")
        XCTAssertTrue(status?.badgeReady == false)
        XCTAssertTrue(status?.canDisable == true)
    }

    func testStatusRejectsWrongSchemaOrFailure() {
        var payload = statusPayload(nextStep: "enable")
        payload["schema"] = "sks.other-status.v1"
        XCTAssertNil(LocalDecisionStatus.decode(from: payload))
        payload = statusPayload(nextStep: "enable")
        payload["ok"] = false
        XCTAssertNil(LocalDecisionStatus.decode(from: payload))
    }

    func testJSONPrefersTheFirstJevObjectOverANestedBrace() {
        let inner = #"{"ok":true,"schema":"sks.other.v1"}"#
        let status = """
        banner before json { not-json
        {
          "schema": "sks.jev-decision-status.v1",
          "ok": true,
          "mode": "off",
          "provider": "openrouter",
          "model": "typesafe/jev-1.13",
          "consentCloud": false,
          "credential": { "present": false, "source": null },
          "nextStep": "enable"
        }
        trailing { "ok": true, "schema": "sks.noise.v1" }
        """
        let payload = LocalDecisionJSON.object(from: status)
        XCTAssertEqual(payload?["schema"] as? String, "sks.jev-decision-status.v1")
        XCTAssertNotNil(LocalDecisionStatus.decode(from: payload ?? [:]))
        XCTAssertEqual(LocalDecisionJSON.object(from: inner)?["schema"] as? String, "sks.other.v1")
        XCTAssertEqual(
            LocalDecisionJSON.statusFailureReason(code: 2, output: "error: unknown command\nUsage: sks <command>"),
            "This SKS build does not include `decision`. Update SKS, then reopen Decisions."
        )
        XCTAssertEqual(
            LocalDecisionJSON.statusFailureReason(
                code: 1,
                output: #"{"ok":false,"reason":"unknown_command"}"#
            ),
            "Status unavailable · update SKS, then reopen this page."
        )
    }

    func testSidebarExposesTheDecisionsSectionOnce() {
        XCTAssertEqual(SidebarItem.allCases.filter { $0 == .localDecision }.count, 1)
        XCTAssertEqual(SidebarItem.localDecision.displayTitle, "Decisions")
        XCTAssertEqual(SidebarItem.localDecision.rawValue, "Decisions")
        XCTAssertEqual(SidebarItem.localDecision.symbolName, "cpu")
    }
}
#endif

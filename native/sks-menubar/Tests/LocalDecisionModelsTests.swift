#if canImport(XCTest)
import XCTest

final class LocalDecisionModelsTests: XCTestCase {
    private func statusPayload(installed: Bool, running: Bool, ready: Bool, mode: String = "off", supported: Bool = true, nextStep: String) -> [String: Any] {
        var payload: [String: Any] = [
            "schema": "sks.local-decision-status.v1", "ok": true, "mode": mode,
            "platform": ["supported": supported, "reason": (supported ? NSNull() : "unsupported_arch:x64") as Any],
            "installed": installed,
            "service": ["running": running, "ready": ready],
            "recommended": ["modelId": "mlx-community/Qwen2.5-1.5B-Instruct-4bit", "appliedAutomatically": false],
            "nextStep": nextStep
        ]
        if installed {
            payload["install"] = ["modelId": "mlx-community/Qwen2.5-1.5B-Instruct-4bit", "modelRevision": "8b403126fc14f14cfc99bb4cfa72ecbc129ea677", "quantization": "4bit-g64"]
            payload["readiness"] = ["realModelVerified": true, "receiptMatches": true]
        }
        return payload
    }

    func testStatusDecodesTheFreshInstallStepAndGuidance() {
        let status = LocalDecisionStatus.decode(from: statusPayload(installed: false, running: false, ready: false, nextStep: "install"))
        XCTAssertNotNil(status)
        XCTAssertEqual(status?.nextStep, .install)
        XCTAssertEqual(status?.badgeText, "Not installed")
        XCTAssertEqual(status?.recommendedModelId, "mlx-community/Qwen2.5-1.5B-Instruct-4bit")
        XCTAssertTrue(status?.guidance.hasPrefix("Step 1") == true)
        XCTAssertEqual(status?.modelLabel, "No model installed.")
    }

    func testStatusReflectsReadyServiceAndVerifiedModel() {
        let status = LocalDecisionStatus.decode(from: statusPayload(installed: true, running: true, ready: true, mode: "advisory", nextStep: "ready"))
        XCTAssertEqual(status?.badgeText, "Ready · mode Advisory")
        XCTAssertEqual(status?.modeTitle, "Advisory")
        XCTAssertTrue(status?.realModelVerified == true)
        XCTAssertTrue(status?.modelLabel.contains("8b403126fc14") == true)
        XCTAssertTrue(status?.modelLabel.contains("verified on this Mac: yes") == true)
    }

    func testUnsupportedPlatformNeverOffersInstall() {
        let status = LocalDecisionStatus.decode(from: statusPayload(installed: false, running: false, ready: false, supported: false, nextStep: "unsupported"))
        XCTAssertEqual(status?.nextStep, .unsupported)
        XCTAssertEqual(status?.badgeText, "Not available on this Mac")
        XCTAssertEqual(status?.platformReason, "unsupported_arch:x64")
    }

    func testStatusRejectsWrongSchemaOrFailure() {
        var payload = statusPayload(installed: false, running: false, ready: false, nextStep: "install")
        payload["schema"] = "sks.other.v1"
        XCTAssertNil(LocalDecisionStatus.decode(from: payload))
        payload = statusPayload(installed: false, running: false, ready: false, nextStep: "install")
        payload["ok"] = false
        XCTAssertNil(LocalDecisionStatus.decode(from: payload))
    }

    func testInstallPlanRequiresACompatibleWeightsRepositoryWithACommitRevision() {
        let compatible: [String: Any] = [
            "schema": "sks.local-decision-inspect.v1", "compatible": true, "kind": "weights",
            "modelId": "mlx-community/Qwen2.5-1.5B-Instruct-4bit",
            "resolvedRevision": "8b403126fc14f14cfc99bb4cfa72ecbc129ea677",
            "license": "apache-2.0", "downloadBytes": 880170545,
            "config": ["quantization": "4bit-g64"]
        ]
        let preview = LocalDecisionInstallPlan.preview(from: compatible)
        XCTAssertNotNil(preview)
        XCTAssertEqual(LocalDecisionInstallPlan.installArguments(preview!), [
            "decision", "install", "--model", "mlx-community/Qwen2.5-1.5B-Instruct-4bit",
            "--revision", "8b403126fc14f14cfc99bb4cfa72ecbc129ea677", "--accept-license", "--yes", "--json"
        ])
        XCTAssertEqual(LocalDecisionInstallPlan.formatBytes(880170545), "0.88 GB")

        var branch = compatible
        branch["resolvedRevision"] = "main"
        XCTAssertNil(LocalDecisionInstallPlan.preview(from: branch))

        let engineSource: [String: Any] = [
            "schema": "sks.local-decision-inspect.v1", "compatible": false, "kind": "engine_source",
            "modelId": "harshatheg/Qwen-2.5-1B-RLCD", "resolvedRevision": "2af86848be75847ccb3553b0941cc51d6ef7e4e9",
            "blockers": ["no_weights_in_repository"], "cardMentionedRepos": ["mlx-community/Qwen2.5-1.5B-Instruct-4bit"]
        ]
        XCTAssertNil(LocalDecisionInstallPlan.preview(from: engineSource))
        let summary = LocalDecisionInstallPlan.blockerSummary(from: engineSource)
        XCTAssertTrue(summary.contains("engine_source"))
        XCTAssertTrue(summary.contains("no_weights_in_repository"))
        XCTAssertTrue(summary.contains("mlx-community/Qwen2.5-1.5B-Instruct-4bit"))
    }

    func testSidebarExposesTheLocalDecisionSectionOnce() {
        XCTAssertEqual(SidebarItem.allCases.filter { $0 == .localDecision }.count, 1)
        XCTAssertEqual(SidebarItem.localDecision.displayTitle, "Local Decision")
        XCTAssertEqual(SidebarItem.localDecision.symbolName, "cpu")
    }
}
#endif

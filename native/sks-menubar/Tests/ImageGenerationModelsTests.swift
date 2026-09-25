#if canImport(XCTest)
import AppKit
import XCTest

final class ImageGenerationModelsTests: XCTestCase {
    private func status(_ json: String) throws -> ImageGenerationStatus {
        let payload = try XCTUnwrap(ImageGenerationJSON.object(from: json))
        return try XCTUnwrap(ImageGenerationStatus.decode(from: payload))
    }

    private func catalog(_ json: String) throws -> ImageGenerationModelCatalog {
        let payload = try XCTUnwrap(ImageGenerationJSON.object(from: json))
        return try XCTUnwrap(ImageGenerationModelCatalog.decode(from: payload))
    }

    private let modelsJSON = """
    {
      "schema": "sks.imagegen-openrouter-models.v1",
      "ok": true,
      "source": "cache",
      "fetched_at": "2026-09-25T09:30:00.000Z",
      "models": [
        null,
        { "name": "Row without an id" },
        { "id": "   " },
        {
          "id": "black-forest-labs/flux.2-pro",
          "name": "FLUX.2 Pro",
          "input_modalities": ["text", "image"],
          "output_modalities": ["image"],
          "pricing": { "prompt": null, "completion": "0.00003", "image": 0.04, "request": "0" },
          "context_length": 32768,
          "selected": true,
          "architecture": { "tokenizer": "Other" }
        },
        {
          "id": "google/gemini-2.5-flash-image",
          "name": null,
          "input_modalities": null,
          "output_modalities": ["image", "text"],
          "pricing": null,
          "context_length": null
        },
        { "id": "black-forest-labs/flux.2-pro", "name": "Duplicate row", "selected": false }
      ],
      "blockers": [],
      "future_catalog_field": { "ignored": true }
    }
    """

    func testCenterCommandsMatchTheImagegenCLIContract() {
        XCTAssertEqual(ImageGenerationCommand.status, ["imagegen", "status", "--json"])
        XCTAssertEqual(ImageGenerationCommand.models(), ["imagegen", "models", "--json"])
        XCTAssertEqual(ImageGenerationCommand.models(refresh: false), ["imagegen", "models", "--json"])
        XCTAssertEqual(ImageGenerationCommand.models(refresh: true), ["imagegen", "models", "--refresh", "--json"])
        XCTAssertEqual(
            ImageGenerationCommand.enable(model: "black-forest-labs/flux.2-pro"),
            ["imagegen", "enable", "--model", "black-forest-labs/flux.2-pro", "--json"]
        )
        XCTAssertEqual(ImageGenerationCommand.disable, ["imagegen", "disable", "--json"])
        XCTAssertEqual(ImageGenerationCommand.statusSchema, "sks.imagegen-status.v1")
        XCTAssertEqual(ImageGenerationCommand.modelsSchema, "sks.imagegen-openrouter-models.v1")
    }

    func testModelIdsThatCouldReadAsFlagsAreRefused() {
        XCTAssertTrue(ImageGenerationCommand.isAcceptableModelId("black-forest-labs/flux.2-pro"))
        XCTAssertTrue(ImageGenerationCommand.isAcceptableModelId("google/gemini-2.5-flash-image:free"))
        for id in ["", "--json", "-m", "openai/gpt image", "openai/gpt\nimage", String(repeating: "a", count: 201)] {
            XCTAssertFalse(ImageGenerationCommand.isAcceptableModelId(id), id)
        }
    }

    func testStatusDecodesCodexDefaultWithANullModelAndUnknownFields() throws {
        let status = try status("""
        {
          "schema": "sks.imagegen-status.v1",
          "ok": true,
          "mode": "codex",
          "custom_model_enabled": false,
          "openrouter_model": null,
          "openrouter_key_present": false,
          "effective": { "provider": "codex", "model": "gpt-image-2", "label": "Codex default image generation", "future": 1 },
          "jev_enabled": false,
          "blockers": [],
          "warnings": [],
          "config_path": "/tmp/sks/imagegen.json",
          "future_top_level_field": { "nested": [1, 2, 3] }
        }
        """)
        XCTAssertTrue(status.ok)
        XCTAssertEqual(status.mode, "codex")
        XCTAssertFalse(status.customModelEnabled)
        XCTAssertNil(status.openRouterModel)
        XCTAssertEqual(status.openRouterKeyPresent, false)
        XCTAssertEqual(status.effective, .init(provider: "codex", model: "gpt-image-2", label: "Codex default image generation"))
        XCTAssertEqual(status.configPath, "/tmp/sks/imagegen.json")
        XCTAssertNil(status.changed)
        XCTAssertEqual(status.badgeText, "Codex default image generation")
        XCTAssertEqual(status.routeDetail, "Codex built-in image generation · model gpt-image-2")
        XCTAssertEqual(status.tone, .neutral)
        XCTAssertEqual(status.keyHint, "A custom image model needs an OpenRouter key. Add it under Accounts → OpenRouter on the Connections page.")
        XCTAssertNil(status.jevNote)
        XCTAssertTrue(status.blockerMessages.isEmpty && status.warningMessages.isEmpty)
    }

    func testStatusDecodesTheOpenRouterRouteWithJevAndReadableWarnings() throws {
        let status = try status("""
        {"schema":"sks.imagegen-status.v1","ok":true,"mode":"openrouter","custom_model_enabled":true,
         "openrouter_model":"black-forest-labs/flux.2-pro","openrouter_key_present":true,
         "effective":{"provider":"openrouter","model":"black-forest-labs/flux.2-pro","label":"OpenRouter · FLUX.2 Pro"},
         "jev_enabled":true,"blockers":[],"warnings":["openrouter_models_unavailable: served from cache"],
         "config_path":"/tmp/sks/imagegen.json"}
        """)
        XCTAssertTrue(status.customModelEnabled)
        XCTAssertEqual(status.openRouterModel, "black-forest-labs/flux.2-pro")
        XCTAssertEqual(status.badgeText, "OpenRouter · FLUX.2 Pro")
        XCTAssertEqual(status.routeDetail, "OpenRouter through the SKS Desktop Bridge · model black-forest-labs/flux.2-pro")
        XCTAssertEqual(status.tone, .ready)
        XCTAssertNil(status.keyHint)
        XCTAssertEqual(status.jevNote, "Jev picks image size and quality for each request.")
        XCTAssertEqual(status.warningMessages, [
            "The OpenRouter model list is unavailable. Check the OpenRouter connection, then choose Refresh. (served from cache)"
        ])
    }

    func testEnabledRouteWithBlockersOrWithoutAKeyIsNotReady() throws {
        let blocked = try status("""
        {"schema":"sks.imagegen-status.v1","ok":true,"mode":"openrouter","custom_model_enabled":true,
         "openrouter_model":"openai/gpt-4o","openrouter_key_present":false,
         "effective":{"provider":"codex","model":"gpt-image-2","label":"Codex default image generation"},
         "jev_enabled":false,"blockers":["imagegen_model_not_image_capable"],"warnings":[],"config_path":"/tmp/x"}
        """)
        XCTAssertEqual(blocked.tone, .attention)
        XCTAssertNotNil(blocked.keyHint)
        XCTAssertEqual(blocked.blockerMessages, ["That model cannot create images. Choose one whose output includes images."])
        let keyless = try status("""
        {"schema":"sks.imagegen-status.v1","ok":true,"mode":"openrouter","custom_model_enabled":true,
         "openrouter_model":"black-forest-labs/flux.2-pro","openrouter_key_present":false,
         "effective":{"provider":"openrouter","model":"black-forest-labs/flux.2-pro","label":"OpenRouter · FLUX.2 Pro"},
         "jev_enabled":false,"blockers":[],"warnings":[],"config_path":"/tmp/x"}
        """)
        XCTAssertEqual(keyless.tone, .attention)
    }

    func testMissingOptionalStatusFieldsDecodeAsNil() throws {
        let status = try XCTUnwrap(ImageGenerationStatus.decode(from: [
            "schema": "sks.imagegen-status.v1", "ok": true, "custom_model_enabled": true
        ]))
        XCTAssertEqual(status.mode, "openrouter")
        XCTAssertNil(status.openRouterModel)
        XCTAssertNil(status.openRouterKeyPresent)
        XCTAssertNil(status.keyHint)
        XCTAssertNil(status.effective)
        XCTAssertNil(status.configPath)
        XCTAssertNil(status.changed)
        XCTAssertFalse(status.jevEnabled)
        XCTAssertEqual(status.badgeText, "OpenRouter · no model selected")
        XCTAssertEqual(status.routeDetail, "OpenRouter through the SKS Desktop Bridge")
        XCTAssertEqual(status.tone, .attention)
    }

    func testStatusRejectsForeignSchemasAndAMissingSwitchState() {
        XCTAssertNil(ImageGenerationStatus.decode(from: ["schema": "sks.imagegen-status.v2", "ok": true, "custom_model_enabled": false]))
        XCTAssertNil(ImageGenerationStatus.decode(from: ["schema": "sks.imagegen-openrouter-models.v1", "ok": true, "custom_model_enabled": false]))
        XCTAssertNil(ImageGenerationStatus.decode(from: ["schema": "sks.imagegen-status.v1", "ok": true]))
        let refused = ImageGenerationStatus.decode(from: [
            "schema": "sks.imagegen-status.v1", "ok": false, "custom_model_enabled": true,
            "openrouter_model": "black-forest-labs/flux.2-pro", "openrouter_key_present": true,
            "blockers": ["imagegen_config_unreadable"]
        ])
        XCTAssertEqual(refused?.tone, .attention)
        XCTAssertEqual(refused?.blockerMessages, ["Imagegen config unreadable"])
    }

    func testModelsDecodeSkipsNullAndIdlessRowsAndIgnoresUnknownFields() throws {
        let catalog = try catalog(modelsJSON)
        XCTAssertTrue(catalog.ok)
        XCTAssertEqual(catalog.source, "cache")
        XCTAssertEqual(catalog.fetchedAt, "2026-09-25T09:30:00.000Z")
        XCTAssertEqual(catalog.models.map(\.id), ["black-forest-labs/flux.2-pro", "google/gemini-2.5-flash-image"])
        XCTAssertEqual(catalog.selectedModelId, "black-forest-labs/flux.2-pro")
        XCTAssertEqual(catalog.summary(), "2 image models · cached list · fetched 2026-09-25T09:30:00.000Z")
        let flux = catalog.models[0]
        XCTAssertEqual(flux.name, "FLUX.2 Pro")
        XCTAssertEqual(flux.inputModalities, ["text", "image"])
        XCTAssertEqual(flux.outputModalities, ["image"])
        XCTAssertNil(flux.promptPrice)
        XCTAssertEqual(flux.completionPrice, "0.00003")
        XCTAssertEqual(flux.imagePrice, "0.04")
        XCTAssertEqual(flux.contextLength, 32768)
        XCTAssertTrue(flux.selected)
        XCTAssertEqual(flux.menuTitle(current: true), "FLUX.2 Pro  ·  black-forest-labs/flux.2-pro  ·  current")
        XCTAssertEqual(flux.capabilityLine, "Input: text, image · Output: image")
        let gemini = catalog.models[1]
        XCTAssertEqual(gemini.name, "google/gemini-2.5-flash-image")
        XCTAssertEqual(gemini.inputModalities, [])
        XCTAssertNil(gemini.imagePrice)
        XCTAssertNil(gemini.contextLength)
        XCTAssertFalse(gemini.selected)
        XCTAssertEqual(gemini.menuTitle(current: false), "google/gemini-2.5-flash-image")
        XCTAssertEqual(gemini.capabilityLine, "Input: not reported · Output: image, text")
    }

    func testModelListFailureKeepsItsBlockersAndRejectsOtherSchemas() throws {
        let failed = try catalog("""
        {"schema":"sks.imagegen-openrouter-models.v1","ok":false,"source":"openrouter","fetched_at":null,
         "models":[],"blockers":["openrouter_models_unavailable"]}
        """)
        XCTAssertFalse(failed.ok)
        XCTAssertTrue(failed.models.isEmpty)
        XCTAssertNil(failed.selectedModelId)
        XCTAssertNil(failed.fetchedAt)
        XCTAssertEqual(failed.blockers, ["openrouter_models_unavailable"])
        XCTAssertEqual(failed.summary(), "0 image models · live from OpenRouter")
        XCTAssertNil(ImageGenerationModelCatalog.decode(from: ["schema": "sks.imagegen-status.v1", "ok": true, "models": []]))
    }

    func testPopupMarksTheSavedModelAndKeepsItWhenTheListDropsIt() throws {
        let models = try catalog(modelsJSON).models
        let marked = ImageGenerationPopup.entries(models: models, currentId: "google/gemini-2.5-flash-image")
        XCTAssertEqual(marked.map(\.title), [
            "FLUX.2 Pro  ·  black-forest-labs/flux.2-pro",
            "google/gemini-2.5-flash-image  ·  current"
        ])
        let missing = ImageGenerationPopup.entries(models: models, currentId: "openai/gpt-5-image")
        XCTAssertEqual(missing.first, ImageGenerationPopupEntry(id: "openai/gpt-5-image", title: "openai/gpt-5-image  ·  current"))
        XCTAssertEqual(missing.count, models.count + 1)
        XCTAssertEqual(ImageGenerationPopup.entries(models: [], currentId: nil), [])

        let flux = "black-forest-labs/flux.2-pro", gemini = "google/gemini-2.5-flash-image"
        XCTAssertEqual(ImageGenerationPopup.preferredId(entries: marked, pending: flux, current: gemini, catalogSelected: nil), flux)
        XCTAssertEqual(ImageGenerationPopup.preferredId(entries: marked, pending: "gone/model", current: gemini, catalogSelected: flux), gemini)
        XCTAssertEqual(ImageGenerationPopup.preferredId(entries: marked, pending: nil, current: nil, catalogSelected: gemini), gemini)
        XCTAssertEqual(ImageGenerationPopup.preferredId(entries: marked, pending: nil, current: nil, catalogSelected: nil), flux)
        XCTAssertNil(ImageGenerationPopup.preferredId(entries: [], pending: flux, current: flux, catalogSelected: flux))
    }

    func testMutationsSucceedOnlyWithExitZeroOkAndTheStatusSchema() throws {
        let refusal = """
        Checking OpenRouter models {progress}
        {"schema":"sks.imagegen-status.v1","ok":false,"changed":false,"mode":"codex","custom_model_enabled":false,
         "openrouter_model":null,"openrouter_key_present":true,
         "effective":{"provider":"codex","model":"gpt-image-2","label":"Codex default image generation"},
         "jev_enabled":false,"blockers":["imagegen_model_not_image_capable"],"warnings":[],"config_path":"/tmp/x"}
        """
        let payload = ImageGenerationJSON.object(from: refusal)
        XCTAssertFalse(ImageGenerationCommand.mutationSucceeded(code: 1, payload: payload))
        XCTAssertFalse(ImageGenerationCommand.mutationSucceeded(code: 0, payload: payload))
        let receipt = ImageGenerationReceipt.decode(from: payload)
        XCTAssertFalse(receipt.ok)
        XCTAssertEqual(receipt.changed, false)
        XCTAssertEqual(receipt.blockers, ["imagegen_model_not_image_capable"])
        XCTAssertEqual(receipt.primaryIssue, "That model cannot create images. Choose one whose output includes images.")

        let applied: [String: Any] = [
            "schema": "sks.imagegen-status.v1", "ok": true, "changed": true, "mode": "openrouter",
            "custom_model_enabled": true, "openrouter_model": "black-forest-labs/flux.2-pro"
        ]
        XCTAssertTrue(ImageGenerationCommand.mutationSucceeded(code: 0, payload: applied))
        XCTAssertFalse(ImageGenerationCommand.mutationSucceeded(code: 1, payload: applied))
        XCTAssertEqual(ImageGenerationStatus.decode(from: applied)?.changed, true)
        var foreign = applied
        foreign["schema"] = "sks.imagegen-openrouter-models.v1"
        XCTAssertFalse(ImageGenerationCommand.mutationSucceeded(code: 0, payload: foreign))
        XCTAssertFalse(ImageGenerationCommand.mutationSucceeded(code: 0, payload: nil))
        XCTAssertNil(ImageGenerationReceipt.decode(from: nil).primaryIssue)
    }

    func testJSONPrefersTheImagegenObjectOverBannersAndNoise() {
        let mixed = """
        warning: {"ok":true,"schema":"sks.other.v1"}
        {"schema":"sks.imagegen-status.v1","ok":true,"custom_model_enabled":false,
         "effective":{"provider":"codex","label":"Codex {default}"}}
        trailing { "ok": true }
        """
        let payload = ImageGenerationJSON.object(from: mixed)
        XCTAssertEqual(payload?["schema"] as? String, "sks.imagegen-status.v1")
        XCTAssertEqual(payload.flatMap { ImageGenerationStatus.decode(from: $0) }?.badgeText, "Codex {default}")
        XCTAssertEqual(ImageGenerationJSON.object(from: #"{"ok":false,"reason":"unknown_command"}"#)?["reason"] as? String, "unknown_command")
        XCTAssertNil(ImageGenerationJSON.object(from: "no json here"))
    }

    func testUnavailableReasonsExplainMissingOrOlderSKS() {
        XCTAssertEqual(
            ImageGenerationJSON.unavailableReason(code: 127, output: "SKS command not found. Run npm install -g sneakoscope", payload: nil),
            "SKS is not on this Menu Bar path. Update SKS, then reopen Image Generation."
        )
        let older = #"{"ok":false,"status":"blocked","command":"imagegen","reason":"unknown_command"}"#
        XCTAssertEqual(
            ImageGenerationJSON.unavailableReason(code: 1, output: older, payload: ImageGenerationJSON.object(from: older)),
            "This SKS build does not include `imagegen`. Update SKS, then reopen Image Generation."
        )
        let timeout = ProcessClient.nativeFailureOutput("native_process_timeout")
        XCTAssertEqual(
            ImageGenerationJSON.unavailableReason(code: -2, output: timeout, payload: ImageGenerationJSON.object(from: timeout)),
            "SKS did not answer in time."
        )
        XCTAssertEqual(
            ImageGenerationJSON.unavailableReason(code: 1, output: "", payload: nil),
            "SKS returned no readable answer. Update SKS, then reopen this page."
        )
    }

    func testBlockerWordingKeepsUnknownCodesReadable() {
        XCTAssertEqual(ImageGenerationMessages.describe("imagegen_model_required"), "Choose an OpenRouter image model first.")
        XCTAssertEqual(
            ImageGenerationMessages.describe("imagegen_model_not_image_capable: openai/gpt-4o"),
            "That model cannot create images. Choose one whose output includes images. (openai/gpt-4o)"
        )
        XCTAssertEqual(ImageGenerationMessages.describe("imagegen_config_unreadable"), "Imagegen config unreadable")
        XCTAssertEqual(ImageGenerationMessages.describe("  "), "Unknown issue.")
    }

    func testSidebarExposesImageGenerationOnceBetweenDecisionsAndDiagnostics() {
        let order = SidebarItem.allCases
        XCTAssertEqual(order.filter { $0 == .imageGeneration }.count, 1)
        XCTAssertEqual(SidebarItem.imageGeneration.rawValue, "Image Generation")
        XCTAssertEqual(SidebarItem.imageGeneration.displayTitle, "Image Generation")
        XCTAssertEqual(SidebarItem.imageGeneration.symbolName, "photo")
        XCTAssertNotNil(NSImage(systemSymbolName: SidebarItem.imageGeneration.symbolName, accessibilityDescription: nil))
        XCTAssertEqual(order.firstIndex(of: .imageGeneration), order.firstIndex(of: .localDecision).map { $0 + 1 })
        XCTAssertEqual(order.firstIndex(of: .diagnostics), order.firstIndex(of: .imageGeneration).map { $0 + 1 })
    }
}
#endif

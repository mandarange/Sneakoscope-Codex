# Image generation

SKS uses **GPT Image 2.5 Sunburst** (`gpt-image-2.5-sunburst`) for image creation,
editing, UX callouts, and PPT assets/reviews. The model, supported quality values,
documentation links, and verification date have one source:
`src/core/imagegen/imagegen-model-policy.ts`.

The [official model page](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst)
and [image guide](https://developers.openai.com/api/docs/guides/image-generation)
were checked on 2026-09-10. Sunburst is the current recommendation for precise
editing; Flare is the faster alternative. SKS does not silently switch models.

For Images API requests, SKS sends `model: "gpt-image-2.5-sunburst"`. For Responses,
it preserves the selected mainline model and sets the image tool's own `model`
field. The existing selected Desktop Bridge owns provider credentials and routing.
Direct API calls still require an explicitly authorized API path.

For a managed Desktop Bridge, pass its configured public mainline model with
`sks ux-review run --image <path> --responses-model <public-model>`, or set
`SKS_IMAGEGEN_RESPONSES_MODEL` for CLI/UX/PPT calls. This chooses the existing
provider route; it does not replace the image tool's Sunburst model. SKS rejects
missing or unconfigured routes instead of guessing another provider or identity.

Quality supports `low`, `medium`, `high`, `xhigh`, `max`, and `auto`. Custom sizes
must use multiples of 16, an aspect ratio from 1:3 to 3:1, edges at most 3840,
and 655,360 to 8,294,400 pixels. Transparent output requires PNG or WebP. SKS
does not send the older models' `input_fidelity` option or claim its former
automatic-fidelity behavior as a 2.5 guarantee.

## Host model selection

The [Codex image documentation](https://learn.chatgpt.com/docs/image-generation)
still identifies the built-in engine as `gpt-image-2`. The current host tool has
no model selector. Naming Sunburst in a prompt or importing an image file cannot
change or prove that engine, so that path reports `imagegen_model_unavailable`
for the current policy. SKS uses its selected model-capable provider or reports
the unavailable path; it never relabels an older or unknown output as Sunburst.

## Keeping the model current

The SKS image skills require checking the official model catalog and image guide
before adopting a successor. Update the shared policy and validate the request
contract together. OpenAI documents no evergreen alias for the recommended
GPT Image model: `chatgpt-image-latest` is deprecated and points to an older
ChatGPT image model. SKS does not guess a future model ID or silently scrape and
execute a new model contract at runtime. Updating SKS carries the verified policy.

## Removed legacy state

The model-specific validator, function names, and request/response artifact
names have been replaced with `imagegen-request-validator`,
`generateImagegenCalloutReview`, and `image-ux-imagegen-request/response.json`.
The duplicate request artifact write and the `SKS_REAL_IMAGEGEN` alias are removed;
use `SKS_TEST_REAL_IMAGEGEN` for live smoke runs. Old generated images and historical
receipts are not rewritten as evidence for a newer model. A new request must
produce current-model output before a generated-image claim can pass.

The unreferenced README image handoff and the unused newest-file auto-discovery
implementation were removed. Existing artwork remains intact; output files
without a recorded model cannot silently become current-model evidence.

# Image generation

SKS makes images for image generation, UX-Review callouts, PPT assets, and slide
reviews. Where those images come from is one setting, the **image mode**, chosen
on the Image Generation page of SKS Control Center or with `sks imagegen`.
SKS never pins an image model: it records the model that produced each output.

| Mode | How SKS makes an image |
|---|---|
| Codex default (custom image model off) | Codex's own image generation. Inside a Codex turn that is the built-in image tool. Outside a turn, `sks imagegen generate` sends the hosted `image_generation` tool through the SKS Desktop Bridge on the route of your Codex model (the `model =` line of `~/.codex/config.toml`). Codex picks the engine, so outputs are recorded as `codex-default`. |
| Custom image model (on) | The OpenRouter image model you chose. Every SKS image goes through the bridge endpoint `POST /__sks/imagegen/generations`, and the bridge adds the OpenRouter key it holds. The built-in image tool is not used in this mode. |

The mode lives in `~/.sneakoscope/imagegen/config.json`
(`sks.imagegen-config.v1`). A missing or broken file means Codex default.

## Commands

| Command | What it does |
|---|---|
| `sks imagegen status --json` | The active mode, the chosen model, and whether an OpenRouter key is stored. Local only, no network. |
| `sks imagegen models [--refresh] --json` | OpenRouter image models, cached for 6 hours. |
| `sks imagegen enable --model <id>` | Turn on the custom mode with a listed model. |
| `sks imagegen disable` | Go back to Codex default. The last model is kept for next time. |
| `sks imagegen generate --prompt <text> --out <file> [--reference <file>]... [--aspect <ratio>] [--quality low\|medium\|high]` | Make an image with the active mode. Add `--reference` to edit an image. |

## Custom OpenRouter model

The model list comes from OpenRouter's Image API (`GET /api/v1/images/models`),
which reports each model's accepted aspect ratios, qualities, output formats, and
reference-image limit. When that list is unreachable SKS reads the general
catalog filtered to image output. Router ids such as `openrouter/auto` are left
out because they cannot say which model made an image.

Generation uses `POST /api/v1/images`. SKS fits each request to the model:

- an aspect ratio the model does not accept becomes its closest accepted ratio;
- a quality or output format the model does not list is left out;
- extra reference images are trimmed to the model's limit.

Each adjustment is reported as a warning. A model that accepts no reference image
cannot edit images, so UX-Review callouts and slide callouts cannot use it;
`sks imagegen enable` warns with `imagegen_model_takes_no_reference_images`.
If the running bridge predates the image endpoint, SKS calls OpenRouter directly
with the same stored key. If `/api/v1/images` itself answers 404, SKS uses the
chat-completions form with `modalities`.

## Codex default through the bridge

Outside a Codex turn, the bridge must serve your Codex model on a route SKS can
authenticate: a codex-lb or OpenRouter provider route. The official ChatGPT route
carries Codex's own login, which SKS does not read, so there
`sks imagegen generate` reports `codex_route_requires_codex_auth` and the
built-in image tool inside a turn remains the path. `SKS_IMAGEGEN_RESPONSES_MODEL`,
or `--responses-model` on `sks ux-review run`, chooses a different bridge route
model to carry the image tool. A request with a reference image asks the tool to
edit it. A partial preview frame is never an image.

## Evidence

Every output gets a sidecar `<image>.sks-imagegen.json` (`sks.imagegen-output.v1`)
with the mode, model, provider, route, evidence class, output source, and the
image's SHA-256. UX-Review, PPT, and slide gates accept an image only while its
sidecar still matches its bytes and names a recorded model. Placeholder names
such as `unknown`, `pending`, or `mock` never pass. The evidence classes are
`sks_custom_imagegen` and `codex_bridge_route_imagegen`. When the returned bytes
are another format than the requested name, SKS saves them under the real
extension and warns `imagegen_output_extension_changed`, so a JPEG is never
named `.png`.

## Jev

With Jev mode on, `sks imagegen generate` asks Jev for the aspect ratio and
quality the caller left open, in one call; unconfident answers keep the
defaults. When the custom mode is on, the Jev plan made for each prompt also
decides whether the turn makes an image, so the custom-mode instruction appears
only on image turns.

## OpenAI Images API fallback

The OpenAI Images API is an explicit opt-in (`SKS_IMAGEGEN_ALLOW_API_FALLBACK=1`)
recorded as `non_codex_api_fallback` evidence. An `OPENAI_API_KEY` in the
environment never enables it. It sends a concrete model, `gpt-image-2` or
`SKS_IMAGEGEN_API_MODEL`. Its request limits: quality `low`, `medium`, `high`,
`xhigh`, `max`, or `auto`; custom sizes in multiples of 16 with an aspect ratio
from 1:3 to 3:1, edges at most 3840, and 655,360 to 8,294,400 pixels;
transparent output only as PNG or WebP; never `input_fidelity`.

## Removed

- The pinned `gpt-image-2.5-sunburst` requirement and its
  `imagegen_model_unavailable` blocker. Codex's own image tool is a valid path
  again, and outputs are checked for a recorded model, not a pinned one.
- The Desktop Bridge Responses branch inside the OpenAI fallback adapter
  (`desktop_bridge_responses_image_generation`). The bridge path is
  `sks imagegen generate`.

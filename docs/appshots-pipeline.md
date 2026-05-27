# Appshots Pipeline

SKS 1.18.8 records Appshots as operator-assisted visual/app-state evidence. Nonvisual work is not blocked by Appshots. Visual proof that asks for screenshots, UI, UX, browser previews, or Appshots requires an operator-recorded source path or an available Appshots tool signal.

Artifacts:

- `appshots-capability.json`
- `appshots-operator-policy.json`
- `appshots-evidence.json`
- `appshots-privacy-safety.json`
- `appshots-triwiki-voxel.json`

Privacy rules are always explicit: redact sensitive text, avoid secrets and credentials, use only user-visible app state, and do not capture background screens.

Run:

```bash
npm run appshots:capability
npm run appshots:operator-policy
npm run appshots:evidence
npm run appshots:source-intelligence
npm run appshots:triwiki-voxel
npm run appshots:privacy-safety
```

Official Appshots reference: https://developers.openai.com/codex/appshots

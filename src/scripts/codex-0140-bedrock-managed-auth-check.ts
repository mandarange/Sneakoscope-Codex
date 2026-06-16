#!/usr/bin/env node
import { runCodex0140FeatureGate } from './codex-0140-feature-gate-lib.js';
await runCodex0140FeatureGate('codex:0140-bedrock-managed-auth', 'bedrock_managed_auth');

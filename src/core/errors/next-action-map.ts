export interface BlockerDiagnostic {
  human_summary: string
  next_actions: string[]
}

const NEXT_ACTIONS: Record<string, BlockerDiagnostic> = {
  source_acquisition_unavailable: {
    human_summary: 'Super-Search has no live source acquisition path available for this request.',
    next_actions: ['sks super-search doctor --json']
  },
  parallel_runtime_events_missing: {
    human_summary: 'Parallel worker runtime events were not recorded.',
    next_actions: ['sks naruto proof latest --json']
  },
  worker_timestamp_overlap_missing: {
    human_summary: 'There is no evidence that workers actually overlapped in time.',
    next_actions: ['cat .sneakoscope/missions/latest/parallel-runtime-proof.json']
  },
  production_proof_mock_only: {
    human_summary: 'A production gate received mock-only proof.',
    next_actions: ['Inspect whether a mock backend path is connected to production proof.']
  },
  direct_url_fetch_adapter_unavailable: {
    human_summary: 'Direct URL fetch is unavailable in this Node runtime.',
    next_actions: ['node -e "console.log(typeof fetch)"']
  },
  direct_url_fetch_failed: {
    human_summary: 'Direct URL fetch failed before verified content could be captured.',
    next_actions: ['sks super-search doctor --json']
  },
  direct_url_fetch_timeout: {
    human_summary: 'Direct URL fetch timed out before verified content could be captured.',
    next_actions: ['Retry the fetch or inspect local network access.']
  },
  direct_url_fetch_empty_content: {
    human_summary: 'Direct URL fetch returned no readable content.',
    next_actions: ['Open the URL manually and check whether it requires authentication or JavaScript rendering.']
  }
}

export function diagnosticForBlocker(blocker: string): BlockerDiagnostic {
  const exact = NEXT_ACTIONS[blocker]
  if (exact) return exact
  if (/^direct_url_fetch_http_\d+$/.test(blocker)) {
    return {
      human_summary: `Direct URL fetch returned HTTP ${blocker.replace('direct_url_fetch_http_', '')}.`,
      next_actions: ['Open the URL manually and verify whether it is public and reachable.']
    }
  }
  if (blocker.startsWith('super_search_mission_artifact_missing:')) {
    return {
      human_summary: 'A required Super-Search evidence artifact is missing.',
      next_actions: [`cat ${blocker.slice('super_search_mission_artifact_missing:'.length)}`]
    }
  }
  return {
    human_summary: `Gate blocked on machine reason: ${blocker}.`,
    next_actions: ['Inspect the gate JSON and referenced evidence paths.']
  }
}


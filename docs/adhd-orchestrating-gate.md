# ADHD Orchestrating Gate

SKS 1.18.8 adds a strategy-first orchestration gate for native agent runs. The ADHD/dopamine wording is only an execution UX metaphor: it never makes medical claims and only describes how SKS slices work into visible, verifiable micro-wins.

The gate writes these artifacts before scheduling agents:

- `adhd-orchestrating-gate.json`
- `dopamine-orchestration-plan.json`
- `progress-reward-ledger.json`
- `micro-win-task-board.json`
- `micro-win-task-board.md`
- `focus-recovery-plan.json`
- `momentum-restart-plan.json`
- `novelty-rotation-plan.json`
- `parallel-strategy-score.json`

Run:

```bash
npm run strategy:adhd-orchestrating-gate
```

Write-capable agent runs carry `strategy_refs` through the task graph, queue slices, proof evidence, and runtime truth matrix.

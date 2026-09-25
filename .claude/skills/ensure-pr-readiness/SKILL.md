---
name: ensure-pr-readiness
description: Use when verifying a branch or PR is ready to open or undraft, or when asked for a PR-readiness review. Runs the typecheck and lint gate, a correctness review, a conventions walk over AGENTS.md with file:line evidence, the api, web, and Expo escalations, then reports READY or NOT READY. Not for opening the PR or writing its title and description, which is manage-pr.
---

# ensure-pr-readiness

This skill applies the repository rules to a diff and reports blocking findings and suggestions. The rules live in [AGENTS.md](../../../AGENTS.md). This skill contains none of the rules. It contains only the run scope, the order of operations, and the report format.

## Entry modes

| Mode | Diff basis |
|------|-----------|
| Branch (default) | `git fetch origin main`, then `git diff origin/main...HEAD` (three-dot). When the repository has no remote, use `git diff main...HEAD`. |
| PR number | `gh pr diff <n>`, `gh pr view <n>`. |

## Scope the run

Pick a tier from the diff before you start. Steps 1 and 5 always run. Steps 2 to 4 scale with the tier.

| Tier | When | Steps 2 to 4 |
|------|------|--------------|
| Small | 5 files or fewer, additive or mechanical, no step-4 trigger: a rename, a guard, a constant, a style tweak. | Step 2 at the lowest effort. Step 3 only for the AGENTS.md sections whose subject changed. Skip step 4. |
| Standard | Neither Small nor Deep. | As written. |
| Deep | A step-4 trigger fires, or the diff changes `package.json` dependencies, `apps/api/project.json`, `nx.json`, or a deploy config (`vercel.json`, `Dockerfile`). | As written, at raised effort. |

Promote the tier when the diff surprises you. Never demote the tier to avoid a trigger.

## Order of operations

Do not reorder the steps. A review on a red gate is wasted effort.

1. **Mechanical gate.** Run `pnpm typecheck` and `pnpm lint` from the repository root. They cover `api` and `web`. When the diff touches `apps/mobile`, also run `npm run typecheck` and `npm run lint` from `apps/mobile`. If a command fails, stop and report. Do not continue to the review.
2. **Correctness review.** Invoke the `code-review` skill on the diff. Map Small to `low`, Standard to `medium`, and Deep to `high`.
3. **Conventions walk.** Apply each [AGENTS.md](../../../AGENTS.md) section whose subject the diff changes. Each verdict is pass or fail and cites `file:line` evidence. A bare assertion is not a verdict.
4. **Conditional escalations.** Skip this step at Small. Otherwise, run each escalation that the diff triggers:
   - The diff changes an auth, JWT, or PII mechanism (`/api/auth/*`, `AUTH_JWT_SECRET`, the accounts table): invoke the `security-review` skill before you open the PR.
   - The diff introduces an env var: confirm that `apps/api/.env.example` or `apps/web/.env.example` lists it, and that the PR description states where each value lives (Vercel project, Neon, local).
   - The diff changes the Neon schema or Blob storage paths: confirm that the PR description states the migration step.
   - The diff changes rendered UI in `apps/web`: run `web-design-guidelines` over the changed files. Report accessibility failures as blocking and stylistic notes as suggestions.
   - The diff touches `apps/mobile`: apply the Expo rules in AGENTS.md. A dependency needs `npx expo install` and `npx expo-doctor`. A change to `app.json` must not commit `ios/` or `android/`. A changed `Pressable`, `TouchableOpacity`, `Button`, or icon needs an `accessibilityLabel`, an `accessibilityRole`, and a 44 by 44 point touch target.
5. **Tests.** Run `pnpm nx test api` once, after the fixes from steps 2 to 4. `web` has no test target. When the diff touches `apps/mobile`, run `npm run e2e` from `apps/mobile`, and use the `run-android` skill to start the emulator and Metro.

## Report format

End with one readiness report:

- **Blocking**: rule violations, correctness bugs, a red gate, or red tests. Each entry names the rule or the bug, the `file:line`, and the smallest fix.
- **Suggestions**: non-blocking improvements.
- **Verdict**: `READY` only when Blocking is empty and the gate is green. Otherwise `NOT READY`.

Report what changed the outcome, not the work done. A clean Small run is one line: the tier, the green gate, and the verdict.

When the user asked for readiness and not only a report, fix the blocking findings. Then run again only the affected steps.

## Don'ts

- Do not restate a rule in the report. Name the AGENTS.md section and show the evidence.
- Do not skip the mechanical gate because the branch looks clean.
- Do not run the Standard or Deep ladder on a Small diff.

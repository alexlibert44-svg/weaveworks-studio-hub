<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Palette lives in semantic `src/styles.css` tokens (purple, light blue, white, neutral, error red); never green/yellow.
- `device_id` columns hold `auth.uid()::text`; RLS checks it. Why: reuse queries without renames.
- Schedules are written only by `complete_review_session` (adaptive: accuracy + timing); triggers block client writes. Why: deterministic, never AI.
- Avatars: private `avatars` bucket at `<uid>/...`, signed URLs. Why: public buckets blocked.
- SignatureFrame on Home/Review/Profile; shared LanguageSelector (body portal, own scroll) on Home/Settings.
- Scope sets/reviews/stats/streaks by `target_language`. Why: languages stay isolated.
- Learning-data rules: see `src/lib/verba/AGENTS.md`.
- Freemium: `src/lib/verba/plan.ts` is the single entitlement source; `PREMIUM_ENABLED=false` disables all gates, limits and Premium UI during testing. Premium gates use `usePlan` + `PremiumGate`. Why: real billing/server enforcement plugs in there later.
- Completed training sessions retain their points when a word set is deleted; the session foreign key uses `ON DELETE SET NULL`. Why: earned totals are permanent history.

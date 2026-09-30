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

- Original-word mastery is derived from `practice_attempts` history (5+ correct, latest 5 correct, across 3+ sessions per skill); session ids are tagged into `response` as `[s:<id>]` because the external database schema can't be migrated from here.
- Keep LingoFlow's visual palette in semantic `src/styles.css` tokens (purple, light blue, white, neutral, error red); shared components inherit these tokens so no success or warning state reintroduces green or yellow.
- Accounts: learner rows keep the `device_id` column but it holds `auth.uid()::text`; RLS checks that. Why: reuse existing queries without a column rename.
- Word Set review schedules are written only by the `complete_review_session` database function (triggers block client writes). Why: extra practice can never move a schedule.
- Review scheduling is adaptive and computed only in `complete_review_session` from the session's real answers (accuracy ≥85% strong, ≥60% moderate, else poor) plus timing (on time / late / long delay); results are stored on `review_sessions`. Why: deterministic, persisted, never AI-chosen.
- Meaning multiple-choice distractors come from `getMeaningQuestion` (AI, validated: 3 unique non-matching options, retried up to 3 times); the correct answer is always the saved meaning. Why: works for single-word sessions without fake options.

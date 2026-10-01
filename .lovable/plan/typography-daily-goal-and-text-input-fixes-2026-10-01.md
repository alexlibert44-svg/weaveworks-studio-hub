# Typography, daily goal, and text input fixes

## Changes
- Improve the shared font stack and global text rendering for Latin, Arabic, and other scripts while preserving the existing visual identity.
- Clamp the Home daily-goal count and percentage to the configured target, while leaving stored practice time unchanged.
- Clean the shared exercise textarea styling by removing resize handles and browser appearance artifacts, with a single smooth semantic border and focus state.

## Verification
- Check the updated Home goal display and exercise textarea at the current mobile viewport.
- Confirm the preview build remains error-free.

## Technical details
- Keep changes limited to shared styles, the shared Textarea control, and Home display formatting.
- Do not change persistence, training scoring, or language-specific data.

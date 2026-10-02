# Localized country names in language selection

## Changes
- Add a single language-to-country mapping beside the existing language catalogue.
- Format country names with the platform’s standardized `Intl.DisplayNames` data using the current app/native locale.
- Show those localized country names in the shared dropdown and onboarding language options while keeping each language code and flag association unchanged.
- Preserve search by matching localized country names as well as the existing native and English language names.

## Validation
- Check Arabic, French, and English naming for representative countries.
- Confirm changing the target language does not control label localization.
- Confirm the project builds cleanly and no saved language values are changed.

## Technical details
- No database, authentication, learning logic, or preference changes.
- Unsupported interface languages continue using the app’s existing English UI fallback.

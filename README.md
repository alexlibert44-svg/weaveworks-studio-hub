# Word Weave

Build a modern mobile-first language learning application called [APP NAME].

The core concept is:

The user enters 4 or more words that they want to learn. The application stores those words inside a personal Word Set created by the user. The AI then transforms those words into natural sentences and interactive learning exercises.

The application is NOT a traditional flashcard app. The main learning philosophy is:

Word → Sentence → Listening → Reading → Writing → Speaking → Recall → Context Variations → Tenses/Forms → Spaced Repetition → Mastery

The user should learn how to actually use the words inside sentences, not simply memorize translations.

1. GENERAL DESIGN

Create a polished, premium, modern mobile UI.

Design principles:

Mobile-first.

Clean and minimal.

Rounded cards.

Smooth transitions.

Soft modern gradients.

Excellent typography.

Clear visual hierarchy.

Large touch-friendly buttons.

Avoid overcrowding.

Use subtle animations where appropriate.

The interface should feel like a serious language-learning product, not a generic AI dashboard.

The design should be inspired by modern language-learning apps, but DO NOT copy Duolingo's branding, characters, illustrations, colors, or exact UI.

Use a consistent visual system throughout the application.

2. BOTTOM NAVIGATION

The main application must use a persistent bottom navigation bar with exactly five sections:

Home

My Sets

Add

Review

Profile

Use recognizable icons and labels.

The bottom navigation should remain visible on the main application screens unless it would interfere with an active learning exercise.

3. HOME SCREEN

Create a dashboard that immediately answers:

"What should I do today?"

Top section:

Greeting

User's daily learning progress

Current streak

Example:

"Good afternoon 👋"

"Ready to practice?"

Then create a prominent progress card:

Today's Progress

Example:

8 / 15 minutes

Progress bar.

Show:

Daily goal

Current streak

Learning progress

Then create:

Today's Review

Example:

12 items ready

Breakdown:

4 words

3 sentences

2 writing exercises

3 speaking exercises

Primary CTA:

Start Review →

Then create:

Continue Learning

Show the most recently active Word Set.

Example:

Personal Growth

5 words

72% mastery

3 items due

CTA:

Continue →

Then show a small section:

Your Word Sets

Display 2–3 recent sets.

4. MY SETS SCREEN

This is the user's personal vocabulary library.

Title:

My Word Sets

Primary button:

+ Create New Set

Display Word Sets as modern cards.

Each card should show:

User-created set name

Number of words

Mastery percentage

Items due for review

Last practiced

Progress indicator

Example:

Personal Growth

5 words

72% Mastery

3 reviews due

Last practiced: Today

Another example:

Travel

8 words

45% Mastery

6 reviews due

Last practiced: 2 days ago

The user can:

Open a set

Start practicing it

View its words

See its progress

Rename the set

Delete the set

Do NOT organize the user's words into automatic sets.

The user's Set is the main container.

AI-generated categories/tags can exist as metadata later, but they must not move words away from the user's chosen Set.

5. CREATE NEW SET

When the user presses the Add button, open:

Create a New Word Set

Fields:

Set name

Example:

"Personal Growth"

Then:

Add your words

Allow the user to enter multiple words.

Example:

improve achieve effort discipline consistent

Minimum requirement:

4 words

Show a counter:

5 / 4 minimum

Allow:

Add word

Remove word

Edit word

Primary button:

Create Set

Do not allow creation with fewer than 4 words.

After creation, show a preparation/loading state:

"Preparing your learning experience..."

This will later connect to the AI generation system.

For this first MVP, create the data structure and UI so that AI generation can be connected later.

6. WORD SET DETAIL SCREEN

When the user opens a Set:

Header:

Personal Growth

Show:

5 Words

72% Mastery

Progress bar.

Then:

Your Words

Each word should have a simple mastery indicator:

improve — Strong achieve — Learning effort — Strong discipline — Needs Practice consistent — Learning

Use clear but subtle status indicators.

Primary button:

Practice This Set

Secondary action:

View Words

Also show:

3 reviews due today

The user should understand immediately that the Set is the main learning container.

7. WORD DETAIL

When the user opens an individual word, display:

Example:

improve

Meaning:

"to become better"

Pronunciation:

/ɪmˈpruːv/

Example sentence:

"I want to improve my English."

Mastery:

82%

Breakdown:

Writing: 90% Speaking: 74% Recall: 81%

Primary button:

Practice Word

This screen should be simple and informative.

8. LEARNING SESSION

When the user starts a Set, enter a focused learning experience.

Temporarily hide the bottom navigation during active exercises.

At the top:

Set name

Progress:

3 / 10

Progress bar

Each exercise should focus on one learning objective.

9. WORD LEARNING

Example:

improve

Meaning:

"to become better"

Audio button:

🔊 Listen

Example:

"I want to improve my English."

Buttons:

Listen

Continue

The goal is to introduce the word through meaning, pronunciation, and context.

10. WRITING EXERCISE

Example:

"I want to ___ my English."

Input field.

Button:

Check

Correct answer:

"improve"

If correct:

Show a positive confirmation and allow:

Continue →

If incorrect:

Show:

"Try again"

Do NOT immediately move to the next exercise.

The user should be allowed/required to retry the target until the required answer is achieved.

Record the mistake for the future spaced-repetition system.

11. SPEAKING EXERCISE

Display:

Say the sentence

"I want to improve my English."

Audio button:

Listen

Large microphone button:

Hold to Speak

After recording, show a simple pronunciation result.

Examples:

"Good pronunciation"

or:

"Try again"

If the pronunciation is below the required threshold, allow another attempt.

Do not require perfect native pronunciation.

Store pronunciation performance for future review.

12. SENTENCE RECALL

After the user has practiced the word and sentence, reduce the amount of assistance.

Example:

Show the meaning:

"I want to make my English better."

Ask:

Say it in English

Allow:

Writing answer

Speaking answer

The purpose is active recall.

13. SENTENCE VARIATIONS

The system should later generate different natural sentences using the same target word.

Example:

"I want to improve my English."

Then later:

"She wants to improve her writing."

Then:

"Practice can help you improve quickly."

The goal is to prevent the user from memorizing only one fixed sentence.

This should be designed into the data model even if advanced AI generation is implemented later.

14. TENSES AND WORD FORMS

Do NOT teach all tenses at once.

After the user has sufficiently mastered a word/sentence, the system should introduce relevant forms gradually over multiple days.

Example:

Day 1:

"I go to work every day."

Later:

"I went to work yesterday."

Later:

"I will go to work tomorrow."

Later:

"I am going to work now."

Later:

"I have gone to work already."

The system should track forms separately.

For example:

go:

Present — strong Past — weak Future — strong Recall — medium

This will later allow spaced repetition to target the weak form instead of repeating everything.

For nouns/adjectives or words without meaningful tense variation, do not force irrelevant tense exercises.

15. REVIEW SCREEN

Create a dedicated Review section.

Title:

Review

Example:

12 items ready

Show:

Words

Sentences

Writing

Speaking

Recall

Forms/Tenses

Primary CTA:

Start Review

The review engine should eventually choose exercises based on the user's previous performance.

For example:

If the user knows the meaning of "achieve" very well but repeatedly misspells it, prioritize writing.

If pronunciation is weak, prioritize speaking.

If Past tense is weak, prioritize Past tense exercises.

16. SPACED REPETITION DATA MODEL

Prepare the application architecture for spaced repetition.

Each learning item should be able to store:

Word

Sentence

Skill

Tense/form

Mastery score

Number of attempts

Number of mistakes

Last reviewed

Next review

Difficulty

User performance

Skills can include:

Recognition

Listening

Reading

Writing

Speaking

Recall

Sentence usage

Tense/form

Do NOT implement fake spaced repetition using random intervals.

The architecture should allow a real spaced-repetition algorithm to be connected.

17. MASTERY SYSTEM

Each word and learning item should have a mastery state.

Example:

New Learning Familiar Strong Mastered

Mastery should eventually depend on repeated successful performance over time, not one correct answer.

The UI should visually communicate mastery without overwhelming the user.

18. PROFILE SCREEN

Create:

Profile

Show:

Overall progress

Words learned

Sentences practiced

Speaking practice

Writing practice

Current streak

Longest streak

Daily goal

Achievements

Then:

Settings

Include:

Learning language

Native language

Daily goal

Notifications

Audio settings

Account settings

19. IMPORTANT UX RULE

The user should always know what to do next.

During an exercise, prioritize one main action.

Examples:

Writing:

Check

Speaking:

Hold to Speak

Learning:

Continue

Set:

Practice This Set

Review:

Start Review

Avoid multiple competing primary buttons.

20. DATA STRUCTURE

Create a clean architecture for:

Users WordSets Words Sentences LearningItems PracticeAttempts Mastery Reviews TenseForms Progress DailyGoals

Relationships:

User → WordSets → Words → Sentences → LearningItems → Attempts → Mastery → Reviews

A Word belongs to a user's Word Set.

A Word can have multiple sentences.

A Word can have multiple forms/tenses when relevant.

A learning item can track a specific skill or form independently.

21. MVP PRIORITY

Do not try to implement everything at once.

For the first functional version, prioritize:

Bottom navigation

Home

My Sets

Create Set

Add 4+ words

Save Sets and Words in the database

Set Detail

Word Detail

Basic Learning Session

Writing exercise

Retry on incorrect writing

Basic speaking UI structure

Review screen

Progress tracking

Build the architecture so AI generation, real speech recognition, pronunciation assessment, advanced tense progression, and real spaced repetition can be added without rebuilding the application.

22. CRITICAL REQUIREMENT

This must be a functional MVP, not just a visual prototype.

Buttons must perform real actions.

Creating a Set must actually save it.

Adding words must actually save them.

Opening a Set must display its real saved words.

Progress must come from real user actions.

Writing answers must actually be evaluated against the target answer.

Attempts and mistakes must be stored.

Do not create fake hard-coded progress that always shows the same numbers.

Use realistic seed/demo data only where necessary, and clearly separate demo data from user-generated data.

Build the application incrementally and keep the code modular so that the learning engine can be expanded later.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/11821c34-f666-419a-b2d8-2070a210f8ed).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

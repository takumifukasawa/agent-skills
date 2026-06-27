---
name: hello
description: A minimal sample skill for verifying how skills work. Use this when the user says "try the hello skill", "check that skills work", or "run the sample skill".
---

# hello — Minimal Sample Skill

A minimal skill that exists only to demonstrate how a skill gets loaded and executed.

## What to do when this skill is invoked

1. Show the following line to the user verbatim:
   > 🎉 The hello skill was loaded. The body of SKILL.md is now running.
2. Then explain in 1-2 lines what just happened:
   - Claude selected this skill by reading its `description`.
   - Only after being selected was this body (`SKILL.md`) loaded.
3. Suggest: "Next, you can use `skill-creator` to build your own skill."

## Notes (how it works)

- Only the `name` and `description` in the frontmatter are scanned at all times. The body is read only when the skill triggers.
- That is why the body and any bundled files can be long. Write the `description` to be specific about *when* to use the skill — vague descriptions cause misfires or missed triggers.

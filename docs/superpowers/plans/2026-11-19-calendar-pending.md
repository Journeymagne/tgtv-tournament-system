# Calendar pending conditions implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish the supplied 34 organization announcements without inventing fees or capacity.
**Architecture:** Use existing nullable calendar columns and pending labels. Permit NULL for manually entered fees/capacities while preserving numeric validation, scoped access, and the distinction between unknown and zero.
**Tech Stack:** Node.js, PostgreSQL, existing calendar UI Kit.
**Spec:** User request in this chat, including the instruction to create “Уточняется” and deploy to production.

## Global constraints

- Preserve dates, names, creator IDs and provider ownership from the supplied schedule.
- Keep unknown fee/capacity NULL; zero fee means free. Do not fabricate times.
- Moscow for Nebello/ImGefest; Saint Petersburg for Beer Brothers/Engage Zone.
- Beer Brothers venue: Анклав. Verify supplied Moscow venue addresses.
- Keep two-day events as one announcement, including their complete range in the title.

## Decisions

- Extend the existing pending representation instead of storing fake numbers or textual values in numeric columns.
- Organization logos are temporary initials pending real assets; unknown venues are explicitly “Уточняется”.
- Calendar announcements retain the existing solo default for APEX and Engage Zone; this assumption must be disclosed if not clarified.

## Review focus

- Clearing a known fee or capacity must persist NULL through subsequent edits.
- Zero fee must remain zero and render free.
- Invalid booleans, negative values, unsafe integers and oversized manual capacities must still reject.
- Converting an unknown capacity to a tournament must preserve a NULL registration limit.
- Fresh and upgraded databases must apply the same constraints; provider access must remain scoped.

## Tasks

- [ ] Add failing unit tests for pending numeric values, zero fee, and conversion; add API persistence coverage.
- [ ] Update normalization, nullable constraints in migration 119, form placeholders/defaults and bilingual pending copy.
- [ ] Run focused tests, inspect the form in a browser, and review the final diff.
- [ ] Publish patch 1.7.1 through the existing release workflow and verify production assets/API.
- [ ] Import four providers and 34 announcements transactionally with duplicate guards, correct creators, memberships and audit records; grant organizer capability only to user 169.
- [ ] Verify production public profiles and every imported event against the manifest.

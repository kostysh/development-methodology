# AGENTS.md — template for one documentation area

Place in a documentation area such as `docs/product/`, `docs/architecture/`,
`docs/delivery/`, `docs/specifications/`, or `docs/validation/` only when the
area has rules that differ from or add to the root instructions. Do not copy
general rules here. This template is not active until adopted.

```markdown
# AGENTS.md

This directory inherits the root `AGENTS.md`. Canonical artifact rules:
`{{METHOD_PATH}}/method/13-artifacts-and-communication.md` and the profile
section "Documentation and artifacts".

## What lives here

- Artifact classes and ID prefixes: {{CLASSES_AND_PREFIXES}}
- Skill that owns the content structure: {{SKILL_OR_REPLACEMENT}}
- Who accepts documents in this area: {{ACCEPTING_OWNER}}
- Language of project prose: {{LANGUAGE}}

## Local rules

- {{AREA_SPECIFIC_RULE_OR_NONE}}

## Before writing

1. Confirm a persistent artifact is needed; otherwise record the result in the
   task, PR, or handoff.
2. Take the next free ID for the prefix and add the metadata block.
3. Link sources and related artifact IDs.
4. Update the module index when the artifact belongs to a module.
5. Leave the status as `draft`; acceptance is the owner's decision.
```

Typical local rules: the primary-materials area forbids rewriting originals;
the product area requires separating observable capability from supporting
infrastructure; the validation area requires an independent review before a
retrospective claims completeness.

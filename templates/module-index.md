# Module index — fillable form

Rule: [module index](../method/13-artifacts-and-communication.md#module-index).
The file is placed at `docs/modules/<MOD-ID>-<slug>/README.md` or according
to the profile. The index only links to canonical documents; requirements,
decisions, and tasks are not copied into it. Delete the empty lines of
sections the module does not have yet.

```markdown
---
id: {{MOD_ID}}
title: {{MODULE_TITLE}}
artifact_type: module-index
status: accepted
owner: {{OWNER}}
created: {{DATE}}
updated: {{DATE}}
---

# {{MOD_ID}} {{MODULE_TITLE}}

## Scope

- Purpose of the module and its users: {{PURPOSE}}
- Primary materials: {{BASELINE_LOCATORS}}
- Current state: {{STATE_AND_DATE}}
- What the module does not do yet: {{NOT_YET_DELIVERED}}

## Canonical artifacts

- Product: {{PB_PRD_LINKS}}
- Architecture: {{ARCH_DELTA_PD_ADR_LINKS}}
- Delivery: {{DP_MDP_LINKS}}
- Specifications: {{SPEC_LINKS}}
- Design: {{DESIGN_LINKS}}
- Validation: {{VAL_LINKS}}
- Living documentation: {{README_RUNBOOK_API_LINKS}}

## Superseded artifacts

- {{OLD_ID}} → {{NEW_ID}}: {{REASON}}
```

The index is updated by whoever creates, accepts, or replaces an artifact of
the module. A link to a `draft` is marked with its status so that a reader
does not take it for a current source.

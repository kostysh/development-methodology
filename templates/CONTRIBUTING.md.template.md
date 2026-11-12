# CONTRIBUTING — entry-point template

After adoption, this file holds the verified rules of the adopting repository.
Replace the placeholders and reconcile the content with the existing file.

## Owners

- Methodology: `{{METHOD_PATH}}/README.md`.
- Profile, languages, permissions, and mandatory checks:
  `{{METHOD_PATH}}/PROJECT-PROFILE.md`.
- Local component rules: `{{PACKAGE_RULES_PATH}}`.
- License constraints and permitted dependencies: `{{LICENSE_POLICY}}`.

## Working environment

| Precondition | Verified value / source |
| --- | --- |
| Runtime, package manager, toolchain | `{{TOOLCHAIN}}` |
| Reproducible installation | `{{INSTALL_PROCEDURE}}` |
| Isolation, start, stop, and readback | `{{LOCAL_ENVIRONMENT_PROCEDURE}}` |
| Handling config/secrets without values in Git | `{{ENVIRONMENT_CONTRACT}}` |

Do not run a placeholder as a command. A missing tool is marked as a gap, not
replaced with an invented script.

## Git and integration

- Base and branches: `{{BRANCH_POLICY}}`.
- Task isolation and naming: `{{WORKTREE_BRANCH_POLICY}}`.
- Commit convention and task trace: `{{COMMIT_POLICY}}`.
- PR/MR, approvals, and live checks: `{{REVIEW_PROTECTION_POLICY}}`.
- Merge method and confirmation of the final state: `{{INTEGRATION_PROCEDURE}}`.
- Cleanup and synchronization: `{{CLEANUP_PROCEDURE}}`.

The process semantics belong to `{{METHOD_PATH}}/method/07-integration.md`.
Having a credential does not authorize a bypass. Other people's changes are
preserved.

## Mandatory checks

The profile lists the real commands, their scope, environment, order,
terminal success, and evidence. A short run list with a link to that owner is
acceptable here, without a second version of the requirements.

- Local: `{{LOCAL_GATES}}`.
- CI: `{{CI_GATES_OR_EXPLICIT_ABSENCE}}`.
- Target environment, where applicable: `{{TARGET_ACCEPTANCE}}`.

Dependencies and new tools go through a decision according to
`{{METHOD_PATH}}/method/05-implementation.md`. Checks do not create
permission to deploy, change credentials, or communicate externally.

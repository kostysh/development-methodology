# Verification, acceptance, and review

A check is chosen according to the claimed result and the risk. First use an
existing test that will detect the defect or regression. Add a test for a
specific gap, not to literally restate a small implementation. Mandatory
checks are defined by the profile and by the owners of the changed areas.

## Steps

1. Before code, for each acceptance criterion name the check, the environment,
   and the observation. For high-risk work, define the negative scenarios and
   show the sensitivity of at least one test.
2. Run the fast checks of the affected parts: format, lint, types, build, tests.
3. Do the self-check.
4. Submit the stable version for review on the subjects the risk requires.
5. After PASS, run the expensive checks once on the same version.
6. Record the results with revision and locator. A red or unknown mandatory
   result blocks the transition.
7. For the target environment, reconcile the deployed revision, run the matrix
   in full, and fix the findings in one batch.

## Limits of evidence

| Evidence | What it confirms | What it does not confirm by itself |
| --- | --- | --- |
| Source inspection, types, lint, build | The checked property of the sources or the build | Runtime and the useful user path |
| Unit/component with doubles | Behavior of an isolated part | The real DB, provider, and working together |
| Real integration | The verified path through the participating boundaries | The rest of the scenario and another environment |
| Browser with API interception | The UI given the specified responses | Real persistence and external effects |
| Browser with the real stack | The executed scenario and the state read back | Another role, record, revision, or unknown branches |
| CI | Specific checks of a specific candidate | A successful deploy and user acceptance |
| Deploy/readback | The actual publication of the verified revision | The whole product without a scenario check |
| Document review | Agreement with sources and purpose within the stated scope | That code works or that the methodology is effective |

For each acceptance criterion record the check, environment, revision,
result, and locator. The full set (criterion, falsifier, actor, entry state,
actions, expected outcome) is needed for high-risk work and end-to-end
acceptance. If this information is already captured in an automated test, a
separate record is not needed. `not_run`, `unknown`, `failed`, `blocked` do
not turn into `passed`. Stubs and synthetic inputs are marked explicitly. A
fixture may prepare the start of an agreed test, but must not perform the
transition under test instead of the system.

## End-to-end and negative acceptance

Verify the same object and its stable keys through all the promised
boundaries. After a change, perform an authoritative reload. For a role
switch, create an independent session if that is exactly what is being
verified; a hidden role substitution is not acceptable. The matrix includes
the necessary entity types, creation methods, and roles.

For high-risk work, define six scenarios before production coding:

1. One object through the whole path.
2. An independent session.
3. A losing concurrent request.
4. A stale cache or context.
5. A lost response after commit, or a lost readback.
6. A deliberate error or substituted evidence.

Each receives `applicable` with a precondition, forbidden outcome, failure
signal, environment, and owner, or `not_applicable` with a basis. Before
implementation, at least one applicable test must show sensitivity: an
introduced violation yields the expected failing result for the right reason.
A matrix produced after implementation does not close this preliminary gate
retroactively.

Use the existing test runtime. Do not add a separate harness just for the
sake of the form of the check. If the existing means are insufficient, name
the gap and obtain the required decision about the new boundary.

## Run composition

A targeted run is useful for diagnosis. It does not replace the full affected
bundle when that bundle is mandatory. New permanent tests are included in the
canonical commands, not left in a separate task-only alias.

A one-off check of a completed transition is stored with the delivery.
Permanent CI includes the invariants and behavior that will remain supported.
If an old state is no longer supported, do not run its one-off acceptance in
every future release without another reason.

After the last edit, confirm the terminal results of the checks affected by
that edit. For an unaffected check, name the basis for carrying over the
earlier result: what changed and why the check does not depend on it. Without
a basis the check is repeated. A changed assertion must actually run on the
final candidate. One stable set is enough; a repeat is needed on a delta, a
failure, a new falsifier, an unverified risk, or a mandatory requirement.
Name the reason.

A red, missing, or unknown mandatory result blocks the transition that
depends on it. Another green test, a review PASS, or a residual-risk record
does not cancel the gate. Changing the gate requires a decision of the rule
owner; the executor does not replace a mandatory result with weaker evidence.

## Self-check and independent review

The author checks the sources, acceptance, scope, error paths, side effects,
compatibility, the necessary documents, [living documentation](13-artifacts-and-communication.md#living-documentation),
and the reliability of the evidence. Handing over a result known to be
unverified while counting on the auditor is not acceptable.

Formal review starts on a stable scope after the self-check and the fast
checks: format, lint, types, build, tests of the affected parts. Expensive
runs (the full end-to-end suite, a migration rehearsal, target environment
acceptance) are run once, after PASS, on the same version. If an expensive run
required an edit, review is repeated only for the delta. Which checks count as
expensive is defined by the profile. An exploratory review may happen earlier
but does not give a final PASS. The package names the commit/diff, files,
sources, criteria, results, and limitations.

Choose separate subjects by risk: conformance to requirements, code,
architecture, security/privacy, data/migration, UI/accessibility, and
operations. In high-risk work, do not collapse independent mandatory subjects
into one indistinguishable verdict. Low risk does not automatically require a
formal audit; a change to authority or acceptance rules may require one
regardless of size.

A finding names the locator, the violated contract, the impact, the evidence,
and the required fix. The first FAIL must contain the whole material set
discovered. The report format is in the
[review template](../templates/review-and-retrospective.md).

A material edit after PASS makes the affected evidence stale. Re-review is
limited to the delta and its direct consequences if the original coverage was
sufficient; otherwise the missing area is reviewed as well. A change of
auditor does not cancel findings. The procedure for repeated FAILs is in
[diagnostics](14-learning-and-recovery.md).

## Target environment acceptance

Before running, check the preconditions and the actually deployed revision.
An old deploy or a lagging checkout is first treated as an environment
mismatch, not as proof of a defect in the current candidate.

Run all safe rows of the agreed matrix on one state, collect the findings,
then make a related batch of fixes. Do not start a new release after the
first ordinary defect. On a threat to security, corruption, or the
reliability of further evidence, stop the affected scenario immediately.
After the fix, repeat the exact falsifiers and the necessary regression;
confirm cleanup.

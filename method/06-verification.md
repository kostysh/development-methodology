# Verification, acceptance, and review

A check is chosen according to the claimed result and the risk. First use an
existing test that will detect the defect or regression. Add a test for a
specific gap, not to literally restate a small implementation. Mandatory
checks are defined by the profile and by the owners of the changed areas.

## Steps

1. Before code, for each acceptance criterion name the check, the environment,
   and the observation. For high-risk work, define the negative scenarios and
   show the sensitivity of at least one test. Prepare the
   [protected test baseline](#protected-test-baseline) when it applies.
2. Run the fast checks of the affected parts: format, lint, types, build, tests.
3. Do the self-check.
4. Submit the stable version for review on the subjects the risk requires.
5. [Resolve review findings](#closing-review-findings) in one batch. After
   review passes, run the expensive checks once on the same stable candidate.
   With the merge train enabled, keep the per-task gates and run the expensive
   suite [on the train](#verification-for-a-merge-train).
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

## Protected test baseline

Assign a separate agent to author the tests from the accepted specification
alone. Provide the means to run the tests against the pre-change system and
keep the implementation design and work out of the author's context. Trace
each assertion to an acceptance criterion and its source or owner decision.
Refer unsupported conditions to the specification owner before freezing them.

Exercise the public API, data contract, or user path using the exact
operation and transport in the criterion. Run each new baseline test before
implementation and record its failure for the intended reason. If the entry
is missing, record the observation at the required boundary as evidence of
absence. Record assertions that the missing entry prevents as unevaluated.
If the intended failure cannot be observed, take the gap to the specification
owner before freezing the affected tests.

The test owner freezes the tests and the inputs that determine what runs and
what passes. Record them in a hash manifest at the accepted baseline commit.
Use a local hook to reject direct edits to protected paths and required CI
to verify the exact candidate against the trusted baseline. See the
[default procedure](../defaults/controls.md#protect-a-test-baseline).

Keep the protected inputs intact. Add implementation tests outside the
protected paths and include them in the applicable canonical runs. If such a
test supplies evidence of a race, retry, or change of rights, show that it
distinguishes the outcomes on an earlier snapshot or under a controlled
violation.

If an assertion is disputed, record the test, specification clause, and
conflict. Mark it disputed and continue work that does not depend on it.
Resolve the open disputes together at the next checkpoint. The specification
owner resolves contradictions in the specification. The test author corrects
a faulty test against a clear specification. Update the trusted inputs only
after the owners accept the replacement baseline with its pre-change evidence.

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

## Verification for a merge train

For admission, require passing format, lint, types, build, package tests,
affected end-to-end scenarios, and the applicable task baseline tests on the
current PR head. Require clean migration replay when a PR changes migrations.
Close the applicable audit and publish its passing verdict as a status on
that same head. The [train](07-integration.md#merge-train) runs the full
expensive suite from the profile on the combined candidate. Serialize
checks that share a mutable resource or give them isolated environments.

1. Run the full suite on `C0`. Allow one infrastructure retry per train.
   A second infrastructure failure stops integration and adds an environment
   action to the report.
2. Rerun only the failed tests on the same `C0`. If they pass, accept `C0`
   under the flaky-test rule and record a defect with an owner. A recurrence
   of the same flaky test within the profile's recurrence window makes the
   defect blocking and holds integration.
3. For a reproducible failure, rerun only the failed tests on ordered
   prefixes of the queue. Attribute failure to the PR added at the first
   failing prefix after a passing prefix or base. If two PRs fail only
   together, exclude the later one. If the base also fails or no exclusion
   is established by tests, hold integration for diagnosis.
4. Rebuild as `C1` from the same base without the excluded PR and its
   dependants. Give it the second and final full suite run if the budget
   permits. A failing `C1` stops integration.

Retry an interrupted operation on the same candidate. Count a full-suite
retry against the full-run budget. Record each actual attempt. Hold
integration if the remaining budget cannot verify the required candidate.

Use the flaky-test rule only for this train suite. A failed mandatory build
or test of the package that supplies the train still holds tool delivery.

## Self-check and independent review

The author checks the sources, acceptance, scope, error paths, side effects,
compatibility, the necessary documents, [living documentation](13-artifacts-and-communication.md#living-documentation),
and the reliability of the evidence. Handing over a result known to be
unverified while counting on the auditor is not acceptable.

Formal review starts on a stable scope after the self-check and the fast
checks: format, lint, types, build, tests of the affected parts. An exploratory
review may happen earlier but does not give a final PASS. The package names
the commit/diff, files, sources, criteria, results, and limitations.

Choose separate subjects by risk: conformance to requirements, code,
architecture, security/privacy, data/migration, UI/accessibility, and
operations. In high-risk work, do not collapse independent mandatory subjects
into one indistinguishable verdict. Low risk does not automatically require a
formal audit; a change to authority or acceptance rules may require one
regardless of size.

After rollout, use the protected tests that ran and passed on the candidate
to establish their verified coverage. Focus the specification-conformance
audit on the behavior those tests leave uncovered. Keep the applicable domain
reviews.

A finding names the locator, the violated contract, the impact, the evidence,
and the required fix or disposition. The first FAIL must contain the whole
material set discovered. The report format is in the
[review template](../templates/review-and-retrospective.md).

## Closing review findings

Assign each finding one type in the existing report. Refer findings outside
the task to their owner first. For an in-scope finding, determine whether it
blocks acceptance, then choose the closure evidence for a blocker.

- **(a) Deterministically verifiable.** A test can prove the correction of a
  defect, missing check, or weak test.
- **(b) Requires judgment.** Closing it requires assessing the structure,
  architecture, algorithm, or a document edit that changes meaning.
- **(c) Non-blocking.** Record the finding and any disposition. The current
  review can pass with this finding open.
- **(d) Outside the task.** Refer the finding to its owner for separate
  disposition.

Fix all in-scope blocking findings in one batch. Run fast checks on the
affected parts and submit the stable batch for the applicable closure checks:

- For **(a)**, show that the same test fails for the violated contract on the
  earlier snapshot and passes on the fixed snapshot. Exercise the operation
  and transport required by the contract. With that evidence, close the
  finding on the fixed snapshot without another audit of the finding. If
  the test is unavailable or its evidence falls short, keep the finding
  open and retain the applicable review obligation. For security, money,
  permissions, and migrations, a domain reviewer still checks the delta.
- For **(b)**, use one delta audit per applicable review subject for the
  batch. Verify the fixes and check for problems introduced by the delta.
  Provide the original findings, fix commits, delta diff, and check results.

Carry forward coverage of unchanged parts when the original review covered
them sufficiently. Review any missing area required by the original scope.

If the executor disagrees with a finding, record an objection with evidence
in the existing report and submit it to the applicable delta audit or the
operator for resolution. Keep the finding open until it has a disposition.
The [existing round limits](14-learning-and-recovery.md#repeated-review-fails)
still apply. A change of auditor does not cancel findings.

Preserve the prior audit for a document edit that keeps its meaning. For a
material edit after PASS, refresh the affected evidence and review the delta
and its direct consequences where review applies.

Run the profile's expensive checks once on the stable candidate after its
applicable reviews pass. If a check leads to a material edit, follow the
rules above for the delta and the [run composition rules](#run-composition)
for the changed candidate.

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

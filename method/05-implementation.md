# Implementation and contract discipline

Start implementation once the inputs are ready according to the
[lifecycle](02-lifecycle.md). The executor is responsible for their own result
until review. Automated tests and the operator do not replace the executor's
duty to read the sources and verify the work.

## Steps

1. Read the assignment, the accepted contract, and the affected code; make
   sure the inputs are ready.
2. Choose the most direct path with existing means.
3. Name the affected contracts and their consumers.
4. For a new dependency, first obtain a decision, then change the manifest.
5. Change only what is related to the assignment; record neighboring defects
   separately.
6. Update tests and living documentation.
7. Hand the result over for verification according to [chapter 06](06-verification.md).

## Minimal sufficient complexity

Prefer a local edit and an existing primitive if they fully meet the
requirement. Assess the number of concepts, states, owners, and failure modes,
not only lines of code. An already installed dependency does not necessarily
simplify the solution.

Do not add future extension points, generic platforms, duplicate state,
wrappers, or defensive branches without a current requirement or a protected
boundary. Do not weaken correctness, security, or compatibility for the sake
of simplicity.

Every changed area is tied to the assignment or to an invariant being
preserved. Do not include neighboring cleanup or refactoring unless the result
needs them. A neighboring defect that is found is recorded separately. Remove
only what has become obsolete because of the current change, within the
permitted boundary.

## Contracts and layers

Identify the owners of input, domain behavior, persistence, external adapters,
the public projection, and the composition root. Use the existing
architecture; this methodology does not prescribe a language, RPC, ORM,
framework, or number of layers.

- One contract defines the input/output shape; derived types/docs must not
  become competing sources.
- A shared contract for clients does not import the server runtime or secrets.
- Validation checks the boundary, domain rules check meaning, data controls
  check their own invariants. Success of one layer does not prove the
  protection of the others.
- Runtime configuration is checked before dependent services are created.
  A new parameter is reflected consistently in the schema, a safe example,
  deploy/preflight, documentation, and tests.
- An async side effect is bound to the lifecycle of the execution environment,
  has a wait limit and an error behavior; an unfinished promise does not mean
  delivery.

For an API or event, define a stable identity, schema/version, permissions,
errors, compatibility, cost limits, and consumers. Names denote the
resource/action, while access roles are set in the authorization policy. A
dedicated administration namespace is acceptable for an administrative
capability.

On a rename, check producers, consumers, docs, and tests. An old alias is
removed or kept only under an accepted compatibility policy with an owner and
a deadline. The shared prototype does not impose immediate removal of an
external contract.

For an update, list the editable, immutable, system, and separately managed
fields. Define the difference between a missing value, `null`, an empty patch,
and an explicit command. UI and API must use one accepted meaning; a silent
no-op must not look like a completed change unless the contract allows it.

Names of files, functions, and commands explain their purpose without the
tracker. Task numbers live in commits/issues/evidence and do not replace the
meaning of a production name. Migration versions are issued by the accepted
generator. Inherited names do not set a pattern for new ones and do not grant
the right to mass renaming.

## Dependencies and tools

A new direct dependency, or replacing an existing one, requires a decision
before the manifest, imports, install, or lockfile change. Present the exact
package/tool and version, the usage class, the problem, the option without a
new dependency, alternatives, compatibility, license, footprint, security
evidence, and a review condition. An existing direct permission for a specific
dependency remains in force.

The decision and the sufficient check are recorded with the architecture
owner. The transitive footprint is assessed as part of the direct dependency;
a separate ADR for each transitive package is not required. An ordinary
update in the same role follows the accepted version/security policy; a new
role or a material boundary requires revisiting the decision.

Current version, advisories, and compatibility are checked against current
primary sources. The maturity rule, pinning, and exceptions are set by the
project profile. Do not carry over another project's dates, versions, and
temporary exceptions.

Update the lockfile with the standard package manager. Verify a reproducible
install, the real dependency graph, and the affected checks. A scanner finding
is not suppressed for the sake of a green result; an exception has an exact
basis, owner, boundary, and deadline. An updated version does not count as a
fix without verifying the affected path. Do not mix unrelated security updates
into the current scope.

## Exact and monetary calculations — if applicable

The owner of the business rule sets the units, currency, scale, permitted
range, formula, rounding mode, and the point at which values are fixed. An
arithmetic library does not define tax, tariff, or accounting policy.

Use an exact representation that matches the accepted contract; verify
conversions, serialization, signs, boundaries, and conservation of sums. Do
not mix currencies/scales by default. Expected values must be independent of
the function under test. The same literal cases run in every layer for which
parity is claimed. A unit test of the library does not prove that it is wired
into the application or the database.

# Methodology tools

This private npm package contains executable checks for use with the
[methodology](../README.md). It builds TypeScript directly to JavaScript and
uses the lockfile for dependency resolution. The supported runtime is Node.js
24.12 or later in the 24.x series. The automated package and installed-command
checks run on Linux.

## Check Markdown links and anchors

From the repository root:

```sh
npm --prefix tools ci --ignore-scripts
npm --prefix tools run build
npm --prefix tools run check:links -- ..
```

The npm script runs inside `tools/`, so `..` selects the repository. The
installed `methodology-check-links [project-root]` command defaults to the
current directory when run directly. Pass the entire project root, including
unchanged Markdown sources, so a removed target or heading is detected
wherever it is referenced.

The guard checks local links and images in `.md` and `.markdown` files,
including reference links, repository-root links, encoded URLs, and directory
links. Markdown fragments target headings, HTML `id` attributes, or
`<a name="…">` anchors. Directory fragments use the Markdown README in the
target directory. GitHub-style heading numbering and percent-decoded
fragments are supported. Explicit anchors must be unique in their document and
distinct from generated heading anchors.

The guard skips external destinations, paths outside the selected root,
symbolic-link sources, and Git, worktree, dependency, and build directories.
It checks the existence of a non-Markdown target and leaves its fragment
semantics to the target format. The command reads files locally and writes
only to the terminal.

| Exit code | Result |
| --- | --- |
| `0` | Check passed. Standard output reports the number of Markdown files checked. |
| `1` | The project contains invalid links or anchors. Standard error gives the source path, line, and diagnostic. |
| `2` | Invalid arguments or an incomplete scan, including a root with no Markdown files. Standard error gives the reason. |

## Build and verify the package

Run from the repository root:

```sh
npm --prefix tools ci --ignore-scripts
npm --prefix tools run build
npm --prefix tools test
npm --prefix tools run test:packed
npm --prefix tools run check:links -- ..
```

`npm pack` runs the clean build and stages the current version. The packed
test inspects its contents, installs it in a temporary project with runtime
dependencies only, and tests the installed command from outside the source
checkout. Temporary files are removed after the test. The package manifest
owns the version, public command path, and distribution files.

## Install an accepted build

From the chosen repository revision, run `npm ci --ignore-scripts` and
`npm pack --json` inside `tools/`. Keep the tarball with its reported
integrity value. In the adopting project's tools package, install that saved
tarball using `npm install --save-dev /path/to/package.tgz` and retain the
lockfile. Run `npm exec --offline -- methodology-check-links --version` there
and verify a clean input and a known broken link with the installed command.
Record the version, integrity value and actual CI check in the project profile.
For an update, keep the previous verified archive until the new checks pass.
To recover, restore that archive and its lockfile, run `npm ci`, and repeat
the installed-command checks before relying on enforcement.

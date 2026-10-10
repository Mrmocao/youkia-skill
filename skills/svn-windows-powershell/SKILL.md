---
name: svn-windows-powershell
description: Safely operate Windows SVN 1.14.x working copies from PowerShell, including inspection, update, add/delete/move, conflict resolution, targeted commits, rollback, authentication troubleshooting, and repository connectivity diagnosis.
---

# SVN Windows PowerShell

Use this skill when the user asks to inspect, update, modify, resolve, commit, revert, or troubleshoot an Apache Subversion working copy on Windows PowerShell.

Read [references/svn-handbook.md](references/svn-handbook.md) for the complete command reference and the project's documented conventions. Use the section that matches the current operation instead of loading the whole handbook into the working context.

## Operating Rules

- Confirm the working-copy path and run `svn info` before changing files. If the path is not a working copy, stop and explain the checkout requirement.
- Start with `svn status` and, when useful, `svn diff`. Preserve unrelated local changes and do not use broad recursive commands when a targeted path is enough.
- For updates, prefer `svn update --accept postpone`. Do not silently overwrite local changes or resolve conflicts by choosing one side without explicit user direction.
- Treat `svn add` as registration for a later commit, not as Git staging. For moves and deletes, use `svn move` and `svn delete` so history and intent remain visible.
- Before committing, show or summarize the exact paths, inspect `svn diff`, run the relevant build or validation, and get confirmation immediately before the commit if the user has not explicitly authorized that commit.
- Commit explicit files or a deliberately reviewed directory, with a meaningful message. After success, record the returned revision and verify with `svn status` or `svn log -v -r REVISION`.
- Never expose passwords or place them in commands, scripts, commit messages, skill files, or chat. Prefer interactive authentication, `--no-auth-cache` for one-off checks, or a narrowly scoped `svn auth --remove` flow.
- Treat `svn revert`, `svn merge -c -REV`, lock operations, cleanup options that remove files, and force/whole-project operations as destructive. Back up needed uncommitted work and obtain explicit confirmation before executing them.

## Conflict and Failure Handling

- For text conflicts, inspect the markers, manually merge, remove all markers, validate, then use `svn resolve --accept working` on the specific path.
- For tree, property, or binary conflicts, inspect the structure and history first; there is no universal `mine`/`theirs` shortcut.
- Do not equate `cleanup` with releasing a repository lock. `svn cleanup` addresses local working-copy interruption; coordinate separately for a file lock held by another user.
- Diagnose authentication, permissions, network, certificate, working-copy format, and hook failures separately. Do not label every SVN error as a password problem.
- If a commit result is uncertain because of a timeout or disconnect, verify the repository log before retrying.

## Project-Specific Notes

- The reference handbook documents the project's compile-before-commit rules, generated Proto files, Unity synchronization scripts, and commands that must remain human-controlled. Follow those notes when the current working copy matches that project.
- `svn_update.bat` is a project synchronization/submission tool, not a substitute for ordinary `svn update`; do not execute it automatically.
- Do not manually edit generated PB outputs. Resolve source Proto conflicts, regenerate according to the project convention, inspect the result, and only then mark conflicts resolved.

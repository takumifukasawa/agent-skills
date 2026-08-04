#!/usr/bin/env pwsh
<#
Copies every skill in this repo into %USERPROFILE%\.claude\skills\ (or -Dest),
so they are available in all of your Claude Code sessions on this machine.

A "skill" is any directory containing a SKILL.md, at any depth (e.g.
meta/skill-creator/SKILL.md). Skills are installed FLAT into the destination
by their directory name -- categories are for organizing this repo, not part
of the installed name.

This is the Windows counterpart to install.sh. Unlike install.sh (which
symlinks, so edits in this repo show up immediately), this COPIES by default,
because creating symlinks on Windows normally needs Developer Mode enabled or
admin rights. That means: re-run this after `git pull` or after editing a
skill, not only after adding a new one.

Usage:
  ./install.ps1                       # copy into %USERPROFILE%\.claude\skills\
  ./install.ps1 -Dest 'C:\some\path'  # copy into a custom destination
  ./install.ps1 -Symlink              # attempt real symlinks instead of copies
                                       # (needs Developer Mode: Settings ->
                                       # Privacy & security -> For developers;
                                       # falls back to a copy with a warning
                                       # if symlink creation fails)
#>
param(
    [string]$Dest = (Join-Path $env:USERPROFILE ".claude\skills"),
    [switch]$Symlink
)

New-Item -ItemType Directory -Force -Path $Dest | Out-Null

$seen = @{}
$count = 0

Get-ChildItem -Path $PSScriptRoot -Recurse -Filter SKILL.md -File |
    Where-Object { $_.FullName -notmatch '[\\/]\.git[\\/]' -and $_.FullName -notmatch '[\\/]\.claude[\\/]' } |
    ForEach-Object {
        $skillDir = $_.Directory
        $name = $skillDir.Name

        if ($seen.ContainsKey($name)) {
            Write-Warning "duplicate skill name '$name' ($($skillDir.FullName)) -- skipped; rename one of them"
            return
        }
        $seen[$name] = $true

        $target = Join-Path $Dest $name
        if (Test-Path $target) {
            Remove-Item $target -Recurse -Force
        }

        if ($Symlink) {
            try {
                New-Item -ItemType SymbolicLink -Path $target -Target $skillDir.FullName -ErrorAction Stop | Out-Null
                Write-Host "linked: $name -> $($skillDir.FullName)"
            } catch {
                Write-Warning "symlink failed for '$name' ($($_.Exception.Message)) -- falling back to copy. Enable Developer Mode (Settings > Privacy & security > For developers) to allow symlinks."
                Copy-Item $skillDir.FullName $target -Recurse -Force
                Write-Host "copied: $name -> $($skillDir.FullName)"
            }
        } else {
            Copy-Item $skillDir.FullName $target -Recurse -Force
            Write-Host "copied: $name -> $($skillDir.FullName)"
        }
        $count++
    }

Write-Host "done. $count skill(s) installed into $Dest"
Write-Host "Start a new session (or /clear) for Claude Code to pick them up."

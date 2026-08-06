#!/usr/bin/env pwsh
<#
Copies every skill in this repo into %USERPROFILE%\.claude\skills\ (or one or
more -Dest paths), so they are available in all of your Claude Code sessions
on this machine.

A "skill" is any directory containing a SKILL.md, at any depth (e.g.
meta/skill-creator/SKILL.md). Skills are installed FLAT into the destination
by their directory name -- categories are for organizing this repo, not part
of the installed name.

This is the Windows counterpart to install.sh. It COPIES by default, so re-run
it after `git pull` or after editing a skill, not only after adding a new one.

Pass -Link to get install.sh's behaviour instead: each skill is linked, so
edits in this repo show up immediately and you only re-run when you ADD a
skill. Links are directory junctions, which -- unlike symlinks -- need neither
admin rights nor Developer Mode, and work across drives (repo on D:, skills on
C:). It falls back to a symlink and then to a copy if a junction can't be made.

Usage:
  ./install.ps1                              # copy into %USERPROFILE%\.claude\skills\
  ./install.ps1 -Dest 'C:\some\path'         # copy into a custom destination
  ./install.ps1 -Dest 'C:\one','C:\two'      # copy into multiple destinations
  ./install.ps1 -Link                        # link instead of copy (see above)

If PowerShell refuses to run this file at all ("スクリプトの実行が無効になっている
ため" / UnauthorizedAccess), your execution policy is Restricted. Allow local
scripts once with:
  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
or run this file without changing anything:
  powershell -ExecutionPolicy Bypass -File .\install.ps1

To avoid passing -Dest every time, put it in a gitignored .install.local.ps1
next to this script instead, e.g.:
  $Dest = @('C:\Users\me\.claude\skills', 'C:\Users\me\.claude-personal\skills')
It's dot-sourced automatically below when -Dest isn't passed.
#>
param(
    [string[]]$Dest,
    [Alias('Symlink')]
    [switch]$Link
)

if (-not $PSBoundParameters.ContainsKey('Dest')) {
    $localConfig = Join-Path $PSScriptRoot '.install.local.ps1'
    if (Test-Path $localConfig) {
        . $localConfig
    }
}
if (-not $Dest) {
    $Dest = @(Join-Path $env:USERPROFILE ".claude\skills")
}

foreach ($d in $Dest) {
    New-Item -ItemType Directory -Force -Path $d | Out-Null
}

# Deletes a previously installed skill. A junction/symlink left by an earlier
# -Link run must be unlinked, NOT removed with -Recurse: Windows PowerShell 5.1
# happily recurses through a reparse point and would delete this repo's files.
function Remove-Installed {
    param([string]$Path)

    if (-not (Test-Path $Path)) { return }
    $item = Get-Item $Path -Force
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        [System.IO.Directory]::Delete($item.FullName)
    } else {
        Remove-Item $Path -Recurse -Force
    }
}

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

        foreach ($d in $Dest) {
            $target = Join-Path $d $name
            Remove-Installed $target

            if ($Link) {
                # Junction first: no admin rights, no Developer Mode, works across drives.
                $kind = $null
                $err = $null
                foreach ($k in 'Junction', 'SymbolicLink') {
                    try {
                        New-Item -ItemType $k -Path $target -Target $skillDir.FullName -ErrorAction Stop | Out-Null
                        $kind = $k
                        break
                    } catch {
                        $err = $_.Exception.Message
                    }
                }

                if ($kind) {
                    Write-Host "linked ($kind): $name -> $($skillDir.FullName) ($d)"
                } else {
                    Write-Warning "link failed for '$name' ($err) -- falling back to copy."
                    Copy-Item $skillDir.FullName $target -Recurse -Force
                    Write-Host "copied: $name -> $($skillDir.FullName) ($d)"
                }
            } else {
                Copy-Item $skillDir.FullName $target -Recurse -Force
                Write-Host "copied: $name -> $($skillDir.FullName) ($d)"
            }
        }
        $count++
    }

$how = if ($Link) { 'linked' } else { 'copied' }
Write-Host "done. $count skill(s) $how into: $($Dest -join ', ')"
if (-not $Link) {
    Write-Host "Tip: ./install.ps1 -Link installs junctions instead, so edits here apply without re-running."
}
Write-Host "Start a new session (or /clear) for Claude Code to pick them up."

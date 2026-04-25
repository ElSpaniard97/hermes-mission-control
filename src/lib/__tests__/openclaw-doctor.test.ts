import { describe, expect, it } from 'vitest'
import { parseHermesDoctorOutput } from '@/lib/hermes-doctor'

describe('parseHermesDoctorOutput', () => {
  it('marks warning output as fixable and extracts bullet issues', () => {
    const result = parseHermesDoctorOutput(`
Config warnings
- tools.exec.safeBins includes interpreter/runtime 'bun' without profile
- tools.exec.safeBins includes interpreter/runtime 'python3' without profile
Run: hermes doctor --fix
`, 0)

    expect(result.healthy).toBe(false)
    expect(result.level).toBe('warning')
    expect(result.category).toBe('general')
    expect(result.canFix).toBe(true)
    expect(result.issues).toEqual([
      "tools.exec.safeBins includes interpreter/runtime 'bun' without profile",
      "tools.exec.safeBins includes interpreter/runtime 'python3' without profile",
    ])
  })

  it('marks invalid config output as an error', () => {
    const result = parseHermesDoctorOutput(`
Invalid config at /home/hermes/.hermes/config.yaml:
- <root>: Unrecognized key: "test"
Config invalid
File: $HERMES_HOME/config.yaml
Problem:
- <root>: Unrecognized key: "test"
Run: hermes doctor --fix
`, 1)

    expect(result.healthy).toBe(false)
    expect(result.level).toBe('error')
    expect(result.category).toBe('config')
    expect(result.summary).toContain('Unrecognized key')
  })

  it('classifies state integrity warnings separately from config drift', () => {
    const result = parseHermesDoctorOutput(`
◇  State integrity
- Multiple state directories detected. This can split session history.
- Found 1 orphan transcript file(s) in ~/.hermes/agents/jarv/sessions.
Run "hermes doctor --fix" to apply changes.
`, 0)

    expect(result.healthy).toBe(false)
    expect(result.level).toBe('warning')
    expect(result.category).toBe('state')
    expect(result.summary).toContain('Multiple state directories')
  })

  it('suppresses foreign state-directory warnings for the active instance', () => {
    const result = parseHermesDoctorOutput(`
◇  State integrity
- Multiple state directories detected. This can split session history.
  - /home/nefes/.hermes
  Active state dir: ~/.hermes
- Found 1 orphan transcript file(s) in ~/.hermes/agents/jarv/sessions.
Run "hermes doctor --fix" to apply changes.
`, 0, { stateDir: '/home/hermes/.hermes' })

    expect(result.healthy).toBe(false)
    expect(result.level).toBe('warning')
    expect(result.category).toBe('state')
    expect(result.issues).toEqual([
      'Found 1 orphan transcript file(s) in ~/.hermes/agents/jarv/sessions.',
    ])
    expect(result.raw).not.toContain('/home/nefes/.hermes')
  })

  it('suppresses foreign state-directory warnings when the active dir is shown via HERMES_HOME alias', () => {
    const result = parseHermesDoctorOutput(`
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
┌  Hermes doctor
│
◇  State integrity
- Multiple state directories detected. This can split session history.
  - $HERMES_HOME/.hermes
  - /home/nefes/.hermes
  Active state dir: $HERMES_HOME
- Found 11 orphan transcript file(s) in $HERMES_HOME/agents/jarv/sessions.
Run "hermes doctor --fix" to apply changes.
`, 0, { stateDir: '/home/hermes/.hermes' })

    expect(result.summary).toContain('Found 11 orphan transcript file(s)')
    expect(result.raw).not.toContain('/home/nefes/.hermes')
    expect(result.raw).not.toContain('Multiple state directories detected')
  })

  it('parses state integrity blocks when lines are prefixed by box-drawing gutters', () => {
    const result = parseHermesDoctorOutput(`
┌  Hermes doctor
│
◇  State integrity
│  - Multiple state directories detected. This can split session history.
│    - $HERMES_HOME/.hermes
│    - /home/nefes/.hermes
│    Active state dir: $HERMES_HOME
│  - Found 11 orphan transcript file(s) in $HERMES_HOME/agents/jarv/sessions.
Run "hermes doctor --fix" to apply changes.
`, 0, { stateDir: '/home/hermes/.hermes' })

    expect(result.level).toBe('warning')
    expect(result.category).toBe('state')
    expect(result.issues).toEqual([
      'Found 11 orphan transcript file(s) in $HERMES_HOME/agents/jarv/sessions.',
    ])
    expect(result.raw).not.toContain('/home/nefes/.hermes')
    expect(result.raw).not.toContain('Multiple state directories detected')
  })

  it('marks clean output as healthy', () => {
    const result = parseHermesDoctorOutput('OK: configuration valid', 0)

    expect(result.healthy).toBe(true)
    expect(result.level).toBe('healthy')
    expect(result.category).toBe('general')
    expect(result.canFix).toBe(false)
  })

  it('treats positive security lines as healthy, not warnings (#331)', () => {
    const result = parseHermesDoctorOutput(`
? Security
- No channel security warnings detected.
- Run: hermes security audit --deep
`, 0)

    expect(result.healthy).toBe(true)
    expect(result.level).toBe('healthy')
    expect(result.issues).toEqual([])
  })

  it('still detects real security warnings alongside positive lines', () => {
    const result = parseHermesDoctorOutput(`
? Security
- Channel "public" has no auth configured.
- No channel security warnings detected.
- Run: hermes security audit --deep
`, 0)

    expect(result.healthy).toBe(false)
    expect(result.level).toBe('warning')
    expect(result.issues).toEqual([
      'Channel "public" has no auth configured.',
    ])
  })
})

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { config } from '@/lib/config'
import { isHermesGatewayRunning } from '@/lib/hermes-sessions'
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

/** True when MC is running inside a Docker container without systemd. */
function isDockerEnvironment(): boolean {
  return existsSync('/.dockerenv')
}

/**
 * Start hermes gateway as a detached background process.
 *
 * Used in Docker (and any systemd-less environment) where `hermes gateway start`
 * fails because it tries to install as a systemd service. We use `gateway run`
 * (foreground mode) but detach and track the PID ourselves.
 *
 * Writes the child PID to `~/.hermes/gateway.pid` so the existing status
 * detection (`isHermesGatewayRunning()`) picks it up.
 */
function startHermesGatewayDetached(hermesBin: string, homeDir: string): { pid: number | null; error?: string } {
  const hermesDir = join(homeDir, '.hermes')
  try { mkdirSync(hermesDir, { recursive: true }) } catch { /* ignore */ }

  const logPath = join(hermesDir, 'gateway.log')
  const pidPath = join(hermesDir, 'gateway.pid')

  try {
    // Open log file for append; route stdout and stderr into it
    const logFd = openSync(logPath, 'a')
    const child = spawn(hermesBin, ['gateway', 'run'], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env, HERMES_NONINTERACTIVE: '1', CI: '1' },
    })

    if (!child.pid) {
      return { pid: null, error: 'spawn returned no PID' }
    }

    // Write PID file so the rest of MC can detect the process
    writeFileSync(pidPath, String(child.pid), 'utf8')

    // Detach so MC exiting doesn't kill the gateway
    child.unref()

    return { pid: child.pid }
  } catch (err: any) {
    return { pid: null, error: err?.message || 'Failed to spawn hermes gateway' }
  }
}

/**
 * Stop a hermes gateway process started via startHermesGatewayDetached.
 * Reads the PID file, sends SIGTERM, then waits briefly for exit.
 */
function stopHermesGatewayDetached(homeDir: string): { stopped: boolean; error?: string } {
  const pidPath = join(homeDir, '.hermes', 'gateway.pid')
  if (!existsSync(pidPath)) {
    return { stopped: false, error: 'No gateway.pid file — gateway not running?' }
  }

  try {
    const raw = readFileSync(pidPath, 'utf8').trim()
    const pid = raw.startsWith('{') ? JSON.parse(raw).pid : parseInt(raw, 10)
    if (!pid) return { stopped: false, error: 'Could not parse PID file' }

    try {
      process.kill(pid, 'SIGTERM')
    } catch (err: any) {
      if (err?.code === 'ESRCH') {
        // Process already dead — clean up stale PID file
        try { require('node:fs').unlinkSync(pidPath) } catch { /* ignore */ }
        return { stopped: true }
      }
      return { stopped: false, error: err?.message }
    }

    // Clean up PID file
    try { require('node:fs').unlinkSync(pidPath) } catch { /* ignore */ }
    return { stopped: true }
  } catch (err: any) {
    return { stopped: false, error: err?.message || 'Failed to stop gateway' }
  }
}

type GatewayType = 'hermes' | 'hermes'
type GatewayAction = 'status' | 'start' | 'stop' | 'restart' | 'diagnose'

interface GatewayStatus {
  type: GatewayType
  name: string
  installed: boolean
  running: boolean
  port?: number
  pid?: number | null
  version?: string | null
  error?: string
}


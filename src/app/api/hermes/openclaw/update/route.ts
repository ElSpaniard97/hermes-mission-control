import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { runHermes } from '@/lib/command'
import { getDatabase } from '@/lib/db'
import { logger } from '@/lib/logger'

export async function POST(request: Request) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let installedBefore: string | null = null

  try {
    const vResult = await runHermes(['--version'], { timeoutMs: 3000 })
    const match = vResult.stdout.match(/(\d+\.\d+\.\d+)/)
    if (match) installedBefore = match[1]
  } catch {
    return NextResponse.json(
      { error: 'Hermes is not installed or not reachable' },
      { status: 400 }
    )
  }

  try {
    const result = await runHermes(['update', '--channel', 'stable'], {
      timeoutMs: 5 * 60 * 1000,
    })

    // Read new version after update
    let installedAfter: string | null = null
    try {
      const vResult = await runHermes(['--version'], { timeoutMs: 3000 })
      const match = vResult.stdout.match(/(\d+\.\d+\.\d+)/)
      if (match) installedAfter = match[1]
    } catch { /* keep null */ }

    // Audit log
    try {
      const db = getDatabase()
      db.prepare(
        'INSERT INTO audit_log (action, actor, detail) VALUES (?, ?, ?)'
      ).run(
        'hermes.update',
        auth.user.username,
        JSON.stringify({ previousVersion: installedBefore, newVersion: installedAfter })
      )
    } catch { /* non-critical */ }

    return NextResponse.json({
      success: true,
      previousVersion: installedBefore,
      newVersion: installedAfter,
      output: result.stdout,
    })
  } catch (err: any) {
    const detail =
      err?.stderr?.toString?.()?.trim() ||
      err?.stdout?.toString?.()?.trim() ||
      err?.message ||
      'Unknown error during Hermes update'

    logger.error({ err }, 'Hermes update failed')

    return NextResponse.json(
      { error: 'Hermes update failed', detail },
      { status: 500 }
    )
  }
}

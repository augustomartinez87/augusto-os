// Guard simulation tests — run with: npx tsx --env-file=.env test-guard.ts
import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load .env if env var not already set (for running without --env-file)
if (!process.env.SPENSIV_DEV_DATABASE_URL) {
  const envPath = path.join(__dirname, '.env')
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const match = line.match(/^([A-Z_]+)="?([^"]+)"?$/)
      if (match) process.env[match[1]] = match[2]
    }
  }
}
const targetsPath = path.join(__dirname, '..', 'targets', 'targets.json')
const original = readFileSync(targetsPath, 'utf-8')

async function test(label: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${label}: `)
  try {
    await fn()
  } catch (err: any) {
    console.log(`\nFATAL en test "${label}": ${err.message}`)
    process.exit(1)
  }
}

// ── Test 1: guard aborts when devDatabaseUrl is <COMPLETAR> ──────────────────
await test('abort si devDatabaseUrl=<COMPLETAR>', async () => {
  const cfg = JSON.parse(original)
  cfg.targets.spensiv.devDatabaseUrl = '<COMPLETAR>'
  writeFileSync(targetsPath, JSON.stringify(cfg, null, 2))

  // fresh import with patched file
  const { setActiveTarget } = await import('./src/targets.js')
  const { assertNoProdDb } = await import('./src/db-guard.js')

  setActiveTarget('spensiv')
  try {
    assertNoProdDb()
    console.log('❌ FAIL — guard no abortó')
  } catch (err: any) {
    if (err.message.includes('devDatabaseUrl no configurada')) {
      console.log('✅ abortó correctamente')
    } else {
      console.log(`❌ FAIL — mensaje inesperado: ${err.message}`)
    }
  }
  writeFileSync(targetsPath, original)
})

// ── Test 2: guard aborts when devDatabaseUrl points to prod ──────────────────
await test('abort si devDatabaseUrl=URL prod', async () => {
  const cfg = JSON.parse(original)
  cfg.targets.spensiv.devDatabaseUrl = 'postgresql://postgres.jymdblurkpadupdqzfzo:pass@aws-0-us-west-2.pooler.supabase.com:6543/postgres'
  writeFileSync(targetsPath, JSON.stringify(cfg, null, 2))

  // bust import cache
  const guardMod = await import(`./src/db-guard.js?t=${Date.now()}`)
  const targetsMod = await import(`./src/targets.js?t=${Date.now()}`)

  targetsMod.setActiveTarget('spensiv')
  try {
    guardMod.assertNoProdDb()
    console.log('❌ FAIL — guard no abortó con URL de prod')
  } catch (err: any) {
    if (err.message.includes('apunta a producción')) {
      console.log('✅ abortó correctamente — detectó patrón de prod')
    } else {
      console.log(`❌ FAIL — mensaje inesperado: ${err.message}`)
    }
  }
  writeFileSync(targetsPath, original)
})

// ── Test 3: guard passes with Neon URL (non-prod) ────────────────────────────
await test('pasa con URL Neon (no-prod)', async () => {
  writeFileSync(targetsPath, original) // original has ${SPENSIV_DEV_DATABASE_URL}

  const guardMod2 = await import(`./src/db-guard.js?t=${Date.now()}`)
  const targetsMod2 = await import(`./src/targets.js?t=${Date.now()}`)

  targetsMod2.setActiveTarget('spensiv')
  try {
    const override = guardMod2.assertNoProdDb()
    if (override.DATABASE_URL.includes('neon.tech')) {
      console.log(`✅ pasó — DATABASE_URL efectivo: ${override.DATABASE_URL.replace(/:([^:@]+)@/, ':***@')}`)
    } else {
      console.log(`❌ FAIL — URL inesperada: ${override.DATABASE_URL}`)
    }
  } catch (err: any) {
    console.log(`❌ FAIL — guard abortó inesperadamente: ${err.message}`)
  }
})

// Ensure original is restored
writeFileSync(targetsPath, original)
console.log('\ntargets.json restaurado ✓')

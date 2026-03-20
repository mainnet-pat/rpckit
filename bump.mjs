#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const version = process.argv[2]

if (!version) {
  console.error('Usage: node bump.mjs <version>')
  console.error('Example: node bump.mjs 0.2.0')
  process.exit(1)
}

const packagesDir = 'packages'
const packages = readdirSync(packagesDir)

for (const pkg of packages) {
  const pkgJsonPath = join(packagesDir, pkg, 'package.json')
  let pkgJson
  try {
    pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
  } catch {
    continue
  }
  pkgJson.version = version
  // Update @rpckit/* dependency versions
  for (const depField of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (pkgJson[depField]) {
      for (const dep of Object.keys(pkgJson[depField])) {
        if (dep.startsWith('@rpckit/')) {
          pkgJson[depField][dep] = `^${version}`
        }
      }
    }
  }
  writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n')
  console.log(`${pkgJson.name}: ${version}`)
}

// Update site/package.json version
const sitePkgPath = 'site/package.json'
const sitePkg = JSON.parse(readFileSync(sitePkgPath, 'utf-8'))
const { name, version: _oldVersion, ...rest } = sitePkg
const orderedSitePkg = { name, version, ...rest }
writeFileSync(sitePkgPath, JSON.stringify(orderedSitePkg, null, 2) + '\n')
console.log(`site: ${version}`)

// Update site/vocs.config.ts version in topNav
const vocsPath = 'site/vocs.config.ts'
let vocsContent = readFileSync(vocsPath, 'utf-8')
vocsContent = vocsContent.replace(
  /\{ text: '\d+\.\d+\.\d+', link: '\/docs\/changelog' \}/,
  `{ text: '${version}', link: '/docs/changelog' }`
)
writeFileSync(vocsPath, vocsContent)
console.log(`site/vocs.config.ts: updated version to ${version}`)

// Update site/pages/index.mdx version badge
const indexPath = 'site/pages/index.mdx'
let indexContent = readFileSync(indexPath, 'utf-8')
indexContent = indexContent.replace(
  /(>version<\/span>\s*<span[^>]*>)\d+\.\d+\.\d+(<\/span>)/,
  `$1${version}$2`
)
writeFileSync(indexPath, indexContent)
console.log(`site/pages/index.mdx: updated version badge to ${version}`)

console.log(`\nAll packages set to version ${version}`)

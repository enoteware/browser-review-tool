#!/usr/bin/env node

/**
 * Cursor Command: Browser Review Tool
 *
 * Wrapper for launching browser review from Cursor slash commands
 */

import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Path to the main script
const mainScript = path.join(__dirname, '../../src/index.mjs')

// Get all arguments passed to this script
const args = process.argv.slice(2)

// Execute the main script with the same arguments
try {
  execSync(`node "${mainScript}" ${args.join(' ')}`, {
    stdio: 'inherit',
    cwd: process.cwd()
  })
} catch (error) {
  console.error('Browser review failed:', error.message)
  process.exit(1)
}
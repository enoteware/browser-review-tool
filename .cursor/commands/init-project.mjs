#!/usr/bin/env node

/**
 * Cursor Command: Initialize Project
 * 
 * Sets up ignore files and common project configuration files.
 * Usage: /init-project
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Get the workspace root
// If running from .cursor/commands/, go up two levels
// Otherwise, use current working directory (for global installs)
function getWorkspaceRoot() {
  // Check if we're in a .cursor/commands/ directory
  if (__dirname.includes('.cursor/commands')) {
    return path.resolve(__dirname, '../../')
  }
  // Otherwise, use current working directory
  return process.cwd()
}

const workspaceRoot = getWorkspaceRoot()

// Common .gitignore patterns
const GITIGNORE_PATTERNS = `# Dependencies
node_modules/
.pnp
.pnp.js
.yarn/cache
.yarn/unplugged
.yarn/build-state.yml
.yarn/install-state.gz

# Build outputs
dist/
build/
out/
.next/
.nuxt/
.output/
.vercel/
.turbo/

# Environment files
.env
.env.local
.env.*.local
.env.development.local
.env.test.local
.env.production.local

# OS files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db
Desktop.ini

# IDE
.vscode/
.idea/
*.swp
*.swo
*~
.project
.classpath
.settings/
*.sublime-project
*.sublime-workspace

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# Testing
coverage/
.nyc_output/
test-results/
playwright-report/
playwright/.cache/

# Temporary files
*.tmp
*.temp
.cache/
.temp/

# Lock files (uncomment if you want to ignore)
# package-lock.json
# yarn.lock
# pnpm-lock.yaml

# Misc
*.pem
*.key
*.cert
`

// Common .cursorignore patterns
const CURSORIGNORE_PATTERNS = `# Dependencies
node_modules/

# Build outputs
dist/
build/
out/
.next/
.nuxt/
.output/
.vercel/
.turbo/

# Large generated files
*.log
*.cache

# Test outputs
coverage/
test-results/
playwright-report/

# Environment files (keep private)
.env
.env.local
.env.*.local

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/

# Temporary files
*.tmp
*.temp
.cache/
.temp/
`

// .cursorrules template (optional)
const CURSORRULES_TEMPLATE = `# Project-specific Cursor rules

# Context Awareness
When adding features, always review the existing project context. Ensure all changes align with the project's current logic, architecture, and dependencies.

# Code Style
- Follow existing code style and patterns
- Use consistent naming conventions
- Add comments for complex logic

# Testing
- Write tests for new features
- Ensure existing tests pass before submitting

# Documentation
- Update README.md for significant changes
- Document complex functions and classes
`

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function readFileSafe(filePath) {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return ''
  }
}

async function appendToFile(filePath, content) {
  const existing = await readFileSafe(filePath)
  if (existing && !existing.includes(content.trim().split('\n')[0])) {
    await fs.appendFile(filePath, '\n' + content)
    return true
  }
  return false
}

async function initProject() {
  console.log('🚀 Initializing project...\n')

  const results = {
    created: [],
    updated: [],
    skipped: []
  }

  // Initialize .gitignore
  const gitignorePath = path.join(workspaceRoot, '.gitignore')
  const gitignoreExists = await fileExists(gitignorePath)
  
  if (gitignoreExists) {
    const existing = await readFileSafe(gitignorePath)
    // Check if it already has our patterns
    if (existing.includes('node_modules/') && existing.includes('.env')) {
      results.skipped.push('.gitignore (already configured)')
    } else {
      // Append missing patterns
      const appended = await appendToFile(gitignorePath, GITIGNORE_PATTERNS)
      if (appended) {
        results.updated.push('.gitignore')
      } else {
        results.skipped.push('.gitignore (patterns already present)')
      }
    }
  } else {
    await fs.writeFile(gitignorePath, GITIGNORE_PATTERNS)
    results.created.push('.gitignore')
  }

  // Initialize .cursorignore
  const cursorignorePath = path.join(workspaceRoot, '.cursorignore')
  const cursorignoreExists = await fileExists(cursorignorePath)
  
  if (cursorignoreExists) {
    const existing = await readFileSafe(cursorignorePath)
    if (existing.includes('node_modules/')) {
      results.skipped.push('.cursorignore (already configured)')
    } else {
      const appended = await appendToFile(cursorignorePath, CURSORIGNORE_PATTERNS)
      if (appended) {
        results.updated.push('.cursorignore')
      } else {
        results.skipped.push('.cursorignore (patterns already present)')
      }
    }
  } else {
    await fs.writeFile(cursorignorePath, CURSORIGNORE_PATTERNS)
    results.created.push('.cursorignore')
  }

  // Optionally create .cursorrules (only if it doesn't exist)
  const cursorrulesPath = path.join(workspaceRoot, '.cursorrules')
  const cursorrulesExists = await fileExists(cursorrulesPath)
  
  if (!cursorrulesExists) {
    await fs.writeFile(cursorrulesPath, CURSORRULES_TEMPLATE)
    results.created.push('.cursorrules')
  } else {
    results.skipped.push('.cursorrules (already exists)')
  }

  // Print results
  console.log('✅ Project initialization complete!\n')
  
  if (results.created.length > 0) {
    console.log('📝 Created files:')
    results.created.forEach(file => console.log(`   - ${file}`))
    console.log()
  }
  
  if (results.updated.length > 0) {
    console.log('🔄 Updated files:')
    results.updated.forEach(file => console.log(`   - ${file}`))
    console.log()
  }
  
  if (results.skipped.length > 0) {
    console.log('⏭️  Skipped files:')
    results.skipped.forEach(file => console.log(`   - ${file}`))
    console.log()
  }

  console.log('✨ Your project is ready to go!')
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initProject().catch(error => {
    console.error('❌ Error initializing project:', error.message)
    process.exit(1)
  })
}

export { initProject }

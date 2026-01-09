# Cursor Commands

This directory contains custom Cursor commands for this project.

## Available Commands

### `/browser-review`

Launch browser automation for taking screenshots and screen recordings.

**What it does:**
- Opens a browser and navigates to specified URLs
- Takes screenshots and/or records screen interactions
- Generates beautiful HTML reports with all artifacts
- Supports both simple URL reviews and complex multi-step workflows

**Usage:**
1. Type `/browser-review` in the Cursor chat to see documentation
2. Run commands directly in terminal: `node .cursor/commands/browser-review.mjs [options]`

**Examples:**
```bash
# Simple screenshot
node .cursor/commands/browser-review.mjs --title "Homepage" --url http://localhost:3000

# Complex workflow
node .cursor/commands/browser-review.mjs --config examples/review-config.json
```

### `/init-project`

Initializes a new project by setting up ignore files and common configuration.

**What it does:**
- Creates or updates `.gitignore` with common patterns (node_modules, .env, build outputs, etc.)
- Creates or updates `.cursorignore` to exclude large files from Cursor's context
- Optionally creates `.cursorrules` template if it doesn't exist

**Usage:**
1. Type `/init-project` in the Cursor chat
2. Or run directly: `node .cursor/commands/init-project.mjs`

**Features:**
- Smart merging: Won't duplicate existing patterns
- Safe: Only adds patterns, doesn't remove existing ones
- Comprehensive: Includes patterns for Node.js, build tools, IDEs, OS files, and more

## Making Commands Global

To use these commands in other projects:

1. **Option 1: Copy the command directory**
   ```bash
   cp -r .cursor/ /path/to/other/project/
   ```

2. **Option 2: Create a symlink** (if you want to share commands)
   ```bash
   ln -s /path/to/browser-review-tool/.cursor /path/to/other/project/.cursor
   ```

3. **Option 3: Install as npm package** (for team-wide use)
   - Publish the commands as an npm package
   - Install in projects: `npm install --save-dev @your-org/cursor-commands`
   - Commands will be available in `.cursor/commands/`

## Command Structure

Cursor commands are `.md` files in `.cursor/commands/` that:
- Contain documentation about the command
- Reference `.mjs` scripts in code blocks for execution
- Are automatically detected by Cursor when placed in `.cursor/commands/`

The actual implementation is in `.mjs` files that:
- Can be run directly via `node`
- Export functions for programmatic use
- Use workspace root detection to work from any directory

## Adding New Commands

1. Create a new `.md` file in `.cursor/commands/` (e.g., `your-command.md`)
2. Create the corresponding `.mjs` script file
3. Reference the script in the `.md` file with a code block:
   ```markdown
   ```bash
   node .cursor/commands/your-command.mjs
   ```
   ```
4. Test it: `/your-command` in Cursor chat

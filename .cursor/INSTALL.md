# Installing as Global Cursor Command

This guide explains how to make the `init-project` command available globally across all your projects.

## Method 1: Global npm Installation (Recommended)

Install this package globally to use the command in any project:

```bash
# From this directory
npm install -g .

# Or if published to npm
npm install -g browser-review-tool
```

Then in any project, you can:
- Run: `cursor-init-project`
- Or use in Cursor chat: `/init-project` (if Cursor detects the command)

## Method 2: Copy to User Cursor Commands Directory

Cursor may support a global commands directory. Check your Cursor settings for:
- `~/.cursor/commands/` (macOS/Linux)
- `%APPDATA%\Cursor\commands\` (Windows)

Copy the command files there:
```bash
# macOS/Linux
mkdir -p ~/.cursor/commands
cp .cursor/commands/init-project.md ~/.cursor/commands/
cp .cursor/commands/init-project.mjs ~/.cursor/commands/

# Make executable
chmod +x ~/.cursor/commands/init-project.mjs
```

## Method 3: Per-Project Installation

For each project, copy the `.cursor/commands/` directory:

```bash
# From this repo
cp -r .cursor/ /path/to/your/project/
```

## Method 4: Create a Shell Alias

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
alias cursor-init='node ~/code/browser-review-tool/.cursor/commands/init-project.mjs'

# Or if you want to use the .md command format
alias cursor-init-md='cd ~/code/browser-review-tool && /init-project'
```

Then run `cursor-init` from any project directory.

## Verification

After installation, test the command:

```bash
# Navigate to a test project
cd /path/to/test/project

# Run the command
cursor-init-project

# Or if using alias
cursor-init
```

You should see output like:
```
🚀 Initializing project...

✅ Project initialization complete!

📝 Created files:
   - .gitignore
   - .cursorignore
   - .cursorrules

✨ Your project is ready to go!
```

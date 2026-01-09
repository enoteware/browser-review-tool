# Initialize Project

Set up ignore files (.gitignore, .cursorignore) and project configuration.

## What it does

- Creates or updates `.gitignore` with common patterns (node_modules, .env, build outputs, etc.)
- Creates or updates `.cursorignore` to exclude large files from Cursor's context
- Optionally creates `.cursorrules` template if it doesn't exist

```bash
node .cursor/commands/init-project.mjs
```

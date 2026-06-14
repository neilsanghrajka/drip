## Development
- Use `pnpm` as a package manager always.

## Coding Agents
- Our coding agent is `codex`. (Not claude-code, cursor, etc).
- When configuring any skills, mcp, plugins etc configure them for codex only. Always setup project scope (not global, or user scope).

## Agent Skills
- Install skills using [vercel agent skills](https://github.com/vercel-labs/skills)
- Skills should only be installed project scope (not global scope) in `.agent/skills/` directory.
- Typical installation command is `pnpm dlx skills add -y <skill name|github url>`
- Run `pnpm dlx skills --help` for more

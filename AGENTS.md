## Development
- Use `pnpm` as a package manager always.

## Parallel Development
-

## Environment Variables
- Whenver you add a new .env variable, ensure you add `.env.example` with all the environment variables and their descriptions.
- TODO: Add a line about using .env variables properly
- Sync them to vercel prod

## Verifying your work
- Locally: 
- Cloud:

## Coding Agents
- Our coding agent is `codex`. (Not claude-code, cursor, etc).
- When configuring any skills, mcp, plugins etc configure them for codex only. Always setup project scope (not global, or user scope).

## Agent Skills
- Install skills using [vercel agent skills](https://github.com/vercel-labs/skills)
- Skills should only be installed project scope (not global scope) in `.agent/skills/` directory.
- Typical installation command is `pnpm dlx skills add -y <skill name|github url>`
- Run `pnpm dlx skills --help` for more

## Setup
# Local Deve
1) Install the following Codex Plugins: Vercel
2) Vercel CLI Oauth
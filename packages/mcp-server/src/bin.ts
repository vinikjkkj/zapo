#!/usr/bin/env node

import { runMcpServer } from './server'

void runMcpServer().catch((error) => {
    process.stderr.write(`fatal: ${(error as Error)?.stack ?? String(error)}\n`)
    process.exit(1)
})

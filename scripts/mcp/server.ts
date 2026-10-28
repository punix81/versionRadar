#!/usr/bin/env node

/**
 * VersionRadar MCP server (stdio transport).
 *
 * No web server, no Angular, no Express. Diagnostics are written to stderr
 * only: stdout is reserved for the MCP JSON-RPC stream.
 *
 * Environment:
 * - VERSIONRADAR_ENV_FILE            credential file (default ~/.config/opencode/versionRadar.env)
 * - VERSIONRADAR_ROOT                project root override
 * - VERSIONRADAR_MCP_ALLOW_REFRESH=1 registers the privileged refresh_versions tool
 * - VERSIONRADAR_MCP_APPROVAL_MODE   strict (default) | opencode
 *                                    opencode delegates the per-call approval to the
 *                                    host client permission rule; see tools.ts
 * - VERSIONRADAR_REFRESH_CONSENT_FILE consent file path override (strict mode)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { findProjectRoot } from '../lib/scanner-context';
import { registerTools, resolveApprovalMode } from './tools';

const SERVER_NAME = 'versionradar';
const SERVER_VERSION = '1.0.0';

function log(message: string): void {
  process.stderr.write(`[versionradar-mcp] ${message}\n`);
}

export function createServer(): McpServer {
  const rootDir = findProjectRoot();
  const allowRefresh = process.env['VERSIONRADAR_MCP_ALLOW_REFRESH'] === '1';
  const { mode: approvalMode, error: approvalModeError } = resolveApprovalMode(
    process.env['VERSIONRADAR_MCP_APPROVAL_MODE']
  );

  if (approvalModeError) log(`config: ${approvalModeError}`);
  if (allowRefresh && approvalMode === 'opencode') {
    log(
      'mode=opencode: refresh_versions requires no consent file. Approval is delegated to the host client; ' +
        'the OpenCode rule "versionradar_refresh_versions" -> ask must exist, otherwise the call runs unattended.'
    );
  }

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        'VersionRadar exposes read-only analytics over generated repository scans. ' +
        'Start with scan_status to know what data is available and how fresh it is. ' +
        'The generated files carry no scan timestamp: file modification time is not a scan date. ' +
        'Never state that a dependency is outdated: no reference version source exists. ' +
        'Never request or display credential values. ' +
        (approvalMode === 'opencode'
          ? 'refresh_versions is registered in the local approval mode: never call it without an explicit user request and never ' +
            'substitute another command for it; the host client must prompt the user, and a refusal ends the operation.'
          : 'refresh_versions, when registered, requires a single-use consent token created by the user.'),
    }
  );

  registerTools(server, {
    rootDir,
    allowRefresh,
    approvalMode,
    envFilePath: process.env['VERSIONRADAR_ENV_FILE'],
    consentFilePath: process.env['VERSIONRADAR_REFRESH_CONSENT_FILE'],
  });

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log(`ready (root: ${findProjectRoot()})`);
}
process.on('uncaughtException', error => {
  log(`fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

process.on('unhandledRejection', reason => {
  log(`fatal rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  process.exit(1);
});

if (require.main === module) {
  main().catch(error => {
    log(`startup failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

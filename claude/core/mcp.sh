#!/bin/bash

set -e

echo "Installing MCP servers..."

claude mcp add fetch -s user -- npx -y @kazuph/mcp-fetch
claude mcp add context-mode -s user -- npx -y context-mode

claude mcp list

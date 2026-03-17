#!/bin/bash

set -e

echo "=== A2A Financial Planning Platform - Verification Script ==="
echo ""

AGENTS=(
  "financial-profile-agent:8001"
  "market-simulation-agent:8002"
  "portfolio-optimization-agent:8003"
  "tax-strategy-agent:8004"
  "risk-evaluation-agent:8005"
  "reviewer-agent:8006"
  "evaluator-agent:8007"
)

echo "Checking agent structure..."
for agent_port in "${AGENTS[@]}"; do
  agent="${agent_port%:*}"
  port="${agent_port#*:}"

  if [ -f "../agents/$agent/src/index.js" ] && [ -f "../agents/$agent/package.json" ] && [ -f "../agents/$agent/Dockerfile" ]; then
    echo "✓ $agent (port $port)"
  else
    echo "✗ $agent - Missing files!"
  fi
done

echo ""
echo "Checking orchestrator..."
if [ -f "../orchestrator/src/index.js" ] && [ -f "../orchestrator/package.json" ] && [ -f "../orchestrator/Dockerfile" ]; then
  echo "✓ Orchestrator (port 8000)"
else
  echo "✗ Orchestrator - Missing files!"
fi

echo ""
echo "Checking UI..."
if [ -f "../ui/src/index.html" ] && [ -f "../ui/package.json" ] && [ -f "../ui/Dockerfile" ]; then
  echo "✓ Angular UI (port 4200)"
else
  echo "✗ UI - Missing files!"
fi

echo ""
echo "Checking docker-compose.yml..."
if [ -f "docker-compose.yml" ]; then
  service_count=$(grep -c "^  [a-z-]*:" docker-compose.yml || true)
  echo "✓ docker-compose.yml found ($service_count services)"
else
  echo "✗ docker-compose.yml not found!"
fi

echo ""
echo "=== Verification Complete ==="
echo "Ready to run: docker-compose up --build"

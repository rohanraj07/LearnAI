#!/bin/bash

set -e

echo "🧪 Testing Agentic Finance Platform..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is running
echo "📦 Checking Docker..."
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"
echo ""

# Start services
echo "🚀 Starting services..."
docker-compose down 2>/dev/null || true
docker-compose up --build -d

echo "⏳ Waiting for services to be healthy (max 120s)..."
counter=0
max_attempts=24

while [ $counter -lt $max_attempts ]; do
    echo -n "."

    # Check if all services are healthy
    if docker-compose ps --services --filter "status=running" | wc -l | grep -q "5"; then
        # Try to hit the orchestrator health endpoint
        if curl -s http://localhost:8000/health > /dev/null 2>&1; then
            echo ""
            echo -e "${GREEN}✓ All services are healthy!${NC}"
            break
        fi
    fi

    counter=$((counter + 1))
    sleep 5
done

if [ $counter -eq $max_attempts ]; then
    echo ""
    echo -e "${RED}❌ Services failed to start${NC}"
    echo ""
    echo "Docker Compose logs:"
    docker-compose logs
    docker-compose down
    exit 1
fi

echo ""
echo "🧪 Testing API endpoints..."
echo ""

# Test orchestrator health
echo "Testing GET /health..."
if curl -s http://localhost:8000/health | grep -q "healthy"; then
    echo -e "${GREEN}✓ Orchestrator health check passed${NC}"
else
    echo -e "${RED}❌ Orchestrator health check failed${NC}"
    docker-compose logs orchestrator
    docker-compose down
    exit 1
fi

# Test agent health
echo "Testing Financial Profile Agent health..."
if curl -s http://localhost:8001/health | grep -q "healthy"; then
    echo -e "${GREEN}✓ Financial Profile Agent health check passed${NC}"
else
    echo -e "${RED}❌ Financial Profile Agent health check failed${NC}"
    docker-compose logs financial-profile-agent
    docker-compose down
    exit 1
fi

echo ""
echo "✅ All tests passed!"
echo ""
echo "🌐 Services running:"
echo "   Orchestrator API: http://localhost:8000"
echo "   Angular UI:      http://localhost:4200"
echo ""
echo "To stop services: docker-compose down"

# Quick Start — 5 Minutes to Running

## Fastest Way: Docker (Recommended)

### 1. Get a Free Groq API Key
Visit https://console.groq.com and create an account (2 minutes)

### 2. Run with Docker
```bash
cd deployment

# Set your API key and start
GROQ_API_KEY=sk-gsk-your-key docker-compose up --build
```

### 3. Open in Browser
- **UI:** http://localhost:4200
- **API:** http://localhost:8000
- **Agents:** http://localhost:8001-8007

### 4. Test It
Fill the form and click "Generate Strategies"

**Done!** 🎉

---

## Local Development (If Docker unavailable)

### Terminal 1: Start Redis
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

### Terminal 2: Start Orchestrator
```bash
cd orchestrator
npm install
npm start
```

### Terminal 3-9: Start 7 Agents
**Copy-paste this script to start all agents:**

```bash
#!/bin/bash
AGENTS=(
  "financial-profile-agent:8001"
  "market-simulation-agent:8002"
  "portfolio-optimization-agent:8003"
  "tax-strategy-agent:8004"
  "risk-evaluation-agent:8005"
  "reviewer-agent:8006"
  "evaluator-agent:8007"
)

export GROQ_API_KEY=sk-gsk-your-key

for agent_port in "${AGENTS[@]}"; do
  agent="${agent_port%:*}"
  cd "agents/$agent"
  npm install
  npm start &
  cd ../..
done

wait
```

Or manually in separate terminals:
```bash
cd agents/financial-profile-agent && npm install && npm start
cd agents/market-simulation-agent && npm install && npm start
# ... repeat for others ...
```

### Terminal 10: Start UI
```bash
cd ui
npm install
ng serve --open
```

---

## Test via API

```bash
curl -X POST http://localhost:8000/run \
  -H "Content-Type: application/json" \
  -d '{
    "age": 35,
    "annualIncome": 200000,
    "totalSavings": 400000,
    "riskTolerance": "moderate",
    "retirementAge": 55,
    "monthlyExpenses": 8000
  }'
```

---

## Change AI Model (Anytime)

```bash
# Use a different Groq model
GROQ_MODEL=llama-3.1-70b docker-compose up

# Or for local development
export GROQ_MODEL=llama-3.1-70b
npm start  # Restart services
```

**Available models:**
- `llama-3.1-8b-instant` (default) — Fast, good quality
- `llama-3.1-70b` — More powerful reasoning
- `mixtral-8x7b-32768` — Good for finance

---

## Troubleshoot

| Problem | Fix |
|---------|-----|
| Port 8000 in use | `lsof -ti:8000 \| xargs kill -9` |
| Redis won't connect | Check Docker: `docker ps \| grep redis` |
| Agent not registering | Check: `curl http://localhost:8000/agents` |
| Groq rate limited | Wait 1 min (free tier: 6000 tokens/min) |

---

## Next: Read README.md for Full Context

The main README explains:
- How each agent works
- Architecture & design
- API reference
- Comparison with traditional systems

---

**That's it! You're running an AI financial planning system.** 🚀

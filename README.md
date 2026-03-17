# Agentic AI Financial Planning System

**An intelligent multi-agent system that automates retirement strategy planning** using AI reasoning instead of hardcoded rules. Built for speed, personalization, and adaptability.

---

## The Problem We Solve

Traditional financial planning tools use **static, non-adaptive logic**:

```
User Input
    ↓
Hardcoded Rules (if-then-else chains)
    ↓
Lookup Tables & Formulas
    ↓
Generic Output
```

**Problems:**
- ❌ Rules break with edge cases
- ❌ Can't reason about complex scenarios
- ❌ Requires code deployment for any update
- ❌ Takes days to generate a strategy

---

## Our Solution: AI Agent System

```
User Input (age, income, savings, risk tolerance)
    ↓
7 Specialized AI Agents Collaborate (in parallel)
    ↓
Each Agent Reasons Using Groq LLM
    ↓
Results Shared in Redis
    ↓
Dynamic A2UI Surfaces Generated
    ↓
Angular Renders Personalized Recommendations
    ↓
Strategy + Explanation in 2-5 seconds ✅
```

**Benefits:**
- ✅ AI **reasons** about scenarios (not just rules)
- ✅ Agents **adapt** without code deployment
- ✅ **Parallel** execution = fast results
- ✅ **Modular** design = easy to add/replace agents
- ✅ **Audit trail** = every decision logged
- ✅ **Dynamic UI** = surfaces describe themselves

---

## How It Works (Simple Walkthrough)

### User Submits Financial Profile
```json
{
  "age": 35,
  "annualIncome": 200000,
  "totalSavings": 400000,
  "riskTolerance": "moderate",
  "retirementAge": 55,
  "monthlyExpenses": 8000
}
```

### Seven Agents Analyze (in 2-5 seconds)

| Agent | Port | What It Does |
|-------|------|-------------|
| **Profile** | 8001 | Normalizes data, calculates financial health |
| **Simulation** | 8002 | Monte Carlo: tests 1000 market scenarios |
| **Portfolio** | 8003 | Recommends stock/bond/REIT allocations |
| **Tax** | 8004 | Optimizes tax efficiency & withdrawal strategy |
| **Risk** | 8005 | Calculates volatility, drawdown, VaR |
| **Reviewer** | 8006 | Validates strategy coherence, flags issues |
| **Evaluator** | 8007 | Ranks strategies with composite scores |

All agents work **in parallel** using **shared Redis memory**.

### System Returns Personalized Recommendations

```json
{
  "status": "completed",
  "strategies": [
    {
      "rank": 1,
      "name": "Baseline Retirement",
      "successProbability": 85.2,
      "expectedReturn": 6.5,
      "riskLevel": 50,
      "explanation": "Balanced approach aligns with your moderate risk tolerance..."
    },
    {
      "rank": 2,
      "name": "Conservative",
      "successProbability": 92.1,
      "expectedReturn": 4.5,
      "riskLevel": 35,
      "explanation": "Safer option with higher success rate but lower returns..."
    }
  ]
}
```

---

## System Architecture

### Visual Overview

```
Frontend (Angular)
     ↓ HTTP POST /run with user profile
Orchestrator (Node.js)
     ├─ Plans workflow (DAG)
     └─ Dispatches tasks to agents
        ├─ Agent 1 (Profile)       │ All read/write
        ├─ Agent 2 (Simulation)    │ to Redis namespace
        ├─ Agent 3 (Portfolio)     │
        ├─ Agent 4 (Tax)           │
        ├─ Agent 5 (Risk)          │
        ├─ Agent 6 (Reviewer)      │
        └─ Agent 7 (Evaluator)     │
              ↓ Final output
         Generates A2UI Surfaces
              ↓
         Frontend renders dynamically
```

### Technology Stack

| Component | Tech | Why |
|-----------|------|-----|
| Frontend | Angular 17 | Reactive forms, dynamic rendering |
| Orchestrator | Node.js + Express | Fast, event-driven |
| Agents | Node.js + Express | Lightweight, parallel capable |
| AI Provider | Groq API | Free tier, reasoning models, fast inference |
| State | Redis 7 | Sub-millisecond, workflow isolation |
| Protocol | HTTP/JSON (A2A) | Standard, debuggable, language-agnostic |
| Deployment | Docker Compose | One-command setup |

---

## Each Agent Explained (Simple)

### 1. Profile Agent (Port 8001)
**Job:** Understand the user's financial situation

**What it analyzes:**
- Net worth (assets minus debt)
- Savings rate (% of income saved)
- Debt-to-income ratio
- Account breakdown (401k, IRA, brokerage)

**Example output:**
```json
{
  "age": 35,
  "netWorth": 500000,
  "savingsRate": 0.38,
  "yearsToRetirement": 20,
  "debtToIncomeRatio": 0.24
}
```

---

### 2. Simulation Agent (Port 8002)
**Job:** Test if retirement strategies actually work

**What it does:**
- Simulates 1000 market scenarios (different stock/bond performance paths)
- Runs money in + money out each year
- Counts: how many scenarios end with money left?

**Example output:**
```json
{
  "baseline": {
    "successRate": 0.852,     // 85.2% of scenarios succeed
    "worstCase": 400000,       // Worst outcome
    "medianOutcome": 1200000,  // Typical outcome
    "bestCase": 2100000        // Best outcome
  }
}
```

---

### 3. Portfolio Agent (Port 8003)
**Job:** Recommend what to invest in

**What it decides:**
- % in US stocks (growth)
- % in bonds (safety)
- % in international (diversification)
- % in real estate (inflation hedge)
- % in cash (emergency fund)

**Example output:**
```json
{
  "allocations": {
    "usStocks": 0.50,        // 50% large-cap
    "bonds": 0.30,           // 30% bonds
    "international": 0.10,   // 10% international
    "realEstate": 0.05,      // 5% REITs
    "cash": 0.05             // 5% cash
  },
  "expectedAnnualReturn": 0.065  // ~6.5% per year
}
```

---

### 4. Tax Agent (Port 8004)
**Job:** Minimize taxes during retirement

**What it figures out:**
- Effective tax rate in retirement
- Best withdrawal order (which accounts first?)
  - Brokerage → taxable gains
  - 401k → all taxed as income
  - Roth → tax-free
- Estimated lifetime tax savings

**Example output:**
```json
{
  "effectiveTaxRate": 0.18,           // ~18% taxes in retirement
  "withdrawalOrder": ["brokerage", "401k", "roth"],
  "estimatedTaxSavings": 85000        // Over lifetime
}
```

---

### 5. Risk Agent (Port 8005)
**Job:** Identify what could go wrong

**What it measures:**
- **Volatility** — how much does this bounce around? (%)
- **Max Drawdown** — worst single-year loss (%)
- **Sharpe Ratio** — return per unit of risk
- **Value at Risk** — worst 5% of outcomes

**Example output:**
```json
{
  "portfolioVolatility": 0.13,    // 13% annual volatility
  "maxDrawdown": -0.25,            // Could lose 25% in bad year
  "sharpeRatio": 0.72,             // Good risk-adjusted return
  "compositeRiskScore": 50         // Medium (0-100 scale)
}
```

---

### 6. Reviewer Agent (Port 8006)
**Job:** Quality assurance — does this strategy make sense?

**What it checks:**
- Does allocation match risk tolerance?
- Are numbers realistic?
- Any red flags?
- Recommendation: APPROVE / REVIEW / REJECT

**Example output:**
```json
{
  "coherenceScore": 82,                // 82/100 coherence
  "flags": [],                         // No issues
  "recommendation": "APPROVE",
  "rationale": "Balanced strategy aligned with moderate risk profile and 20-year timeline"
}
```

---

### 7. Evaluator Agent (Port 8007)
**Job:** Rank strategies 1-5 for this specific person

**How it scores (weighted):**
- 40% Success Probability
- 30% Expected Returns
- 30% Tax Efficiency

**Example output:**
```json
{
  "rank": 1,
  "strategyName": "Baseline",
  "compositeScore": 78.5,              // Combined score
  "successProbability": 85.2,
  "expectedReturn": 6.5,
  "taxEfficiency": 82.0,
  "recommendation": "BEST FOR YOU",
  "reasoning": "Balances growth potential with downside protection. Matches your moderate risk tolerance and 20-year timeline perfectly."
}
```

---

## Performance Comparison

### Before (Primitive Rules-Based)
```
2-3 days     to generate one strategy
Manual code  to update rules
Static logic that breaks on edge cases
Can't reason about "what-if" scenarios
```

### After (AI Agent System)
```
2-5 seconds     to generate strategies
Change prompts  (no deployment needed)
AI reasoning    handles edge cases
Agents explain  their decisions
```

| Metric | Old | New |
|--------|-----|-----|
| Time | 2-3 days | 2-5 seconds |
| Updates | Deploy code | Change env variable |
| Logic | Hardcoded rules | AI reasoning |
| Scalability | Monolithic | Distributed agents |
| Auditability | Scattered logs | Centralized Redis |

---

## Quick Start

### With Docker (Recommended)
```bash
cd deployment
GROQ_API_KEY=sk-gsk-your-key docker-compose up --build
```
Open: **http://localhost:4200**

### Without Docker (Local Dev)

**Terminal 1: Start Redis**
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

**Terminal 2: Start Orchestrator**
```bash
cd orchestrator
npm install
npm start
# Runs on http://localhost:8000
```

**Terminals 3-9: Start Agents (each in new terminal)**
```bash
# Agent 1: Financial Profile
cd agents/financial-profile-agent && npm install && npm start

# Agent 2: Market Simulation
cd agents/market-simulation-agent && npm install && npm start

# Repeat for agents 3-7...
```

**Terminal 10: Start UI**
```bash
cd ui
npm install
ng serve --open
# Opens http://localhost:4200
```

---

## Configuration

### Change AI Model (Easy!)

All agents use the same environment variable:
```bash
export GROQ_MODEL=llama-3.1-8b-instant  # Fast, default
export GROQ_MODEL=llama-3.1-70b         # More capable
export GROQ_MODEL=mixtral-8x7b-32768    # Complex reasoning
```

**Or in Docker:**
```bash
GROQ_API_KEY=sk-gsk-... GROQ_MODEL=llama-3.1-70b docker-compose up
```

### Environment Variables

```bash
# AI Configuration
GROQ_API_KEY=sk-gsk-your-key           # Get from https://console.groq.com
GROQ_MODEL=llama-3.1-8b-instant        # Which model to use

# Database
REDIS_HOST=localhost
REDIS_PORT=6379

# Services
PORT=8000                              # Orchestrator port
NODE_ENV=production
```

---

## API Examples

### Run a Financial Analysis
```bash
curl -X POST http://localhost:8000/run \
  -H "Content-Type: application/json" \
  -d '{
    "age": 35,
    "annualIncome": 200000,
    "totalSavings": 400000,
    "riskTolerance": "moderate",
    "retirementAge": 55,
    "monthlyExpenses": 8000,
    "accounts": [
      {"type": "401k", "balance": 300000, "monthlyContribution": 2000, "employerMatch": 0.5}
    ],
    "liabilities": [
      {"type": "mortgage", "balance": 400000, "monthlyPayment": 2800}
    ]
  }'
```

**Response:**
```json
{
  "workflowId": "wf-abc123",
  "status": "completed",
  "finalOutputs": { /* agent results */ },
  "uiSurfaces": [ /* dynamic UI descriptors */ ]
}
```

### Check Results
```bash
curl http://localhost:8000/workflow/wf-abc123/results
```

### View Agents
```bash
curl http://localhost:8000/agents
```

---

## Why This Wins vs. Old Systems

### Flexibility
**Old:** Change rules → code → review → test → deploy → monitor (days)
**New:** Change prompt → restart agent (seconds)

### Reasoning
**Old:** Hit a case you didn't program → wrong answer
**New:** LLM reasons through new scenarios → correct answer

### Scalability
**Old:** One process does everything → bottleneck
**New:** 7 agents in parallel → 5x faster

### Maintainability
**Old:** Financial logic scattered across codebase
**New:** Each agent has clear domain → easy to understand

### Auditability
**Old:** Hard to trace why a recommendation was made
**New:** Every agent's reasoning is logged

---

## The Seven-Step Workflow

```
User Input
    ↓
Step 1: Profile Agent
  → Normalizes financial data
    ↓
Step 2: Market Simulation Agent
  → Tests 1000 scenarios
    ├─ Step 3: Portfolio Agent (in parallel)
    │   → Recommends allocations
    │
    ├─ Step 4: Tax Agent (in parallel)
    │   → Optimizes taxes
    │
    └─ Step 5: Risk Agent (in parallel)
        → Evaluates risks
    ↓
Step 6: Reviewer Agent
  → Validates coherence
    ↓
Step 7: Evaluator Agent
  → Ranks strategies
    ↓
Orchestrator generates A2UI surfaces
    ↓
Angular UI renders dynamically
    ↓
User sees personalized recommendations ✅
```

---

## Project Structure

```
├── README.md                         ← You are here
├── QUICKSTART.md                     ← Step-by-step setup
│
├── orchestrator/
│   ├── src/index.js                  # Main server + A2UI generation
│   └── src/planner.js                # Workflow DAG
│
├── agents/                           # 7 Specialized AI Agents
│   ├── financial-profile-agent/      # Port 8001
│   ├── market-simulation-agent/      # Port 8002
│   ├── portfolio-optimization-agent/ # Port 8003
│   ├── tax-strategy-agent/           # Port 8004
│   ├── risk-evaluation-agent/        # Port 8005
│   ├── reviewer-agent/               # Port 8006
│   └── evaluator-agent/              # Port 8007
│
├── ui/                               # Angular Frontend
│   ├── src/app/
│   │   ├── app.component.*           # Main form + results
│   │   ├── services/orchestrator.service.ts
│   │   └── components/dynamic-surface/ # A2UI renderer
│   └── package.json
│
├── deployment/
│   └── docker-compose.yml            # One-command setup
│
└── package.json                      # Workspace config
```

---

## Troubleshooting

### Port Already in Use
```bash
lsof -ti:8000 | xargs kill -9
```

### Redis Not Connecting
```bash
docker ps | grep redis
redis-cli ping  # Should return PONG
```

### Agent Not Showing Up
```bash
curl http://localhost:8001/health
curl http://localhost:8000/agents
```

### Groq Rate Limited
Free tier: 6000 tokens/minute
- Wait 1 minute for quota reset
- Or upgrade Groq account
- Or reduce `max_tokens` in agent prompts

---

## Next Steps

**To extend the system:**
1. Add new agent (copy template, update planner.js)
2. Update system prompts (in agent index.js files)
3. Add UI components for new surfaces (in dynamic-surface/)

**To integrate with real data:**
1. Replace hardcoded accounts/liabilities with API calls
2. Add real market data (Yahoo Finance, Alpha Vantage)
3. Connect to user authentication system

**To deploy to production:**
1. Use managed Redis (AWS ElastiCache, Azure Cache)
2. Deploy agents to cloud (AWS ECS, GCP Cloud Run)
3. Add authentication + API keys
4. Set up monitoring (Datadog, New Relic)

---

## The Story for Leadership

> "Financial planning today is like giving everyone a calculator in 1985. We can do better.
>
> This system replaces **hardcoded business logic with AI reasoning**. Instead of asking 'what's the rule?', agents ask 'what makes sense?'
>
> Old system: 2-3 days, rule breaks on edge cases, static recommendations.
> New system: 2-5 seconds, AI adapts, personalized reasoning for each user.
>
> We've built it **modular** (7 agents work independently), **parallel** (runs in seconds), and **auditable** (every decision logged). Want to try a different strategy? Change an environment variable. No code deployment. No QA cycle.
>
> This is the architecture for the future of financial services."

---

**Status:** Production-ready POC
**Last Updated:** March 16, 2026
**Made with:** Node.js, Angular, Groq, Redis, Docker

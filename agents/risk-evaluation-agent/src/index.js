const express = require('express');
const cors = require('cors');
const { createClient } = require('redis');

const app = express();
const PORT = process.env.PORT || 8005;
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:8000';
const redisClient = createClient({ socket: { host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379 } });
redisClient.connect().catch(err => { console.error(err); process.exit(1); });

const AGENT_ID = 'risk-evaluation-agent';

async function registerWithOrchestrator() {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: AGENT_ID,
        baseUrl: `http://localhost:${PORT}`,
        capabilities: ['risk_evaluation'],
        version: '2.1.0'
      })
    });
    if (response.ok) {
      console.log(`✓ Registered with orchestrator at ${ORCHESTRATOR_URL}`);
    } else {
      console.error(`Failed to register: ${response.statusText}`);
    }
  } catch (err) {
    console.error(`Registration error: ${err.message}`);
  }
}
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

const SYSTEM_PROMPT = `You are a risk analyst specializing in portfolio risk metrics and retirement planning.
Evaluate the risk profile of each strategy based on:
- Portfolio volatility and drawdown exposure
- Success probability from simulations
- Longevity and sequence-of-returns risk
- Tax efficiency considerations
Provide comprehensive risk assessment for each strategy with scores and rationales.
Respond with valid JSON only.`;

async function groqEvaluateRisk(simResults, candidates) {
  if (!process.env.GROQ_API_KEY) {
    console.log('[Groq] API key not set');
    return null;
  }
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{
          role: 'system',
          content: SYSTEM_PROMPT
        }, {
          role: 'user',
          content: `Simulations: ${JSON.stringify(simResults)}\n\nPortfolios: ${JSON.stringify(candidates)}`
        }],
        max_tokens: 2000,
        temperature: 0.3
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'Groq API error');
    }

    return JSON.parse(data.choices[0].message.content);
  } catch (err) {
    console.error('[Groq] Error:', err.message);
    return null;
  }
}

const DEFAULT_RISK_SCORES = (simResults, candidates) => {
  const riskScores = {};
  Object.entries(simResults).forEach(([strategy, sim]) => {
    const portfolio = candidates.find(p => p.strategyVariant === strategy);
    riskScores[portfolio.portfolioId] = {
      portfolioId: portfolio.portfolioId,
      strategyVariant: strategy,
      portfolioVolatility: strategy === 'aggressive' ? 0.18 : strategy === 'conservative' ? 0.08 : 0.13,
      expectedAnnualReturn: portfolio.expectedAnnualReturn,
      valueAtRisk95: -0.15,
      conditionalVaR95: -0.22,
      sharpeRatio: sim.successProbability > 0.8 ? 0.75 : sim.successProbability > 0.65 ? 0.60 : 0.45,
      maxDrawdown: strategy === 'aggressive' ? -0.45 : -0.25,
      longevityRisk: 1 - sim.successProbability,
      sequenceOfReturnsRisk: strategy === 'aggressive' ? 0.35 : 0.15,
      compositeRiskScore: strategy === 'conservative' ? 35 : strategy === 'baseline' ? 50 : 65,
    };
  });
  return riskScores;
};

app.use(express.json()).use(cors());
app.get('/health', (req, res) => res.json({ status: 'healthy', agentId: AGENT_ID }));

app.post('/executeTask', async (req, res) => {
  const startTime = Date.now();
  try {
    const { taskId, workflowId, context } = req.body;
    const ns = context.sharedMemoryNamespace;
    const simResults = JSON.parse(await redisClient.get(`${ns}:simulationResults`));
    const candidates = JSON.parse(await redisClient.get(`${ns}:portfolioCandidates`));

    const aiRiskScores = await groqEvaluateRisk(simResults, candidates);
    const riskScores = aiRiskScores || DEFAULT_RISK_SCORES(simResults, candidates);

    const memoryKey = `${ns}:riskScores`;
    await redisClient.setEx(memoryKey, 3600, JSON.stringify(riskScores));

    res.json({
      taskId, workflowId, status: 'SUCCESS',
      result: { outputKey: memoryKey, summary: `Risk evaluation complete for ${Object.keys(riskScores).length} portfolios` },
      metadata: { agentId: AGENT_ID, agentVersion: '2.1.0', processingTimeMs: Date.now() - startTime, aiProvider: 'groq', aiModel: GROQ_MODEL, aiEnriched: !!aiRiskScores },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ taskId: req.body.taskId, workflowId: req.body.workflowId, status: 'FAILURE', error: { code: 'ERROR', message: err.message }, metadata: { agentId: AGENT_ID }, timestamp: new Date().toISOString() });
  }
});

app.listen(PORT, async () => {
  console.log(`⚠️  Risk Evaluation Agent on port ${PORT}`);
  await registerWithOrchestrator();
});

const express = require('express');
const cors = require('cors');
const { createClient } = require('redis');

const app = express();
const PORT = process.env.PORT || 8003;
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:8000';
const redisClient = createClient({ socket: { host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379 } });
redisClient.connect().catch(err => { console.error(err); process.exit(1); });

const AGENT_ID = 'portfolio-optimization-agent';

async function registerWithOrchestrator() {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: AGENT_ID,
        baseUrl: `http://localhost:${PORT}`,
        capabilities: ['portfolio_optimization'],
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

const SYSTEM_PROMPT = `You are a certified portfolio manager specializing in retirement planning.
Given user profile and goals, recommend customized portfolio allocations for each strategy.
Provide allocations as decimals (0-1) for: US_LARGE_CAP, US_BONDS, INTL_EQUITY, REAL_ESTATE, CASH.
Include strategyLabel, riskProfile, expectedAnnualReturn. Respond JSON only.`;

async function groqGenerateAllocations(profile, strategyVariants) {
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
          content: `Age ${profile.age}, retire at ${profile.retirementAge}, risk ${profile.riskTolerance}. Allocate: ${strategyVariants.join(', ')}`
        }],
        max_tokens: 1500,
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

const DEFAULT_ALLOCATIONS = {
  baseline: { strategyLabel: 'Baseline Retirement', riskProfile: 'moderate', expectedAnnualReturn: 0.065 },
  aggressive: { strategyLabel: 'Aggressive Growth', riskProfile: 'aggressive', expectedAnnualReturn: 0.082 },
  conservative: { strategyLabel: 'Conservative Safety', riskProfile: 'conservative', expectedAnnualReturn: 0.045 },
  delayed_retirement: { strategyLabel: 'Delayed Retirement (Age 60)', riskProfile: 'moderate', expectedAnnualReturn: 0.068 },
  increased_savings: { strategyLabel: 'Increased Savings (1.5x)', riskProfile: 'moderate', expectedAnnualReturn: 0.065 },
};

app.use(express.json()).use(cors());
app.get('/health', (req, res) => res.json({ status: 'healthy', agentId: AGENT_ID }));

app.post('/executeTask', async (req, res) => {
  try {
    const { taskId, workflowId, context, payload } = req.body;
    const ns = context.sharedMemoryNamespace;
    const profileJson = await redisClient.get(`${ns}:financialProfile`);
    const profile = JSON.parse(profileJson);

    const aiAllocations = await groqGenerateAllocations(profile, payload.strategyVariants);
    const allocationsToUse = aiAllocations || DEFAULT_ALLOCATIONS;

    const candidates = payload.strategyVariants.map(strategy => ({
      portfolioId: `p-${strategy}`,
      strategyVariant: strategy,
      ...(allocationsToUse[strategy] || DEFAULT_ALLOCATIONS[strategy]),
      description: `Portfolio for ${strategy} strategy`,
      annualContribution: strategy === 'increased_savings' ? profile.totalAnnualContribution * 1.5 : profile.totalAnnualContribution,
      retirementAge: strategy === 'delayed_retirement' ? 60 : 55,
      allocations: [
        { assetClass: 'US Large Cap Equity', targetWeight: 0.5 },
        { assetClass: 'US Bonds', targetWeight: 0.3 },
        { assetClass: 'International Equity', targetWeight: 0.1 },
        { assetClass: 'Real Estate (REITs)', targetWeight: 0.05 },
        { assetClass: 'Cash', targetWeight: 0.05 },
      ],
    }));

    const memoryKey = `${ns}:portfolioCandidates`;
    await redisClient.setEx(memoryKey, 3600, JSON.stringify(candidates));

    res.json({
      taskId, workflowId, status: 'SUCCESS',
      result: { outputKey: memoryKey, summary: `Generated ${candidates.length} portfolio allocations`, portfolioCount: candidates.length },
      metadata: { agentId: AGENT_ID, agentVersion: '2.1.0', processingTimeMs: 50, aiProvider: 'groq', aiModel: GROQ_MODEL, aiEnriched: !!aiAllocations },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      taskId: req.body.taskId, workflowId: req.body.workflowId, status: 'FAILURE',
      error: { code: 'ERROR', message: err.message }, metadata: { agentId: AGENT_ID },
      timestamp: new Date().toISOString(),
    });
  }
});

app.listen(PORT, async () => {
  console.log(`🎯 Portfolio Optimization Agent on port ${PORT}`);
  await registerWithOrchestrator();
});

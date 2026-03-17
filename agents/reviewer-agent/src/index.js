const express = require('express');
const cors = require('cors');
const { createClient } = require('redis');

const app = express();
const PORT = process.env.PORT || 8006;
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:8000';
const redisClient = createClient({ socket: { host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379 } });
redisClient.connect().catch(err => { console.error(err); process.exit(1); });

const AGENT_ID = 'reviewer-agent';

async function registerWithOrchestrator() {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: AGENT_ID,
        baseUrl: `http://localhost:${PORT}`,
        capabilities: ['strategy_review'],
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

const SYSTEM_PROMPT = `You are a governance reviewer for financial planning recommendations.
Review each strategy for coherence and alignment with user goals and risk tolerance.
Check for conflicts, unrealistic assumptions, and missing components.
Provide: APPROVE/REVIEW/REJECT recommendation with detailed rationale for each strategy.
Flag any concerns, risks, or anomalies.
Respond with valid JSON only.`;

async function groqReviewStrategies(allData) {
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
          content: `Review these strategies and all context: ${JSON.stringify(allData)}`
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

const DEFAULT_REVIEWS = (portfolios, simResults, riskScores, taxMetadata) => {
  return portfolios.map(portfolio => {
    const strategy = portfolio.strategyVariant;
    const sim = simResults[strategy] || {};
    const risk = riskScores[portfolio.portfolioId] || {};
    const tax = taxMetadata.find(t => t.portfolioId === portfolio.portfolioId) || {};

    const coherenceChecks = {
      riskProfileConsistency: portfolio.riskProfile && risk.compositeRiskScore ? true : false,
      expectedReturnRealistic: portfolio.expectedAnnualReturn > 0 && portfolio.expectedAnnualReturn < 0.15,
      successProbabilityValid: sim.successProbability >= 0 && sim.successProbability <= 1,
      volatilityWithinBounds: risk.portfolioVolatility >= 0 && risk.portfolioVolatility <= 0.5,
      taxOptimizationPresent: tax.withdrawalOrder && tax.withdrawalOrder.length > 0,
    };

    const passedChecks = Object.values(coherenceChecks).filter(c => c).length;
    const totalChecks = Object.keys(coherenceChecks).length;
    const coherenceScore = (passedChecks / totalChecks) * 100;

    const flags = [];
    if (!coherenceChecks.riskProfileConsistency) flags.push('Risk profile mismatch');
    if (!coherenceChecks.expectedReturnRealistic) flags.push('Unrealistic return projection');
    if (!coherenceChecks.successProbabilityValid) flags.push('Invalid success probability');
    if (!coherenceChecks.volatilityWithinBounds) flags.push('Excessive volatility');
    if (!coherenceChecks.taxOptimizationPresent) flags.push('No tax strategy defined');

    const recommendation = coherenceScore >= 80 ? 'APPROVE' : coherenceScore >= 60 ? 'REVIEW' : 'REJECT';

    return {
      portfolioId: portfolio.portfolioId,
      strategyVariant: strategy,
      coherenceScore,
      passedChecks: `${passedChecks}/${totalChecks}`,
      coherenceChecks,
      flags,
      recommendation,
      reviewedAt: new Date().toISOString(),
    };
  });
};

app.use(express.json()).use(cors());
app.get('/health', (req, res) => res.json({ status: 'healthy', agentId: AGENT_ID }));

app.post('/executeTask', async (req, res) => {
  const startTime = Date.now();
  try {
    const { taskId, workflowId, context } = req.body;
    const ns = context.sharedMemoryNamespace;

    // Fetch all strategy-related data from Redis
    const profile = JSON.parse(await redisClient.get(`${ns}:financialProfile`) || '{}');
    const simResults = JSON.parse(await redisClient.get(`${ns}:simulationResults`) || '{}');
    const portfolios = JSON.parse(await redisClient.get(`${ns}:portfolioCandidates`) || '[]');
    const riskScores = JSON.parse(await redisClient.get(`${ns}:riskScores`) || '{}');
    const taxMetadata = JSON.parse(await redisClient.get(`${ns}:taxMetadata`) || '[]');

    const allData = { profile, simResults, portfolios, riskScores, taxMetadata };
    const aiReviews = await groqReviewStrategies(allData);
    const reviews = aiReviews || DEFAULT_REVIEWS(portfolios, simResults, riskScores, taxMetadata);

    const memoryKey = `${ns}:governanceReviews`;
    await redisClient.setEx(memoryKey, 3600, JSON.stringify(reviews));

    const approvedCount = reviews.filter(r => r.recommendation === 'APPROVE').length;
    const flagCount = reviews.reduce((sum, r) => sum + r.flags.length, 0);

    res.json({
      taskId, workflowId, status: 'SUCCESS',
      result: {
        outputKey: memoryKey,
        summary: `Governance review complete: ${approvedCount} strategies approved, ${flagCount} issues flagged`,
        reviewCount: reviews.length,
        approvedCount,
        flagCount,
      },
      metadata: { agentId: AGENT_ID, agentVersion: '2.1.0', processingTimeMs: Date.now() - startTime, aiProvider: 'groq', aiModel: GROQ_MODEL, aiEnriched: !!aiReviews },
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
  console.log(`✅ Reviewer Agent on port ${PORT}`);
  await registerWithOrchestrator();
});

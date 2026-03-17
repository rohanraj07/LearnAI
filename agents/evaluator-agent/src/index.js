const express = require('express');
const cors = require('cors');
const { createClient } = require('redis');

const app = express();
const PORT = process.env.PORT || 8007;
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:8000';
const redisClient = createClient({ socket: { host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379 } });
redisClient.connect().catch(err => { console.error(err); process.exit(1); });

const AGENT_ID = 'evaluator-agent';

async function registerWithOrchestrator() {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: AGENT_ID,
        baseUrl: `http://localhost:${PORT}`,
        capabilities: ['strategy_ranking'],
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

const SYSTEM_PROMPT = `You are a financial advisor synthesizing all analysis to rank retirement strategies.
Consider all inputs holistically:
- User's profile, timeline, and goals
- Simulation success rates and outcomes
- Tax efficiency and optimization
- Risk alignment and governance review results
Rank strategies 1-5 with composite scores and detailed written justification for each rank.
Highlight the single best recommendation for this specific user's situation.
Respond with valid JSON only.`;

async function groqRankStrategies(allData, weights) {
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
          content: `Weights: ${JSON.stringify(weights)}\n\nData: ${JSON.stringify(allData)}`
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

const DEFAULT_RANKINGS = (reviews, simResults, riskScores, taxMetadata, weights) => {
  return reviews
    .map(review => {
      const strategy = review.strategyVariant;
      const sim = simResults[strategy] || {};
      const risk = riskScores[review.portfolioId] || {};
      const tax = taxMetadata.find(t => t.strategyVariant === strategy) || {};

      const successScore = (sim.successProbability || 0) * 100;
      const returnScore = Math.min((risk.expectedAnnualReturn || 0) * 500, 100);
      const riskAdjustedReturn = successScore * 0.7 + returnScore * 0.3;
      const taxEfficiency = Math.max(0, 100 - ((tax.effectiveTaxRateRetirement || 0.15) * 333));

      const compositeScore =
        (successScore * weights.successProbability) +
        (riskAdjustedReturn * weights.riskAdjustedReturn) +
        (taxEfficiency * weights.taxEfficiency);

      return {
        rank: 0,
        portfolioId: review.portfolioId,
        strategyVariant: strategy,
        compositeScore: Math.round(compositeScore * 10) / 10,
        metrics: {
          successProbability: Math.round(successScore),
          riskAdjustedReturn: Math.round(riskAdjustedReturn),
          taxEfficiency: Math.round(taxEfficiency),
        },
        governanceRecommendation: review.recommendation,
        governanceFlags: review.flags,
        details: {
          expectedReturn: `${((risk.expectedAnnualReturn || 0) * 100).toFixed(1)}%`,
          volatility: `${((risk.portfolioVolatility || 0) * 100).toFixed(1)}%`,
          maxDrawdown: `${((risk.maxDrawdown || 0) * 100).toFixed(1)}%`,
          taxRate: `${((tax.effectiveTaxRateRetirement || 0) * 100).toFixed(1)}%`,
        },
      };
    })
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .map((s, idx) => ({ ...s, rank: idx + 1 }));
};

app.use(express.json()).use(cors());
app.get('/health', (req, res) => res.json({ status: 'healthy', agentId: AGENT_ID }));

app.post('/executeTask', async (req, res) => {
  const startTime = Date.now();
  try {
    const { taskId, workflowId, context, payload } = req.body;
    const ns = context.sharedMemoryNamespace;

    const reviews = JSON.parse(await redisClient.get(`${ns}:governanceReviews`) || '[]');
    const simResults = JSON.parse(await redisClient.get(`${ns}:simulationResults`) || '{}');
    const riskScores = JSON.parse(await redisClient.get(`${ns}:riskScores`) || '{}');
    const taxMetadata = JSON.parse(await redisClient.get(`${ns}:taxMetadata`) || '[]');

    const weights = payload.scoringWeights || {
      successProbability: 0.4,
      riskAdjustedReturn: 0.3,
      taxEfficiency: 0.3,
    };

    const allData = { reviews, simResults, riskScores, taxMetadata };
    const aiRankings = await groqRankStrategies(allData, weights);
    const rankedStrategies = aiRankings || DEFAULT_RANKINGS(reviews, simResults, riskScores, taxMetadata, weights);

    const memoryKey = `${ns}:strategyRankings`;
    await redisClient.setEx(memoryKey, 3600, JSON.stringify(rankedStrategies));

    res.json({
      taskId, workflowId, status: 'SUCCESS',
      result: {
        outputKey: memoryKey,
        summary: `Strategies ranked: ${rankedStrategies.length} total, top recommendation is ${rankedStrategies[0]?.strategyVariant || 'N/A'}`,
        topRankedStrategy: rankedStrategies[0] || null,
        rankingCount: rankedStrategies.length,
      },
      metadata: { agentId: AGENT_ID, agentVersion: '2.1.0', processingTimeMs: Date.now() - startTime, aiProvider: 'groq', aiModel: GROQ_MODEL, aiEnriched: !!aiRankings },
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
  console.log(`🏆 Evaluator Agent on port ${PORT}`);
  await registerWithOrchestrator();
});

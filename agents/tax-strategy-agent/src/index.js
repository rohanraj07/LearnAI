const express = require('express');
const cors = require('cors');
const { createClient } = require('redis');

const app = express();
const PORT = process.env.PORT || 8004;
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:8000';
const redisClient = createClient({ socket: { host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379 } });
redisClient.connect().catch(err => { console.error(err); process.exit(1); });

const AGENT_ID = 'tax-strategy-agent';

async function registerWithOrchestrator() {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: AGENT_ID,
        baseUrl: `http://localhost:${PORT}`,
        capabilities: ['tax_strategy'],
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

const SYSTEM_PROMPT = `You are a CPA specializing in retirement tax optimization.
Analyze financial situations and recommend tax strategies.
Consider: income level, account types, tax brackets, Roth conversion opportunities.
Provide: effective/marginal tax rates, optimal withdrawal order, conversion recommendations, estimated tax savings.
Respond with valid JSON only.`;

async function groqComputeTaxStrategy(profile, portfolioCandidates) {
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
          content: `Profile: ${JSON.stringify(profile)}\n\nPortfolios: ${JSON.stringify(portfolioCandidates)}`
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

const DEFAULT_TAX_METADATA = (candidates) => candidates.map(p => ({
  portfolioId: p.portfolioId,
  strategyVariant: p.strategyVariant,
  effectiveTaxRateAccumulation: 0.22,
  marginalTaxRateAccumulation: 0.24,
  effectiveTaxRateRetirement: 0.15,
  capitalGainsRateRetirement: 0.15,
  withdrawalOrder: ['brokerage', '401k', 'Roth_IRA'],
  rothConversionRecommended: p.strategyVariant === 'aggressive',
  estimatedLifetimeTaxSavings: p.strategyVariant === 'delayed_retirement' ? 42000 : p.strategyVariant === 'increased_savings' ? 31000 : 0,
}));

app.use(express.json()).use(cors());
app.get('/health', (req, res) => res.json({ status: 'healthy', agentId: AGENT_ID }));

app.post('/executeTask', async (req, res) => {
  const startTime = Date.now();
  try {
    const { taskId, workflowId, context } = req.body;
    const ns = context.sharedMemoryNamespace;
    const profileJson = await redisClient.get(`${ns}:financialProfile`);
    const profile = JSON.parse(profileJson);
    const candidates = JSON.parse(await redisClient.get(`${ns}:portfolioCandidates`));

    const aiTaxMetadata = await groqComputeTaxStrategy(profile, candidates);
    const taxMetadata = aiTaxMetadata || DEFAULT_TAX_METADATA(candidates);

    const memoryKey = `${ns}:taxMetadata`;
    await redisClient.setEx(memoryKey, 3600, JSON.stringify(taxMetadata));

    res.json({
      taskId, workflowId, status: 'SUCCESS',
      result: { outputKey: memoryKey, summary: `Tax strategy computed for ${taxMetadata.length} portfolios` },
      metadata: { agentId: AGENT_ID, agentVersion: '2.1.0', processingTimeMs: Date.now() - startTime, aiProvider: 'groq', aiModel: GROQ_MODEL, aiEnriched: !!aiTaxMetadata },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ taskId: req.body.taskId, workflowId: req.body.workflowId, status: 'FAILURE', error: { code: 'ERROR', message: err.message }, metadata: { agentId: AGENT_ID }, timestamp: new Date().toISOString() });
  }
});

app.listen(PORT, async () => {
  console.log(`💰 Tax Strategy Agent on port ${PORT}`);
  await registerWithOrchestrator();
});

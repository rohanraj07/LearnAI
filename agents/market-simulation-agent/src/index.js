const express = require('express');
const cors = require('cors');
const { createClient } = require('redis');

const app = express();
const PORT = process.env.PORT || 8002;
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:8000';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

app.use(express.json());
app.use(cors());

const redisClient = createClient({
  socket: { host: REDIS_HOST, port: REDIS_PORT },
});

redisClient.connect().catch(err => {
  console.error('Redis error:', err);
  process.exit(1);
});

const AGENT_ID = 'market-simulation-agent';

async function registerWithOrchestrator() {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: AGENT_ID,
        baseUrl: `http://localhost:${PORT}`,
        capabilities: ['monte_carlo_simulation'],
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

// ── Groq AI Integration ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a quantitative financial analyst specializing in Monte Carlo retirement simulations.
Your role is to interpret simulation results and provide insights:
1. What the success probabilities mean for this user's retirement security
2. Key risks in each strategy variant
3. Recommendations for parameter adjustments based on risk tolerance and timeline
4. Qualitative assessment of outcome distributions

Respond ONLY with valid JSON. Do not include markdown, explanations, or any text outside the JSON object.`;

async function groqInterpretSimulations(profile, results) {
  if (!process.env.GROQ_API_KEY) {
    console.log('[Groq] API key not set, skipping interpretation');
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
          content: `User profile: Age ${profile.age}, retirement target ${profile.retirementAge}, risk tolerance ${profile.riskTolerance}\n\nSimulation results:\n${JSON.stringify(results, null, 2)}`
        }],
        max_tokens: 1500,
        temperature: 0.3
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'Groq API error');
    }

    const content = data.choices[0].message.content;
    return JSON.parse(content);
  } catch (err) {
    console.error('[Groq] Error calling API:', err.message);
    return null;
  }
}

// ── Knowledge Graph: Asset Return Distributions ──────────────────────────────

const ASSET_CLASSES = {
  US_LARGE_CAP: { mean: 0.10, stddev: 0.18 },
  US_BONDS: { mean: 0.04, stddev: 0.06 },
  INTL_EQUITY: { mean: 0.08, stddev: 0.20 },
  REAL_ESTATE: { mean: 0.07, stddev: 0.15 },
  CASH: { mean: 0.035, stddev: 0.005 },
};

const INFLATION_MODEL = { mean: 0.03, stddev: 0.01 };

const STRATEGY_ALLOCATIONS = {
  baseline: {
    US_LARGE_CAP: 0.5,
    US_BONDS: 0.3,
    INTL_EQUITY: 0.1,
    REAL_ESTATE: 0.05,
    CASH: 0.05,
  },
  aggressive: {
    US_LARGE_CAP: 0.7,
    US_BONDS: 0.1,
    INTL_EQUITY: 0.15,
    REAL_ESTATE: 0.05,
    CASH: 0.0,
  },
  conservative: {
    US_LARGE_CAP: 0.3,
    US_BONDS: 0.5,
    INTL_EQUITY: 0.05,
    REAL_ESTATE: 0.05,
    CASH: 0.1,
  },
  delayed_retirement: {
    US_LARGE_CAP: 0.55,
    US_BONDS: 0.25,
    INTL_EQUITY: 0.1,
    REAL_ESTATE: 0.07,
    CASH: 0.03,
  },
  increased_savings: {
    US_LARGE_CAP: 0.5,
    US_BONDS: 0.3,
    INTL_EQUITY: 0.1,
    REAL_ESTATE: 0.05,
    CASH: 0.05,
  },
};

// ── Gaussian Random Number Generator ──────────────────────────────────────────

function randomGaussian(mean = 0, stddev = 1) {
  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + stddev * z0;
}

// ── Monte Carlo Simulation ───────────────────────────────────────────────────

function runMonteCarlo(profile, strategy, numSimulations) {
  const baseRetirementAge = profile.retirementAge;
  const retirementAge = baseRetirementAge + (strategy === 'delayed_retirement' ? 5 : 0);
  const yearsToRetirement = retirementAge - profile.age;
  const lifeExpectancy = 90;
  const retirementYears = lifeExpectancy - retirementAge;

  const initialBalance = profile.totalSavings;
  let annualContribution = profile.totalAnnualContribution;
  if (strategy === 'increased_savings') {
    annualContribution *= 1.5;
  }
  const targetIncome = profile.targetRetirementIncome;
  const allocation = STRATEGY_ALLOCATIONS[strategy];

  let successCount = 0;
  const endBalances = [];

  for (let sim = 0; sim < numSimulations; sim++) {
    let balance = initialBalance;

    // Accumulation phase
    for (let year = 0; year < Math.max(yearsToRetirement, 0); year++) {
      // Calculate portfolio return
      let portfolioReturn = 0;
      for (const [asset, weight] of Object.entries(allocation)) {
        const params = ASSET_CLASSES[asset];
        const assetReturn = randomGaussian(params.mean, params.stddev);
        portfolioReturn += weight * assetReturn;
      }

      balance = balance * (1 + portfolioReturn) + annualContribution;
    }

    // Distribution phase
    let failed = false;
    for (let year = 0; year < Math.max(retirementYears, 0); year++) {
      let portfolioReturn = 0;
      for (const [asset, weight] of Object.entries(allocation)) {
        const params = ASSET_CLASSES[asset];
        const assetReturn = randomGaussian(params.mean, params.stddev);
        portfolioReturn += weight * assetReturn;
      }

      const inflation = randomGaussian(INFLATION_MODEL.mean, INFLATION_MODEL.stddev);
      const withdrawal = targetIncome * Math.pow(1 + inflation, year);
      balance = balance * (1 + portfolioReturn) - withdrawal;

      if (balance <= 0) {
        failed = true;
        break;
      }
    }

    if (!failed) {
      successCount++;
    }
    endBalances.push(Math.max(balance, 0));
  }

  // Calculate percentiles
  const sorted = endBalances.sort((a, b) => a - b);
  const p10 = sorted[Math.floor(sorted.length * 0.1)];
  const p25 = sorted[Math.floor(sorted.length * 0.25)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  const median = sorted[Math.floor(sorted.length * 0.5)];

  return {
    strategyVariant: strategy,
    retirementAge,
    yearsToRetirement,
    numSimulations,
    successProbability: Math.round((successCount / numSimulations) * 10000) / 10000,
    medianEndBalance: Math.round(median),
    percentile10EndBalance: Math.round(p10),
    percentile25EndBalance: Math.round(p25),
    percentile75EndBalance: Math.round(p75),
    percentile90EndBalance: Math.round(p90),
    allocation,
  };
}

// ── Routes ──────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', agentId: AGENT_ID });
});

app.post('/executeTask', async (req, res) => {
  const startTime = Date.now();
  const task = req.body;

  if (task.taskType !== 'RUN_MONTE_CARLO') {
    return res.status(400).json({ error: `Unsupported taskType: ${task.taskType}` });
  }

  try {
    const ns = task.context.sharedMemoryNamespace;
    const profileJson = await redisClient.get(`${ns}:financialProfile`);

    if (!profileJson) {
      throw new Error('financialProfile not found in shared memory');
    }

    const profile = JSON.parse(profileJson);
    const results = {};
    const variantSummary = {};

    for (const strategy of task.payload.strategyVariants) {
      const simResult = runMonteCarlo(profile, strategy, task.payload.numSimulations);
      results[strategy] = simResult;
      variantSummary[strategy] = {
        successProbability: simResult.successProbability,
        medianEndBalance: simResult.medianEndBalance,
      };
    }

    // Enrich results with Groq AI interpretation
    const aiInterpretation = await groqInterpretSimulations(profile, results);
    const enrichedResults = {
      ...results,
      ...(aiInterpretation && { aiInterpretation })
    };

    const memoryKey = `${ns}:simulationResults`;
    await redisClient.setEx(memoryKey, 3600, JSON.stringify(enrichedResults));

    const processingMs = Date.now() - startTime;

    res.json({
      taskId: task.taskId,
      workflowId: task.workflowId,
      status: 'SUCCESS',
      result: {
        outputKey: memoryKey,
        summary: `Completed ${task.payload.numSimulations}-run Monte Carlo simulation across ${task.payload.strategyVariants.length} strategy variants.`,
        variantSummary,
      },
      metadata: {
        agentId: AGENT_ID,
        agentVersion: '2.1.0',
        processingTimeMs: processingMs,
        knowledgeGraphVersion: 'market-model-v2',
        aiProvider: 'groq',
        aiModel: GROQ_MODEL,
        aiEnriched: !!aiInterpretation,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({
      taskId: task.taskId,
      workflowId: task.workflowId,
      status: 'FAILURE',
      error: { code: 'SIMULATION_ERROR', message: err.message, retryable: true },
      metadata: { agentId: AGENT_ID },
      timestamp: new Date().toISOString(),
    });
  }
});

app.listen(PORT, async () => {
  console.log(`📈 Market Simulation Agent listening on port ${PORT}`);
  await registerWithOrchestrator();
});

const express = require('express');
const cors = require('cors');
const { createClient } = require('redis');

const app = express();
const PORT = process.env.PORT || 8001;
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

const AGENT_ID = 'financial-profile-agent';

async function registerWithOrchestrator() {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: AGENT_ID,
        baseUrl: `http://localhost:${PORT}`,
        capabilities: ['profile_analysis'],
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

const SYSTEM_PROMPT = `You are a certified financial advisor specializing in retirement planning and financial profiling.
Your role is to analyze a user's financial situation and provide a comprehensive assessment including:
1. Financial health metrics and ratios
2. Risk factors and concerns
3. Strengths in their financial profile
4. Recommendations for improvement

Respond ONLY with valid JSON. Do not include markdown, explanations, or any text outside the JSON object.`;

async function groqAnalyzeProfile(profile) {
  if (!process.env.GROQ_API_KEY) {
    console.log('[Groq] API key not set, skipping enrichment');
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
          content: `Analyze this financial profile and provide a health assessment:\n${JSON.stringify(profile, null, 2)}`
        }],
        max_tokens: 1024,
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

// ── Knowledge Graph ─────────────────────────────────────────────────────────

const ACCOUNT_TAX_TREATMENT = {
  '401k': 'pre_tax',
  'IRA': 'pre_tax',
  'Roth_IRA': 'post_tax',
  'brokerage': 'post_tax',
  'savings': 'post_tax',
};

function buildFinancialProfile(payload, userId) {
  const yearsToRetirement = payload.retirementAge - payload.age;
  const annualExpenses = payload.monthlyExpenses * 12;
  const savingsRate = payload.annualIncome > 0
    ? (payload.annualIncome - annualExpenses) / payload.annualIncome
    : 0;

  const netMonthlyContribution = (payload.accounts || []).reduce((sum, acc) => {
    return sum + acc.monthlyContribution * (1 + (acc.employerMatch || 0));
  }, 0);

  const totalAnnualContribution = netMonthlyContribution * 12;

  const accountBreakdown = (payload.accounts || []).map(acc => ({
    type: acc.type,
    balance: acc.balance,
    monthlyContribution: acc.monthlyContribution,
    employerMatch: acc.employerMatch || 0,
    annualContribution: acc.monthlyContribution * 12,
    employerContribution: acc.monthlyContribution * (acc.employerMatch || 0) * 12,
    taxTreatment: ACCOUNT_TAX_TREATMENT[acc.type] || 'post_tax',
  }));

  const totalLiability = (payload.liabilities || []).reduce((sum, l) => sum + l.balance, 0);
  const totalMonthlyDebtService = (payload.liabilities || []).reduce((sum, l) => sum + l.monthlyPayment, 0);
  const netWorth = payload.totalSavings - totalLiability;
  const debtToIncome = payload.annualIncome > 0 ? totalLiability / payload.annualIncome : 0;

  return {
    userId,
    age: payload.age,
    retirementAge: payload.retirementAge,
    yearsToRetirement,
    annualIncome: payload.annualIncome,
    monthlyExpenses: payload.monthlyExpenses,
    annualExpenses,
    savingsRate: Math.round(savingsRate * 10000) / 10000,
    riskTolerance: payload.riskTolerance,
    totalSavings: payload.totalSavings,
    netMonthlyContribution: Math.round(netMonthlyContribution * 100) / 100,
    totalAnnualContribution: Math.round(totalAnnualContribution * 100) / 100,
    accounts: accountBreakdown,
    liabilities: payload.liabilities || [],
    totalLiability,
    totalMonthlyDebtService,
    netWorth: Math.round(netWorth * 100) / 100,
    debtToIncomeRatio: Math.round(debtToIncome * 10000) / 10000,
    targetRetirementIncome: annualExpenses * 1.1,
  };
}

// ── Routes ──────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', agentId: AGENT_ID });
});

app.post('/executeTask', async (req, res) => {
  const startTime = Date.now();
  const task = req.body;

  if (task.taskType !== 'PROFILE_USER') {
    return res.status(400).json({ error: `Unsupported taskType: ${task.taskType}` });
  }

  try {
    const profile = buildFinancialProfile(task.payload, task.context.userId);

    // Enrich profile with Groq AI analysis
    const aiAnalysis = await groqAnalyzeProfile(profile);
    const enrichedProfile = {
      ...profile,
      ...(aiAnalysis && { aiAnalysis })
    };

    const memoryKey = `${task.context.sharedMemoryNamespace}:financialProfile`;
    await redisClient.setEx(memoryKey, 3600, JSON.stringify(enrichedProfile));

    const processingMs = Date.now() - startTime;

    res.json({
      taskId: task.taskId,
      workflowId: task.workflowId,
      status: 'SUCCESS',
      result: {
        outputKey: memoryKey,
        summary: `Financial profile for ${task.context.userId}, age ${profile.age}, ${profile.riskTolerance} risk tolerance`,
        netMonthlyContribution: profile.netMonthlyContribution,
        yearsToRetirement: profile.yearsToRetirement,
        currentSavingsRate: profile.savingsRate,
        netWorth: profile.netWorth,
      },
      metadata: {
        agentId: AGENT_ID,
        agentVersion: '2.1.0',
        processingTimeMs: processingMs,
        knowledgeGraphVersion: 'financial-profile-v2',
        aiProvider: 'groq',
        aiModel: GROQ_MODEL,
        aiEnriched: !!aiAnalysis,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({
      taskId: task.taskId,
      workflowId: task.workflowId,
      status: 'FAILURE',
      error: { code: 'PROFILE_BUILD_ERROR', message: err.message, retryable: false },
      metadata: { agentId: AGENT_ID },
      timestamp: new Date().toISOString(),
    });
  }
});

app.listen(PORT, async () => {
  console.log(`💰 Financial Profile Agent listening on port ${PORT}`);
  await registerWithOrchestrator();
});

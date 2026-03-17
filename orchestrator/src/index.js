const express = require('express');
const cors = require('cors');
const { createClient } = require('redis');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { createWorkflowPlan } = require('./planner');

const app = express();
const PORT = process.env.PORT || 8000;
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

// Middleware
app.use(express.json());
app.use(cors());

// Redis client
const redisClient = createClient({
  socket: { host: REDIS_HOST, port: REDIS_PORT },
});

// Agent registry
const agentRegistry = new Map();

// ── Startup ─────────────────────────────────────────────────────────────────

async function startup() {
  try {
    await redisClient.connect();
    console.log(`📡 Redis connected to ${REDIS_HOST}:${REDIS_PORT}`);

    app.listen(PORT, () => {
      console.log(`🎯 Orchestrator listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
}

redisClient.on('error', err => console.error('Redis error:', err));

startup();

// ── Agent Registry ──────────────────────────────────────────────────────────

app.post('/register', (req, res) => {
  const { agentId, baseUrl, capabilities, version } = req.body;
  if (!agentId || !baseUrl) {
    return res.status(400).json({ error: 'agentId and baseUrl required' });
  }
  agentRegistry.set(agentId, { agentId, baseUrl, capabilities, version, timestamp: new Date() });
  console.log(`✓ Agent registered: ${agentId}`);
  res.json({ status: 'registered', agentId });
});

app.get('/agents', (req, res) => {
  res.json({ agents: Array.from(agentRegistry.values()) });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'orchestrator' });
});

// ── Task Dispatch ───────────────────────────────────────────────────────────

async function dispatchTask(task, maxRetries = 3) {
  const agent = agentRegistry.get(task.targetAgent);
  if (!agent) {
    return {
      taskId: task.taskId,
      workflowId: task.workflowId,
      status: 'FAILURE',
      error: { code: 'AGENT_NOT_FOUND', message: `Agent ${task.targetAgent} not registered`, retryable: false },
      timestamp: new Date().toISOString(),
    };
  }

  const url = `${agent.baseUrl}/executeTask`;
  const timeout = (task.timeoutMs || 30000) / 1000;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await axios.post(url, task, { timeout: timeout * 1000 });
      if (response.data.status === 'SUCCESS') {
        return response.data;
      }
      if (!response.data.error?.retryable) {
        return response.data;
      }
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (2 ** attempt)));
      }
    } catch (err) {
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (2 ** attempt)));
      } else {
        return {
          taskId: task.taskId,
          workflowId: task.workflowId,
          status: 'FAILURE',
          error: { code: 'AGENT_UNREACHABLE', message: err.message, retryable: false },
          timestamp: new Date().toISOString(),
        };
      }
    }
  }

  return {
    taskId: task.taskId,
    workflowId: task.workflowId,
    status: 'FAILURE',
    error: { code: 'MAX_RETRIES_EXCEEDED', message: 'Max retries exceeded', retryable: false },
    timestamp: new Date().toISOString(),
  };
}

// ── A2UI Surface Generation ─────────────────────────────────────────────────

function generateA2UISurfaces(finalOutputs) {
  const surfaces = [];

  // Generate profile summary surface
  if (finalOutputs.financialProfile) {
    const profile = finalOutputs.financialProfile;
    surfaces.push({
      id: 'profile-summary',
      title: 'Financial Profile Summary',
      type: 'section',
      children: [
        {
          type: 'metric-grid',
          metrics: [
            { label: 'Age', value: `${profile.age} years` },
            { label: 'Years to Retirement', value: `${profile.yearsToRetirement}` },
            { label: 'Annual Income', value: `$${(profile.annualIncome || 0).toLocaleString()}` },
            { label: 'Total Savings', value: `$${(profile.totalSavings || 0).toLocaleString()}` },
            { label: 'Net Worth', value: `$${(profile.netWorth || 0).toLocaleString()}` },
            { label: 'Savings Rate', value: `${((profile.savingsRate || 0) * 100).toFixed(1)}%` },
          ]
        }
      ]
    });
  }

  // Generate strategy rankings surface
  if (finalOutputs.strategyRankings && Array.isArray(finalOutputs.strategyRankings)) {
    const rankings = finalOutputs.strategyRankings;
    surfaces.push({
      id: 'strategy-rankings',
      title: 'Recommended Strategies (Ranked)',
      type: 'table',
      columns: [
        { key: 'rank', label: 'Rank', type: 'number' },
        { key: 'strategyVariant', label: 'Strategy', type: 'string' },
        { key: 'compositeScore', label: 'Score', type: 'number' },
        { key: 'metrics.successProbability', label: 'Success %', type: 'number' },
        { key: 'governanceRecommendation', label: 'Recommendation', type: 'string' },
      ],
      rows: rankings.map(r => ({
        rank: r.rank,
        strategyVariant: r.strategyVariant || 'N/A',
        compositeScore: (r.compositeScore || 0).toFixed(1),
        'metrics.successProbability': r.metrics?.successProbability || 0,
        governanceRecommendation: r.governanceRecommendation || 'REVIEW',
      }))
    });
  }

  // Generate risk metrics surface
  if (finalOutputs.riskScores && typeof finalOutputs.riskScores === 'object') {
    const riskEntries = Object.values(finalOutputs.riskScores).slice(0, 5);
    if (riskEntries.length > 0) {
      surfaces.push({
        id: 'risk-metrics',
        title: 'Risk Assessment',
        type: 'table',
        columns: [
          { key: 'strategyVariant', label: 'Strategy', type: 'string' },
          { key: 'portfolioVolatility', label: 'Volatility', type: 'number' },
          { key: 'sharpeRatio', label: 'Sharpe Ratio', type: 'number' },
          { key: 'maxDrawdown', label: 'Max Drawdown', type: 'number' },
        ],
        rows: riskEntries.map(r => ({
          strategyVariant: r.strategyVariant || 'N/A',
          portfolioVolatility: ((r.portfolioVolatility || 0) * 100).toFixed(1) + '%',
          sharpeRatio: (r.sharpeRatio || 0).toFixed(2),
          maxDrawdown: ((r.maxDrawdown || 0) * 100).toFixed(1) + '%',
        }))
      });
    }
  }

  return surfaces;
}

// ── Workflow Execution ──────────────────────────────────────────────────────

async function executeWorkflow(plan) {
  const { workflowId, tasks } = plan;
  const completedTaskTypes = new Set();
  const taskResults = {};

  plan.status = 'running';
  plan.startedAt = new Date().toISOString();
  await saveWorkflowState(workflowId, plan);

  // Group tasks by step
  const steps = {};
  for (const task of tasks) {
    if (!steps[task.step]) steps[task.step] = [];
    steps[task.step].push(task);
  }

  for (const stepNum of Object.keys(steps).sort((a, b) => parseInt(a) - parseInt(b))) {
    const stepTasks = steps[stepNum];
    const eligibleTasks = stepTasks.filter(t =>
      t.dependsOn.every(dep => completedTaskTypes.has(dep))
    );

    if (eligibleTasks.length === 0) {
      plan.status = 'failed';
      plan.error = `Step ${stepNum}: no eligible tasks`;
      await saveWorkflowState(workflowId, plan);
      return plan;
    }

    // Execute eligible tasks in parallel
    const results = await Promise.all(eligibleTasks.map(t => dispatchTask(t)));

    for (let i = 0; i < eligibleTasks.length; i++) {
      const task = eligibleTasks[i];
      const result = results[i];
      taskResults[task.taskType] = result;
      task.result = result;
      task.status = result.status;

      if (result.status !== 'SUCCESS') {
        plan.status = 'failed';
        plan.error = `Task ${task.taskType} failed: ${result.error?.message}`;
        await saveWorkflowState(workflowId, plan);
        return plan;
      }

      completedTaskTypes.add(task.taskType);
    }
  }

  // Collect final outputs from shared memory
  const ns = plan.sharedMemoryNamespace;
  const finalOutputs = {};
  const outputKeys = [
    'financialProfile',
    'simulationResults',
    'portfolioCandidates',
    'taxMetadata',
    'riskScores',
    'reviewFlags',
    'strategyRankings',
  ];

  for (const key of outputKeys) {
    const fullKey = `${ns}:${key}`;
    try {
      const data = await redisClient.get(fullKey);
      if (data) finalOutputs[key] = JSON.parse(data);
    } catch (err) {
      console.error(`Error reading ${fullKey}:`, err.message);
    }
  }

  plan.status = 'completed';
  plan.completedAt = new Date().toISOString();
  plan.taskResults = taskResults;
  plan.finalOutputs = finalOutputs;
  plan.uiSurfaces = generateA2UISurfaces(finalOutputs);
  await saveWorkflowState(workflowId, plan);

  return plan;
}

async function saveWorkflowState(workflowId, state) {
  try {
    await redisClient.setEx(`workflow_state:${workflowId}`, 3600, JSON.stringify(state));
  } catch (err) {
    console.error('Error saving workflow state:', err);
  }
}

// ── API Endpoints ────────────────────────────────────────────────────────────

app.post('/run', async (req, res) => {
  try {
    const userInput = req.body;
    const plan = createWorkflowPlan(userInput);
    await saveWorkflowState(plan.workflowId, plan);
    const result = await executeWorkflow(plan);
    res.json(result);
  } catch (err) {
    console.error('Workflow error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/plan', async (req, res) => {
  try {
    const plan = createWorkflowPlan(req.body);
    await saveWorkflowState(plan.workflowId, plan);
    res.json(plan);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/workflow/:workflowId', async (req, res) => {
  try {
    const data = await redisClient.get(`workflow_state:${req.params.workflowId}`);
    if (!data) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    const plan = JSON.parse(data);
    const completed = plan.tasks.filter(t => t.status === 'SUCCESS').length;
    res.json({
      workflowId: plan.workflowId,
      status: plan.status,
      completedTasks: completed,
      totalTasks: plan.tasks.length,
      results: plan.finalOutputs || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/workflow/:workflowId/results', async (req, res) => {
  try {
    const ns = req.params.workflowId;
    const planData = await redisClient.get(`workflow_state:${ns}`);

    if (!planData) {
      return res.status(404).json({ error: 'Results not available' });
    }

    const plan = JSON.parse(planData);
    const rankingsData = await redisClient.get(`${ns}:strategyRankings`);
    const profileData = await redisClient.get(`${ns}:financialProfile`);

    res.json({
      workflowId: req.params.workflowId,
      financialProfile: profileData ? JSON.parse(profileData) : null,
      strategyRankings: rankingsData ? JSON.parse(rankingsData) : null,
      uiSurfaces: plan.uiSurfaces || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

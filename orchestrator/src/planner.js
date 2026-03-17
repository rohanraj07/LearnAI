const { v4: uuidv4 } = require('uuid');

const STRATEGY_VARIANTS = [
  'baseline',
  'aggressive',
  'conservative',
  'delayed_retirement',
  'increased_savings',
];

const TASK_SEQUENCE = [
  {
    step: 1,
    taskType: 'PROFILE_USER',
    targetAgent: 'financial-profile-agent',
    dependsOn: [],
    description: 'Parse and normalize user financial data',
  },
  {
    step: 2,
    taskType: 'RUN_MONTE_CARLO',
    targetAgent: 'market-simulation-agent',
    dependsOn: ['PROFILE_USER'],
    description: 'Run 1000-path Monte Carlo simulations',
  },
  {
    step: 3,
    taskType: 'OPTIMIZE_PORTFOLIO',
    targetAgent: 'portfolio-optimization-agent',
    dependsOn: ['PROFILE_USER', 'RUN_MONTE_CARLO'],
    description: 'Generate portfolio allocations',
  },
  {
    step: 4,
    taskType: 'COMPUTE_TAX_STRATEGY',
    targetAgent: 'tax-strategy-agent',
    dependsOn: ['PROFILE_USER', 'OPTIMIZE_PORTFOLIO'],
    description: 'Compute tax efficiency',
  },
  {
    step: 4,
    taskType: 'EVALUATE_RISK',
    targetAgent: 'risk-evaluation-agent',
    dependsOn: ['RUN_MONTE_CARLO', 'OPTIMIZE_PORTFOLIO'],
    description: 'Evaluate risk metrics',
  },
  {
    step: 5,
    taskType: 'REVIEW_STRATEGY',
    targetAgent: 'reviewer-agent',
    dependsOn: ['PROFILE_USER', 'RUN_MONTE_CARLO', 'OPTIMIZE_PORTFOLIO', 'COMPUTE_TAX_STRATEGY', 'EVALUATE_RISK'],
    description: 'Governance review',
  },
  {
    step: 6,
    taskType: 'EVALUATE_AND_RANK',
    targetAgent: 'evaluator-agent',
    dependsOn: ['REVIEW_STRATEGY'],
    description: 'Score and rank strategies',
  },
];

function createWorkflowPlan(userInput) {
  const workflowId = `wf-${uuidv4().split('-')[0]}`;
  const namespace = workflowId;
  const userId = userInput.userId || 'default-user';

  const tasks = [];

  for (const template of TASK_SEQUENCE) {
    const taskId = `task-${String(template.step).padStart(3, '0')}-${template.taskType.toLowerCase().replace(/_/g, '-')}`;
    let payload;

    if (template.taskType === 'PROFILE_USER') {
      payload = {
        age: parseInt(userInput.age) || 35,
        annualIncome: parseFloat(userInput.annualIncome) || 0,
        totalSavings: parseFloat(userInput.totalSavings) || 0,
        riskTolerance: userInput.riskTolerance || 'moderate',
        retirementAge: parseInt(userInput.retirementAge) || 65,
        monthlyExpenses: parseFloat(userInput.monthlyExpenses) || 0,
        accounts: userInput.accounts || [],
        liabilities: userInput.liabilities || [],
      };
    } else if (template.taskType === 'RUN_MONTE_CARLO') {
      payload = {
        numSimulations: 1000,
        strategyVariants: STRATEGY_VARIANTS,
      };
    } else if (template.taskType === 'OPTIMIZE_PORTFOLIO') {
      payload = { strategyVariants: STRATEGY_VARIANTS };
    } else if (template.taskType === 'EVALUATE_AND_RANK') {
      payload = {
        scoringWeights: {
          successProbability: 0.4,
          riskAdjustedReturn: 0.3,
          taxEfficiency: 0.3,
        },
      };
    } else {
      payload = {};
    }

    tasks.push({
      taskId,
      workflowId,
      step: template.step,
      taskType: template.taskType,
      targetAgent: template.targetAgent,
      dependsOn: template.dependsOn,
      description: template.description,
      payload,
      context: {
        workflowId,
        userId,
        sharedMemoryNamespace: namespace,
        readKeys: [],
      },
      sourceAgent: 'orchestrator',
      retryCount: 0,
      timeoutMs: 30000,
      status: 'pending',
    });
  }

  return {
    workflowId,
    userId,
    sharedMemoryNamespace: namespace,
    strategyVariants: STRATEGY_VARIANTS,
    tasks,
    status: 'planned',
    createdAt: new Date().toISOString(),
    plannerAgent: 'planner-agent',
    userGoal: `Retire at age ${userInput.retirementAge || 65}`,
  };
}

module.exports = { createWorkflowPlan };

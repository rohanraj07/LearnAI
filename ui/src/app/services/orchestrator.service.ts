import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class OrchestratorService {
  private readonly ORCHESTRATOR_URL = 'http://localhost:8000';
  private readonly POLL_INTERVAL = 500;
  private readonly MAX_POLL_TIME = 120000; // 2 minutes

  async runWorkflow(userInput: any): Promise<any> {
    try {
      // Send workflow request
      const response = await fetch(`${this.ORCHESTRATOR_URL}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userInput),
      }).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });

      if (response.status === 'completed') {
        // Map response to component's expected structure
        const enrichedRankings = this.enrichStrategyRankings(response.finalOutputs);
        return {
          workflowId: response.workflowId,
          financialProfile: response.finalOutputs?.financialProfile,
          strategyRankings: enrichedRankings,
          uiSurfaces: response.uiSurfaces || []
        };
      }

      // Poll for results if not immediately complete
      return await this.pollWorkflowStatus(response.workflowId);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to run workflow');
    }
  }

  private enrichStrategyRankings(finalOutputs: any): any[] {
    const rankings = finalOutputs?.strategyRankings || [];
    const portfolioCandidates = finalOutputs?.portfolioCandidates || [];
    const simulationResults = finalOutputs?.simulationResults || {};

    return rankings.map((ranking: any) => {
      const portfolio = portfolioCandidates.find(
        (p: any) => p.strategyVariant === ranking.strategyVariant
      );
      const simulation = simulationResults[ranking.strategyVariant];

      return {
        ...ranking,
        strategyLabel: portfolio?.strategyLabel || ranking.strategyVariant,
        successProbability: ranking.metrics?.successProbability || 0,
        medianEndBalance: simulation?.medianEndBalance || 0
      };
    });
  }

  private async pollWorkflowStatus(workflowId: string): Promise<any> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        const elapsed = Date.now() - startTime;

        if (elapsed > this.MAX_POLL_TIME) {
          clearInterval(interval);
          reject(new Error('Workflow polling timeout'));
          return;
        }

        try {
          const status = await fetch(
            `${this.ORCHESTRATOR_URL}/workflow/${workflowId}`
          ).then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          });

          if (
            status.status === 'completed' ||
            status.status === 'failed'
          ) {
            clearInterval(interval);

            if (status.status === 'failed') {
              reject(new Error('Workflow failed'));
            } else {
              // Fetch full results
              const results = await fetch(
                `${this.ORCHESTRATOR_URL}/workflow/${workflowId}/results`
              ).then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
              });
              resolve(results);
            }
          }
        } catch (err) {
          // Continue polling on transient errors
          console.warn('Polling error:', err);
        }
      }, this.POLL_INTERVAL);
    });
  }
}

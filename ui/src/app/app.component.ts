import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { OrchestratorService } from './services/orchestrator.service';

interface WorkflowResults {
  workflowId: string;
  financialProfile: any;
  strategyRankings: any;
  uiSurfaces?: any[];
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {

  title = 'Agentic Financial Planning Platform';
  userForm!: FormGroup;
  loading = false;
  error: string | null = null;
  results: WorkflowResults | null = null;
  uiSurface: any = null;

  constructor(
    private fb: FormBuilder,
    private orchestrator: OrchestratorService
  ) {}

  ngOnInit() {
    this.initializeForm();
  }

  initializeForm() {
    this.userForm = this.fb.group({
      userId: ['user001'],
      age: [35, [Validators.required, Validators.min(18), Validators.max(100)]],
      annualIncome: [200000, [Validators.required, Validators.min(0)]],
      totalSavings: [400000, [Validators.required, Validators.min(0)]],
      riskTolerance: ['moderate', Validators.required],
      retirementAge: [55, [Validators.required, Validators.min(40), Validators.max(80)]],
      monthlyExpenses: [8000, [Validators.required, Validators.min(0)]],
    });
  }

  async onSubmit() {
    if (this.userForm.invalid) {
      this.error = 'Please fill in all required fields correctly';
      return;
    }

    this.loading = true;
    this.error = null;
    this.results = null;
    this.uiSurface = null;

    try {
      const formValue = this.userForm.value;
      const userInput = {
        ...formValue,
        accounts: [
          { type: '401k', balance: 300000, monthlyContribution: 2000, employerMatch: 0.5 },
          { type: 'brokerage', balance: 100000, monthlyContribution: 1000, employerMatch: 0 },
        ],
        liabilities: [
          { type: 'mortgage', balance: 400000, interestRate: 0.065, monthlyPayment: 2800 },
        ],
      };

      const result = await this.orchestrator.runWorkflow(userInput);
      this.results = result;

      // Extract A2UI surface if available
      if (result.uiSurfaces && result.uiSurfaces.length > 0) {
        this.uiSurface = result.uiSurfaces[0];
      }
    } catch (err: any) {
      this.error = err.message || 'An error occurred during workflow execution';
      console.error('Workflow error:', err);
    } finally {
      this.loading = false;
    }
  }

  reset() {
    this.initializeForm();
    this.results = null;
    this.error = null;
    this.uiSurface = null;
  }
}

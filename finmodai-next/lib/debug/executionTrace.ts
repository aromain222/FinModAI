export type ExecutionTraceService =
  | 'route_analyst_query'
  | 'run_public_financial_search'
  | 'run_earnings_retrieval_agent'
  | 'derive_event_linked_model_adjustment'
  | 'generate_analyst_structured_model'
  | 'revise_analyst_structured_model'
  | 'revise_analyst_structured_model_from_overrides'
  | 'generate_analyst_dcf_demo'
  | 'revise_analyst_dcf_demo'
  | 'revise_analyst_dcf_demo_from_event_shock'
  | 'smart_assumption_agent'
  | 'run_ai_smart_dcf_scenario'
  | 'run_tesla_demo_interpretation'
  | 'apply_ai_smart_dcf_to_active_dcf'
  | 'apply_ai_smart_dcf_to_new_dcf'
  | 'custom_assumption_input'
  | 'build_visualization'
  | 'generate_run_for_model_type'
  | 'generate_model_route'
  | 'financial_extraction_snapshot'
  | 'manual_inputs_adapter'
  | 'catalog_ticker_adapter'
  | 'macro_assumption_context'
  | 'company_catalyst_context'
  | 'core_engine_run_model'
  | 'local_template_builder'
  | 'sensitivity_refresh';

export type AppExecutionTrace = {
  surface: 'analyst_chat' | 'models_create';
  prompt: string;
  routeIntent?: string | null;
  modelType?: string | null;
  firedServices: ExecutionTraceService[];
  notes?: string[];
};

export function createExecutionTrace(params: {
  surface: AppExecutionTrace['surface'];
  prompt: string;
  routeIntent?: string | null;
  modelType?: string | null;
}): AppExecutionTrace {
  return {
    surface: params.surface,
    prompt: params.prompt,
    routeIntent: params.routeIntent ?? null,
    modelType: params.modelType ?? null,
    firedServices: [],
    notes: [],
  };
}

export function addExecutionTraceService(
  trace: AppExecutionTrace,
  ...services: Array<ExecutionTraceService | null | undefined | false>
): AppExecutionTrace {
  for (const service of services) {
    if (!service) continue;
    if (!trace.firedServices.includes(service)) {
      trace.firedServices.push(service);
    }
  }
  return trace;
}

export function addExecutionTraceNote(
  trace: AppExecutionTrace,
  ...notes: Array<string | null | undefined | false>
): AppExecutionTrace {
  for (const note of notes) {
    if (!note) continue;
    if (!trace.notes) trace.notes = [];
    if (!trace.notes.includes(note)) {
      trace.notes.push(note);
    }
  }
  return trace;
}

export function withExecutionTrace<T extends Record<string, unknown>>(
  payload: T,
  trace: AppExecutionTrace,
): T & { executionTrace: AppExecutionTrace } {
  return {
    ...payload,
    executionTrace: {
      ...trace,
      notes: trace.notes && trace.notes.length > 0 ? trace.notes : undefined,
    },
  };
}

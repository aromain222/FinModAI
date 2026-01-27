import { getFilePointer } from '@/lib/fileContracts';

type ReconcileResult = {
  pointer: ReturnType<typeof getFilePointer>;
  model: any | null;
};

export async function reconcileFilePointer(params: {
  supabase: any;
  modelId: string;
  userId: string;
}): Promise<ReconcileResult> {
  const { supabase, modelId, userId } = params;
  const { data: model, error } = await supabase
    .from('models')
    .select('id, user_id, r2_key, file_name, ticker, model_type, results')
    .eq('id', modelId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !model) {
    return { pointer: null, model: null };
  }

  let results = model.results;
  if (typeof results === 'string') {
    try {
      results = JSON.parse(results);
    } catch {
      results = null;
    }
  }

  const pointer = getFilePointer({ ...model, results });
  if (!pointer) return { pointer: null, model };

  if (pointer.kind === 'key' && model.r2_key !== pointer.value) {
    const filename =
      model.file_name ||
      results?.fileName ||
      `${model.ticker || 'CapitalBase'}-${model.model_type || 'model'}.xlsx`;
    await supabase
      .from('models')
      .update({ r2_key: pointer.value, file_name: filename, updated_at: new Date().toISOString() })
      .eq('id', modelId)
      .eq('user_id', userId);
  }

  return { pointer, model };
}

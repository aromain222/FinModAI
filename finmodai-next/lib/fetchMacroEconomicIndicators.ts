import { createClient } from '@supabase/supabase-js';

type MacroIndicator = {
  indicator_name: string;
  indicator_value: string | number;
  as_of: string;
  region?: string;
};

export async function fetchMacroEconomicIndicators(limit = 5): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await supabase
      .from<MacroIndicator>('macro_indicators')
      .select('indicator_name, indicator_value, as_of, region')
      .order('as_of', { ascending: false })
      .limit(limit);

    if (error || !data || data.length === 0) {
      console.warn('macro_indicators table query error', error);
      return null;
    }

    return data
      .map((row) => {
        const value =
          typeof row.indicator_value === 'number'
            ? row.indicator_value.toLocaleString(undefined, { maximumFractionDigits: 2 })
            : row.indicator_value;
        const region = row.region ? `${row.region}: ` : '';
        return `• ${region}${row.indicator_name} at ${value} (as of ${new Date(row.as_of).toLocaleDateString()})`;
      })
      .join('\n');
  } catch (error) {
    console.error('fetchMacroEconomicIndicators error', error);
    return null;
  }
}


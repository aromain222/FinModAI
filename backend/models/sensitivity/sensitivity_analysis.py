"""
Generic Sensitivity Analysis Engine.

This module provides a function to generate a 2D sensitivity table (data matrix)
by running a given model function across a range of two input variables.
"""
import numpy as np
from typing import Callable, List, Dict, Any

def generate_sensitivity_table(
    model_function: Callable,
    base_inputs: Dict[str, Any],
    variable1_name: str,
    variable1_range: List[float],
    variable2_name: str,
    variable2_range: List[float],
    output_key: str
) -> Dict[str, Any]:
    """
    Generates a 2D sensitivity table for a given model.

    Args:
        model_function: The function that runs the model (e.g., a DCF or LBO model runner).
                        It must accept a dictionary of inputs.
        base_inputs: A dictionary of the base inputs for the model.
        variable1_name: The key of the first variable to sensitize.
        variable1_range: A list or numpy array of values for the first variable.
        variable2_name: The key of the second variable to sensitize.
        variable2_range: A list or numpy array of values for the second variable.
        output_key: The key to extract the desired output value from the model's result.

    Returns:
        A dictionary containing the data table and the row/column headers.
    """
    data_table = np.zeros((len(variable1_range), len(variable2_range)))

    for i, val1 in enumerate(variable1_range):
        for j, val2 in enumerate(variable2_range):
            # Create a copy of the base inputs to avoid mutation
            current_inputs = base_inputs.copy()
            
            # Set the current values for the sensitized variables
            current_inputs[variable1_name] = val1
            current_inputs[variable2_name] = val2
            
            try:
                # Run the model with the current inputs
                model_result = model_function(**current_inputs)
                
                # Extract the desired output value
                # This part may need to be more robust to handle nested keys
                output_value = model_result.get(output_key, 0)
                data_table[i, j] = output_value
            except Exception as e:
                print(f"Error running model for sensitivity: {e}")
                data_table[i, j] = np.nan # Use NaN for errors

    return {
        "rows_variable": variable1_name,
        "rows_headers": [float(v) for v in variable1_range],
        "cols_variable": variable2_name,
        "cols_headers": [float(v) for v in variable2_range],
        "data_table": data_table.tolist(), # Convert numpy array to list for JSON serialization
    }

if __name__ == '__main__':
    # --- Example Usage with a simple dummy model ---

    def dummy_dcf_model(wacc, terminal_growth):
        # A highly simplified DCF model for demonstration
        return {"implied_share_price": 100 / (wacc - terminal_growth)}

    base_dcf_inputs = {
        # Other inputs would go here in a real model
    }
    
    wacc_range = np.arange(0.08, 0.105, 0.005) # 8.0% to 10.0%
    growth_range = np.arange(0.02, 0.0325, 0.0025) # 2.0% to 3.0%
    
    sensitivity_result = generate_sensitivity_table(
        model_function=dummy_dcf_model,
        base_inputs=base_dcf_inputs,
        variable1_name="wacc",
        variable1_range=wacc_range,
        variable2_name="terminal_growth",
        variable2_range=growth_range,
        output_key="implied_share_price"
    )

    import json
    print(json.dumps(sensitivity_result, indent=2))

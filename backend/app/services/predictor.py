import numpy as np
from typing import Dict, List
from datetime import datetime, timedelta

class JobMarketPredictor:
    """ML-based predictions for job market trends"""

    def __init__(self):
        self.historical_data = None

    def forecast_demand(self, historical_values: List[float], periods: int = 5) -> List[float]:
        """Simple exponential smoothing forecast"""
        if len(historical_values) == 0:
            return []

        alpha = 0.3
        forecast = []
        s = historical_values[0]

        for value in historical_values[1:]:
            s = alpha * value + (1 - alpha) * s

        last_value = historical_values[-1]
        growth_rate = (historical_values[-1] - historical_values[0]) / len(historical_values)

        for i in range(periods):
            last_value = last_value + growth_rate
            forecast.append(max(0, last_value))

        return forecast

    def predict_skill_demand(self, historical_skills: Dict[str, List[float]]) -> Dict[str, List[float]]:
        """Predict future skill demand"""
        predictions = {}
        for skill, values in historical_skills.items():
            predictions[skill] = self.forecast_demand(values, periods=5)
        return predictions

    def forecast_salary(self, historical_salary: List[float], periods: int = 5) -> List[float]:
        """Forecast salary trends"""
        if len(historical_salary) < 2:
            return historical_salary.copy()

        # Calculate trend
        changes = np.diff(historical_salary)
        avg_change = np.mean(changes)

        forecast = list(historical_salary)
        for i in range(periods):
            next_value = forecast[-1] + avg_change * (0.95 ** i)
            forecast.append(max(0, next_value))

        return forecast[-periods:]

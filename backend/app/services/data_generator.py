import pandas as pd
import numpy as np
from datetime import datetime, timedelta

def generate_demo_data(rows: int = 5000) -> pd.DataFrame:
    """Generate realistic demo job market data for 2021-2026"""

    np.random.seed(42)

    positions = [
        "Junior Python Developer", "Mid Python Developer", "Senior Python Developer",
        "Junior Frontend Developer", "Mid React Developer", "Senior Full Stack",
        "Data Engineer", "ML Engineer", "Data Scientist",
        "DevOps Engineer", "Cloud Architect",
        "QA Engineer", "Product Manager", "Technical Lead"
    ]

    cities = ["Warszawa", "Kraków", "Wrocław", "Poznań", "Gdańsk", "Łódź", "Zielona Góra"]

    skills = [
        "Python", "JavaScript", "TypeScript", "Java", "C#",
        "React", "Vue.js", "Angular",
        "SQL", "PostgreSQL", "MongoDB",
        "AWS", "Azure", "GCP",
        "Docker", "Kubernetes",
        "Git", "CI/CD",
        "Machine Learning", "TensorFlow", "PyTorch",
        "FastAPI", "Django", "Node.js"
    ]

    # Generate dates from 2021-01-01 to 2026-12-31
    date_range = pd.date_range(start="2021-01-01", end="2026-12-31", freq='D')

    data = []
    for i in range(rows):
        # More job postings over time
        month_offset = (i * 12 / rows)
        date = date_range[int(min(len(date_range) - 1, len(date_range) * (i / rows)))]

        position = np.random.choice(positions)

        # Salary based on position level
        if "Senior" in position:
            salary_min = np.random.normal(10000, 2000)
            salary_max = salary_min + np.random.normal(4000, 1000)
        elif "Mid" in position or "Engineer" in position:
            salary_min = np.random.normal(6500, 1500)
            salary_max = salary_min + np.random.normal(2500, 800)
        else:
            salary_min = np.random.normal(4000, 1000)
            salary_max = salary_min + np.random.normal(1500, 500)

        # Salary growth over years
        year = date.year
        salary_multiplier = 1 + (year - 2021) * 0.07
        salary_min *= salary_multiplier
        salary_max *= salary_multiplier

        # Requirements grow over time (more AI/ML after 2023)
        required_count = np.random.randint(3, 8)
        if year >= 2023:
            # Higher chance of AI/ML related skills
            if np.random.random() > 0.7:
                required = list(np.random.choice(["Machine Learning", "TensorFlow", "PyTorch", "Python"], required_count))
            else:
                required = list(np.random.choice(skills, required_count))
        else:
            required = list(np.random.choice(skills, required_count))

        data.append({
            "id": i,
            "date": date,
            "position": position,
            "city": np.random.choice(cities),
            "company": f"Company_{np.random.randint(1, 500)}",
            "salary_min": int(max(0, salary_min)),
            "salary_max": int(max(0, salary_max)),
            "required_skills": ", ".join(required),
            "experience_level": position.split()[0],
            "contract_type": np.random.choice(["UOP", "B2B", "Umowa o dzieło"]),
            "remote": np.random.choice(["Full remote", "Hybrid", "On-site"], p=[0.4, 0.4, 0.2]),
        })

    df = pd.DataFrame(data)
    df = df.sort_values('date').reset_index(drop=True)

    return df

class NLPAnalyzer:
    def __init__(self):
        self.keywords = {}

    def extract_keywords(self, texts, limit=20):
        """Extract keywords from job descriptions"""
        from collections import Counter
        all_words = []
        for text in texts:
            words = text.lower().split()
            all_words.extend(words)

        counter = Counter(all_words)
        return counter.most_common(limit)

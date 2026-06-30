from typing import List, Dict
from collections import Counter

class NLPAnalyzer:
    """NLP analysis for job market data"""

    def __init__(self):
        self.technical_skills = {
            "Python", "JavaScript", "TypeScript", "Java", "C#", "Go", "Rust",
            "React", "Vue", "Angular", "Node", "Django", "FastAPI",
            "SQL", "PostgreSQL", "MongoDB", "Redis",
            "AWS", "Azure", "GCP", "Kubernetes", "Docker",
            "Machine Learning", "TensorFlow", "PyTorch", "Pandas",
            "LLM", "Generative AI", "Deep Learning"
        }

    def extract_skills(self, text: str) -> List[str]:
        """Extract technical skills from text"""
        text_upper = text.upper()
        found_skills = []
        for skill in self.technical_skills:
            if skill.upper() in text_upper:
                found_skills.append(skill)
        return found_skills

    def analyze_job_description(self, description: str) -> Dict:
        """Analyze job description for key metrics"""
        skills = self.extract_skills(description)
        word_count = len(description.split())

        return {
            "skills_count": len(skills),
            "skills": skills,
            "word_count": word_count,
            "complexity": "high" if len(skills) > 5 else "medium" if len(skills) > 2 else "low"
        }

    def extract_keywords_from_texts(self, texts: List[str], limit: int = 20) -> List[tuple]:
        """Extract most common keywords from multiple texts"""
        all_words = []
        for text in texts:
            words = [w.lower() for w in text.split() if len(w) > 3]
            all_words.extend(words)

        counter = Counter(all_words)
        return counter.most_common(limit)

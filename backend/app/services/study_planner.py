"""
"Zaplanuj swoje studia" — two-stage flow:
  1. discover_kierunki() (see university_corpus.py) finds which kierunki have
     efekty/treści matching what the user is interested in.
  2. Given the kierunki the user actually picks from that list, this module
     resolves the actual PRZEDMIOTY (courses, from the full university-wide
     syllabus database) that teach them, filtered by poziom (LIC/MGR/MIXED)
     and forma (STACJ/NIESTACJ/MIXED), and aggregates total hours per rok
     and assessment counts per semester.
"""
from collections import Counter
from typing import Optional

from app.services import syllabus_corpus


def courses_for_kierunki(kierunki: list[str], poziom: str = "MIXED", forma: str = "MIXED") -> list[str]:
    """Every course UUID taught within any of the given kierunki (fuzzy-
    matched against the syllabus-scraped kierunek names — see
    syllabus_corpus.resolve_kierunek_variants), restricted to variants
    matching poziom/forma."""
    seen = set()
    course_uuids = []
    for name in kierunki:
        for variant in syllabus_corpus.resolve_kierunek_variants(name, poziom, forma):
            for uuid in variant.get("course_uuids", []):
                if uuid not in seen:
                    seen.add(uuid)
                    course_uuids.append(uuid)
    return course_uuids


def build_plan(course_uuids: list[str], poziom: str = "MIXED", forma: str = "MIXED",
               max_godzin_semestr: Optional[int] = None, min_ects_semestr: Optional[float] = None) -> dict:
    """max_godzin_semestr/min_ects_semestr are constraints for planning
    purposes only — they don't drop przedmioty from the result (the corpus
    doesn't support picking a subset of alternatives per semester), they
    flag which semesters violate them so you can see where the aggregated
    plan is over/under-loaded and manually trim or add przedmioty."""
    courses = syllabus_corpus.load_courses()

    przedmioty = []
    seen = set()
    for uuid in course_uuids:
        if uuid in seen:
            continue
        seen.add(uuid)
        syl = courses.get(uuid)
        if not syl:
            continue

        variants = syllabus_corpus.course_to_kierunki(uuid)
        variants = [
            v for v in variants
            if syllabus_corpus.poziom_matches(v, poziom) and syllabus_corpus.forma_matches(v, forma)
        ]
        if not variants:
            continue

        schedule = syl.get("schedule", {})
        zajecia = schedule.get("zajecia", [])
        total_godziny = sum(z.get("godziny", 0) for z in zajecia)

        przedmioty.append({
            "uuid": uuid,
            "title": syl.get("title", ""),
            "kierunki": sorted({v["kierunek"] for v in variants}),
            "semestr": schedule.get("semestr"),
            "rok": schedule.get("rok"),
            "zajecia": zajecia,
            "total_godziny": total_godziny,
            "forma_zaliczenia": schedule.get("forma_zaliczenia", ""),
            "ects": schedule.get("ects"),
        })

    hours_by_rok = Counter()
    hours_by_semester = Counter()
    ects_by_semester = Counter()
    assessments_by_semester: dict[int, dict[str, int]] = {}
    for p in przedmioty:
        if p["rok"] is not None:
            hours_by_rok[p["rok"]] += p["total_godziny"]
        sem = p["semestr"]
        if sem is not None:
            hours_by_semester[sem] += p["total_godziny"]
            ects_by_semester[sem] += p["ects"] or 0
            bucket = assessments_by_semester.setdefault(sem, {"egzamin": 0, "zaliczenie": 0})
            fz = p["forma_zaliczenia"] or ""
            if fz.startswith("Egzamin"):
                bucket["egzamin"] += 1
            elif fz:
                bucket["zaliczenie"] += 1

    przedmioty.sort(key=lambda p: (p["rok"] or 99, p["semestr"] or 99))

    constraint_violations = []
    if max_godzin_semestr is not None or min_ects_semestr is not None:
        for sem in sorted(set(hours_by_semester) | set(ects_by_semester)):
            godziny = hours_by_semester.get(sem, 0)
            ects = ects_by_semester.get(sem, 0)
            over_hours = max_godzin_semestr is not None and godziny > max_godzin_semestr
            under_ects = min_ects_semestr is not None and ects < min_ects_semestr
            if over_hours or under_ects:
                constraint_violations.append({
                    "semestr": sem, "godziny": godziny, "ects": ects,
                    "przekroczone_godziny": over_hours, "niewystarczajace_ects": under_ects,
                })

    return {
        "przedmioty": przedmioty,
        "n_przedmioty": len(przedmioty),
        "hours_by_rok": dict(sorted(hours_by_rok.items())),
        "hours_by_semester": dict(sorted(hours_by_semester.items())),
        "ects_by_semester": dict(sorted(ects_by_semester.items())),
        "assessments_by_semester": dict(sorted(assessments_by_semester.items())),
        "constraint_violations": constraint_violations,
    }

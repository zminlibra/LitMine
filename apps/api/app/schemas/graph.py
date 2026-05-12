from pydantic import BaseModel


class HotspotItem(BaseModel):
    name: str
    frequency: int
    recent_freq: int  # frequency in last 3 years
    avg_year: float
    trend: float  # ratio of recent_freq / older_freq (>1 = rising)


class HotspotResponse(BaseModel):
    hotspots: list[HotspotItem]
    total_paper_count: int = 0


class GapItem(BaseModel):
    concept_a: str
    concept_b: str
    concept_a_papers: int
    concept_b_papers: int
    co_occurrence: int = 0  # papers containing both concepts
    gap_score: float = 0.0  # combined opportunity score (0-1)


class GapResponse(BaseModel):
    gaps: list[GapItem]
    total_paper_count: int = 0

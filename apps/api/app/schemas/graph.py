from pydantic import BaseModel


class HotspotItem(BaseModel):
    name: str
    frequency: int
    avg_year: float


class HotspotResponse(BaseModel):
    hotspots: list[HotspotItem]


class GapItem(BaseModel):
    concept_a: str
    concept_b: str
    concept_a_papers: int
    concept_b_papers: int

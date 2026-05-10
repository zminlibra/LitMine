from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models import User, Project, Paper
from app.schemas.graph import (
    HotspotResponse, HotspotItem,
    GapItem,
)

router = APIRouter(tags=["graph"])


@router.get("/projects/{project_id}/graph/hotspots", response_model=HotspotResponse)
async def get_hotspots(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Find research hotspots by analyzing keyword frequency and year trends."""
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, detail="Project not found")

    papers_result = await db.execute(
        select(Paper).where(Paper.project_id == project_id)
    )
    papers = papers_result.scalars().all()

    # Combine project keywords with dynamically extracted terms
    from app.services.term_extractor import extract_terms
    paper_dicts = [{"title": p.title, "abstract": p.abstract} for p in papers]
    dynamic_terms = extract_terms(paper_dicts)
    project_kw = [k.lower() for k in (project.keywords or [])]
    keywords = list(dict.fromkeys(project_kw + [t for t in dynamic_terms if t.lower() not in project_kw]))[:30]

    hotspot_data: dict[str, dict] = {}
    for paper in papers:
        text = f"{paper.title or ''} {paper.abstract or ''}"
        for kw in keywords:
            if kw.lower() in text.lower():
                if kw not in hotspot_data:
                    hotspot_data[kw] = {"frequency": 0, "years": []}
                hotspot_data[kw]["frequency"] += 1
                if paper.year:
                    hotspot_data[kw]["years"].append(paper.year)

    hotspots = []
    for name, data in sorted(hotspot_data.items(), key=lambda x: x[1]["frequency"], reverse=True):
        avg_year = sum(data["years"]) / len(data["years"]) if data["years"] else 0
        hotspots.append(HotspotItem(
            name=name,
            frequency=data["frequency"],
            avg_year=round(avg_year, 1),
        ))

    return HotspotResponse(hotspots=hotspots[:15])


@router.get("/projects/{project_id}/graph/gaps")
async def get_gaps(
    project_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Identify research gaps: term pairs that appear separately but rarely together."""
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, detail="Project not found")

    papers_result = await db.execute(
        select(Paper).where(Paper.project_id == project_id)
    )
    papers = papers_result.scalars().all()

    # Dynamically extract terms from paper titles/abstracts via TF-IDF
    from app.services.term_extractor import extract_terms
    paper_dicts = [
        {"title": p.title, "abstract": p.abstract}
        for p in papers
    ]
    search_terms = extract_terms(paper_dicts)

    # Count papers for each term
    term_counts: dict[str, int] = {}
    term_sets: dict[str, set] = {}
    for term in search_terms:
        term_sets[term] = set()
        term_lower = term.lower()
        for paper in papers:
            text = f"{paper.title or ''} {paper.abstract or ''}".lower()
            if term_lower in text:
                term_sets[term].add(paper.id)
        term_counts[term] = len(term_sets[term])

    # Filter to terms that appear in at least 2 papers but not in all papers
    active_terms = {t: c for t, c in term_counts.items() if 2 <= c <= len(papers) * 0.8}
    if len(active_terms) < 2:
        return []

    # Find pairs with low co-occurrence
    gaps = []
    for t1, c1 in active_terms.items():
        for t2, c2 in active_terms.items():
            if t1 >= t2:
                continue
            co_occurrence = len(term_sets[t1] & term_sets[t2])
            min_count = min(c1, c2)
            if min_count > 0 and co_occurrence < min_count * 0.4:
                gap_score = (c1 + c2) * (1 - co_occurrence / min_count)
                gaps.append((gap_score, GapItem(
                    concept_a=t1,
                    concept_b=t2,
                    concept_a_papers=c1,
                    concept_b_papers=c2,
                )))

    gaps.sort(key=lambda g: g[0], reverse=True)
    return [g[1] for g in gaps[:15]]

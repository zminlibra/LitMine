from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models import User, Project, Paper
from app.schemas.graph import (
    HotspotResponse, HotspotItem,
    GapResponse, GapItem,
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

    total_paper_count = len(papers)
    if total_paper_count < 5:
        return HotspotResponse(hotspots=[], total_paper_count=total_paper_count)

    # Combine project keywords with dynamically extracted terms
    from app.services.term_extractor import extract_terms
    paper_dicts = [{"title": p.title, "abstract": p.abstract} for p in papers]
    dynamic_terms = extract_terms(paper_dicts)
    project_kw = [k.lower() for k in (project.keywords or [])]
    keywords = list(dict.fromkeys(project_kw + [t for t in dynamic_terms if t.lower() not in project_kw]))[:30]

    # Determine "recent" threshold: last 3 years or papers published in the last 40% of the time span
    years = sorted(p.year for p in papers if p.year)
    if years:
        recent_threshold = max(years[-1] - 3, sorted(years)[int(len(years) * 0.6)] if len(years) >= 5 else years[-1] - 2)
    else:
        recent_threshold = 0

    hotspot_data: dict[str, dict] = {}
    for paper in papers:
        text = f"{paper.title or ''} {paper.abstract or ''}"
        for kw in keywords:
            if kw.lower() in text.lower():
                if kw not in hotspot_data:
                    hotspot_data[kw] = {"frequency": 0, "recent": 0, "years": []}
                hotspot_data[kw]["frequency"] += 1
                if paper.year and paper.year >= recent_threshold:
                    hotspot_data[kw]["recent"] += 1
                if paper.year:
                    hotspot_data[kw]["years"].append(paper.year)

    # Compute trend score: how much the term is accelerating
    # trend = recent_ratio * frequency (reward both rising trends and substantial volume)
    hotspots = []
    for name, data in hotspot_data.items():
        freq = data["frequency"]
        recent = data["recent"]
        older = freq - recent
        # Avoid division by zero: if 0 older papers, it's a very new term
        trend_ratio = recent / max(older, 1)
        # Composite score: favor terms that are both rising AND have recent volume
        trend_score = trend_ratio * (recent / max(freq, 1))

        avg_year = sum(data["years"]) / len(data["years"]) if data["years"] else 0

        hotspots.append(HotspotItem(
            name=name,
            frequency=freq,
            recent_freq=recent,
            avg_year=round(avg_year, 1),
            trend=round(trend_score, 2),
        ))

    # Sort by trend score descending
    hotspots.sort(key=lambda x: x.trend, reverse=True)
    return HotspotResponse(hotspots=hotspots[:15], total_paper_count=total_paper_count)


@router.get("/projects/{project_id}/graph/gaps", response_model=GapResponse)
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

    total_paper_count = len(papers)
    if total_paper_count < 5:
        return GapResponse(gaps=[], total_paper_count=total_paper_count)

    # Extract terms with wider window: top 50 instead of top 30
    # Also include project keywords directly to ensure user's domain terms aren't missed
    from app.services.term_extractor import extract_terms
    paper_dicts = [
        {"title": p.title, "abstract": p.abstract}
        for p in papers
    ]
    dynamic_terms = extract_terms(paper_dicts, max_terms=50)
    # Merge: project keywords + dynamic terms (wider coverage)
    project_kw = [k.lower() for k in (project.keywords or [])]
    search_terms = list(dict.fromkeys(
        project_kw +
        [t for t in dynamic_terms if t.lower() not in project_kw]
    ))[:60]  # wider window

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
        return GapResponse(gaps=[], total_paper_count=total_paper_count)

    # Find pairs with low co-occurrence, pass full data to frontend
    gaps = []
    for t1, c1 in active_terms.items():
        for t2, c2 in active_terms.items():
            if t1 >= t2:
                continue
            co_occurrence = len(term_sets[t1] & term_sets[t2])
            min_count = min(c1, c2)
            if min_count > 0 and co_occurrence < min_count * 0.4:
                # Laplace-smoothed gap score: never saturates at 1.0
                # Differentiates pairs with same zero co-occurrence but different paper volume
                gap_score = round(1 - (co_occurrence + 1) / (min_count + 1), 3)
                gaps.append((gap_score, GapItem(
                    concept_a=t1,
                    concept_b=t2,
                    concept_a_papers=c1,
                    concept_b_papers=c2,
                    co_occurrence=co_occurrence,
                    gap_score=gap_score,
                )))

    gaps.sort(key=lambda g: g[0], reverse=True)
    return GapResponse(gaps=[g[1] for g in gaps[:15]], total_paper_count=total_paper_count)

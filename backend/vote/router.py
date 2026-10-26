from typing import Annotated
from fastapi import APIRouter, Depends, UploadFile, File

from auth.deps import EngineContext, require_permission, require_any_permission
from vote.schemas import (
    AddVoteOption, CreateVote, UpdateVote, VoteResponse, VoteOptionResponse,
    OptionResultResponse, OptionHistoryResponse,
)
import vote.service as vote_service

router = APIRouter(prefix="/vote", tags=["Szavazások"])

type VoteContext = Annotated[EngineContext, Depends(require_any_permission("vote.vote", "vote.hidden", "vote.image", "vote.edit"))]
type VoteHiddenContext = Annotated[EngineContext, Depends(require_any_permission("vote.hidden", "vote.image", "vote.edit"))]
type VoteEditContext = Annotated[EngineContext, Depends(require_permission("vote.edit"))]
type VoteImageContext = Annotated[EngineContext, Depends(require_any_permission("vote.image", "vote.edit"))]

@router.get("", response_model=list[VoteResponse])
async def get_all_votes(
    ctx: VoteContext
):
    """Az összes szavazás lekérdezése."""
    return await vote_service.get_votes(ctx)


@router.post("", response_model=VoteResponse)
async def create_vote(
    data: CreateVote,
    ctx: VoteEditContext,
):
    return await vote_service.create_vote(data, ctx)


@router.put("/{vote_id}", response_model=VoteResponse)
async def update_vote(
    vote_id: int,
    data: UpdateVote,
    ctx: VoteEditContext,
):
    return await vote_service.update_vote(vote_id, data, ctx)

@router.delete("/{vote_id}", response_model=VoteResponse)
async def delete_vote(
    vote_id: int,
    ctx: VoteEditContext,
):
    return await vote_service.delete_vote(vote_id, ctx)

@router.post("/{vote_id}/option", response_model=VoteOptionResponse)
async def add_option(
    vote_id: int,
    data: AddVoteOption,
    ctx: VoteEditContext,
):
    return await vote_service.add_option(vote_id, data, ctx)

@router.put("/{vote_id}/option/{option_id}", response_model=VoteOptionResponse)
async def update_option(
    vote_id: int,
    option_id: int,
    data: AddVoteOption,
    ctx: VoteEditContext,
):
    return await vote_service.update_option(vote_id, option_id, data, ctx)


@router.delete("/{vote_id}/option/{option_id}", status_code=204)
async def delete_option(
    vote_id: int,
    option_id: int,
    ctx: VoteEditContext,
):
    await vote_service.delete_option(vote_id, option_id, ctx)

@router.put("/{vote_id}/option/{option_id}/image", response_model=VoteOptionResponse)
async def upload_option_image(
    vote_id: int,
    option_id: int,
    ctx: VoteImageContext,
    file: UploadFile = File(...),
):
    return await vote_service.set_option_image(vote_id, option_id, file, ctx)


@router.get("/{vote_id}/option/{option_id}/image")
async def get_option_image(
    vote_id: int,
    option_id: int,
    ctx: VoteContext,
):
    return await vote_service.get_option_image(vote_id, option_id, ctx)


@router.put("/{vote_id}/vote/{option_id}", response_model=list[OptionResultResponse])
async def submit_allocation(
    vote_id: int,
    option_id: int,
    ctx: VoteContext,
):
    return await vote_service.submit_allocation(vote_id, option_id, ctx)


@router.get("/{vote_id}/results", response_model=list[OptionResultResponse])
async def get_results(
    vote_id: int,
    ctx: VoteContext,
):
    return await vote_service.get_results(vote_id, ctx)


@router.get("/{vote_id}/history", response_model=list[OptionHistoryResponse])
async def get_history(
    vote_id: int,
    ctx: VoteContext,
):
    return await vote_service.get_history(vote_id, ctx)
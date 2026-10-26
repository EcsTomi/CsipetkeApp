from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from auth.schemas import GoogleTokenBody, ProfileResponse, RefreshTokenBody
from auth.service import create_access_token, create_refresh_token, parse_lovassy_data
from models import RefreshToken
from models import User
from permissions.service import get_effective_permissions
from auth.deps import AnyUserContext, get_current_user
from deps import get_db
import user.service as userService
from dotenv import load_dotenv
import os

load_dotenv()

# --- KONFIGURÁCIÓ ---
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 10))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", 14))


router = APIRouter(prefix="/auth", tags=["Authentication"])

# --- ENDPOINT ---

@router.post("/login-google", response_model=ProfileResponse)
async def login_google(body: GoogleTokenBody, db_session: AsyncSession = Depends(get_db)):
    """
    Ide küldi a Frontend (Angular) a Google-től kapott `id_token`-t.
    Verifikáljuk, ellenőrizzük a domaint, parse-oljuk, majd saját JWT-t adunk vissza.
    """
    try:
        # 1. Google ID Token verifikálása
        id_info = id_token.verify_oauth2_token(
            body.id_token, 
            google_requests.Request(), 
            GOOGLE_CLIENT_ID
        )

        # Biztonsági ellenőrzés: a token valóban a mi kliensünknek készült?
        if id_info["aud"] != GOOGLE_CLIENT_ID:
            raise HTTPException(status_code=401, detail="Hibás token.")

        # Biztonsági ellenőrzés: a nonce megfelel-e?
        if id_info.get("nonce") != body.nonce:
            raise HTTPException(status_code=401, detail="Érvénytelen nonce.")
        
        # 2. Email parse-olás és validálás (Csak a megadott struktúrát engedi be)
        user_info = await parse_lovassy_data(id_info, db_session)

    except ValueError:
        raise HTTPException(status_code=401, detail="Érvénytelen Google Token.")
    
    # 3. DB művelet
    user, is_blocked = await userService.create_or_update_user(user_info, db_session)

    if is_blocked:
        raise HTTPException(status_code=403, detail="A felhasználó jelenleg blokkolva van.")

    # Refresh
    refresh_token = create_refresh_token()
    await userService.create_user_refresh_token(user, refresh_token, db_session)

    # 4. Saját JWT Token kiállítása a kliensnek a jogosultságokkal
    access_token = create_access_token(user)
    return ProfileResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        permissions=await get_effective_permissions(user.id, db_session),
        **user.__dict__
    )

@router.post("/refresh")
async def refresh_token_endpoint(body: RefreshTokenBody, db_session: AsyncSession = Depends(get_db)) -> ProfileResponse:
    """
    Új access_token-t ad ki a meglévő és érvényes refresh_token alapján.
    Biztonsági okokból a refresh_tokent is rotáljuk (Token Rotation).
    """

    # Megkeressük a refresh tokenet
    result = await db_session.execute(
        select(RefreshToken).where(
            RefreshToken.token == body.refresh_token,
            RefreshToken.active == True,
            RefreshToken.created_at > datetime.now(timezone.utc) - timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    rToken = result.scalar()
    if not rToken:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Érvénytelen vagy lejárt refresh token."
        )

    # Megkeressük a felhasználót
    result = await db_session.execute(select(User).options(selectinload(User.role)).where(User.id == rToken.user_id))
    user = result.scalar()
    if not user or user.is_blocked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Érvénytelen vagy lejárt refresh token."
        )

    # Új tokenek generálása (Token Rotation)
    new_refresh_token = create_refresh_token()
    rToken.active = False
    refresh_token = RefreshToken(token=new_refresh_token, user_id=user.id)
    db_session.add(refresh_token)
    await db_session.commit()
    
    new_access_token = create_access_token(user)
    return ProfileResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        permissions=await get_effective_permissions(user.id, db_session),
        **user.__dict__
    )

@router.get("/profile", response_model=ProfileResponse)
async def profile_endpoint(ctx: AnyUserContext) -> ProfileResponse:
    """
    Felhasználó profilja.
    """
    permissions = await get_effective_permissions(ctx.user.id, ctx.db)
    return ProfileResponse(
        **ctx.user.__dict__,
        permissions=permissions
    )

@router.post("/logout")
async def logout_endpoint(current_user: User = Depends(get_current_user), db_session: AsyncSession = Depends(get_db)):
    """
    Felhasználó kijelentkezés minden eszközről.
    """
    allUserTokens = await db_session.scalars(select(RefreshToken).where(RefreshToken.user_id == current_user.id))
    for token in allUserTokens:
        token.active = False
    await db_session.commit()
    return
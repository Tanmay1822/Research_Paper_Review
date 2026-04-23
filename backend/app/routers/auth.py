"""Authentication router: signup, login, JWT."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.db import database, models

router = APIRouter(prefix="/api/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SECRET_KEY = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days
AUTH_COOKIE_NAME = "rpa_session"
COOKIE_SECURE = os.getenv("JWT_COOKIE_SECURE", "false").lower() == "true"
COOKIE_SAMESITE = "lax"


# --- Pydantic schemas ---


class SignupRequest(BaseModel):
    """Request body for signup."""

    email: EmailStr
    password: str = Field(..., min_length=8, description="Password (min 8 chars)")


class LoginRequest(BaseModel):
    """Request body for login."""

    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    """Response for successful cookie-based authentication."""

    user_id: str
    email: str


class UserResponse(BaseModel):
    """User info for get_current_user."""

    id: UUID
    email: str


# --- Helpers ---

BCRYPT_MAX_BYTES = 72


def _truncate_for_bcrypt(password: str) -> str:
    """Truncate password to 72 bytes (bcrypt limit) to avoid ValueError."""
    pw_bytes = password.encode("utf-8")
    if len(pw_bytes) <= BCRYPT_MAX_BYTES:
        return password
    return pw_bytes[:BCRYPT_MAX_BYTES].decode("utf-8", errors="ignore")


def verify_password(plain: str, hashed: str) -> bool:
    """Check plain password against hashed one."""
    return pwd_context.verify(_truncate_for_bcrypt(plain), hashed)


def hash_password(password: str) -> str:
    """Hash a password (truncates to 72 bytes for bcrypt limit)."""
    return pwd_context.hash(_truncate_for_bcrypt(password))


def create_access_token(sub: str, email: str) -> str:
    """Create a JWT access token."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": sub, "email": email, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# --- Endpoints ---


@router.post("/signup", response_model=AuthResponse)
def signup(
    body: SignupRequest,
    response: Response,
    db: Session = Depends(database.get_db),
) -> AuthResponse:
    """Create a new user account and set an auth cookie."""
    existing = db.query(models.User).filter(models.User.email == body.email).first()
    if existing:
        raise HTTPException(400, "Email already registered")
    user = models.User(
        email=body.email,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(str(user.id), user.email)
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )
    return AuthResponse(user_id=str(user.id), email=user.email)


@router.post("/login", response_model=AuthResponse)
def login(
    body: LoginRequest,
    response: Response,
    db: Session = Depends(database.get_db),
) -> AuthResponse:
    """Authenticate user and set an auth cookie."""
    user = db.query(models.User).filter(models.User.email == body.email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(401, "Invalid email or password")
    token = create_access_token(str(user.id), user.email)
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )
    return AuthResponse(user_id=str(user.id), email=user.email)


def get_current_user(
    request: Request,
    db: Session = Depends(database.get_db),
) -> models.User:
    """Dependency: return the current authenticated user from auth cookie."""
    token_str = request.cookies.get(AUTH_COOKIE_NAME)
    if not token_str:
        raise HTTPException(401, "Missing authentication session")
    try:
        payload = jwt.decode(token_str, SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(401, "Invalid token")
    except JWTError:
        raise HTTPException(401, "Invalid or expired token")
    user = db.query(models.User).filter(models.User.id == UUID(sub)).first()
    if not user:
        raise HTTPException(401, "User not found")
    return user


@router.post("/logout")
def logout(response: Response) -> dict[str, str]:
    """Clear the authentication cookie."""
    response.delete_cookie(key=AUTH_COOKIE_NAME, path="/")
    return {"status": "ok"}


@router.get("/me", response_model=UserResponse)
def me(current_user: models.User = Depends(get_current_user)) -> UserResponse:
    """Return current authenticated user for session checks."""
    return UserResponse(id=current_user.id, email=current_user.email)

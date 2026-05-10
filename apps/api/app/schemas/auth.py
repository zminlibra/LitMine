from pydantic import BaseModel, EmailStr
from uuid import UUID


class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str  # min_length validated at route
    name: str


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: UUID
    email: str
    name: str
    is_active: bool
    tier: str = "free"

    model_config = {"from_attributes": True}

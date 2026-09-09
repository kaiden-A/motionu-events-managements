from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import UserPrincipal, get_current_user
from app.schemas import CheckinIn, CheckinOut
from app.services import checkin as checkin_svc

router = APIRouter(prefix="/checkin", tags=["checkin"])


@router.post("", response_model=CheckinOut)
async def do_checkin(
    data: CheckinIn,
    db: AsyncSession = Depends(get_db),
    user: UserPrincipal = Depends(get_current_user),
):
    try:
        result = await checkin_svc.checkin(db, data.token, user.sub)
    except checkin_svc.CheckinError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    return CheckinOut(**result)

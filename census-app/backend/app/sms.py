"""OTP delivery.

Twilio when configured, otherwise a no-op that lets the API return the code in
the response so the flow stays testable without a paid SMS account.
"""

from __future__ import annotations

from .config import Settings

TWILIO_API = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"


class SmsResult:
    def __init__(self, delivered: bool, detail: str = "") -> None:
        self.delivered = delivered
        self.detail = detail


async def send_otp(settings: Settings, mobile: str, otp: str) -> SmsResult:
    """Send the OTP by SMS. Returns delivered=False when SMS is not configured."""
    if not settings.sms_enabled:
        # Printed so a self-hosted operator can read codes from the server log.
        print(f"census: OTP for +91{mobile} is {otp} (SMS not configured)")
        return SmsResult(False, "SMS is not configured")

    try:
        import httpx
    except ImportError:  # pragma: no cover - optional dependency
        print("census: httpx is not installed, cannot send SMS")
        return SmsResult(False, "httpx is not installed")

    body = (
        f"{otp} is your verification code for the India Census 2026-27 app. "
        "It is valid for 5 minutes. Do not share this code with anyone."
    )

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                TWILIO_API.format(sid=settings.twilio_account_sid),
                auth=(settings.twilio_account_sid or "", settings.twilio_auth_token or ""),
                data={
                    "From": settings.twilio_from_number,
                    "To": f"+91{mobile}",
                    "Body": body,
                },
            )
        if response.status_code >= 400:
            print(f"census: Twilio rejected the message ({response.status_code}) {response.text}")
            return SmsResult(False, f"SMS provider returned {response.status_code}")
        return SmsResult(True)
    except Exception as error:  # pragma: no cover - network dependent
        print(f"census: SMS delivery failed ({error})")
        return SmsResult(False, str(error))

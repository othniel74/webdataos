class AppError(Exception):
    """Base application error."""


class BrightDataError(AppError):
    """Bright Data request or response error."""


class GatewayRecoveryFailed(AppError):
    """Gateway could not recover from a web access failure."""


class NotFoundError(AppError):
    """Requested resource was not found."""

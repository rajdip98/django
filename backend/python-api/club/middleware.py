"""Resolve which website (tenant) a request belongs to.

A request is matched to a tenant by its Host header; when nothing matches, the
tenant marked as default is served. Views and the admin panel read
`request.tenant` and never look at another website's content.
"""
from saas.models import Tenant


class TenantMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.tenant = Tenant.resolve(request.get_host())
        return self.get_response(request)

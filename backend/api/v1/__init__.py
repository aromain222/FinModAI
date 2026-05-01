"""API v1 package.

Do not import route modules here. Importing this package happens before loading
individual routers, and eager imports can pull optional legacy dependencies into
small deployments such as the TimesFM service.
"""

__all__: list[str] = []

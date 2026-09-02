"""Allow either MySQL driver.

Django expects `mysqlclient`. Where that cannot be compiled — Windows, or a host
without build tools — the pure-Python `PyMySQL` is registered under the same name
instead, and everything else works unchanged.
"""
try:  # pragma: no cover - depends on which driver is installed
    import MySQLdb  # noqa: F401
except ImportError:  # pragma: no cover
    try:
        import pymysql

        pymysql.install_as_MySQLdb()
    except ImportError:
        pass  # neither driver present: only needed when DATABASE_URL is MySQL

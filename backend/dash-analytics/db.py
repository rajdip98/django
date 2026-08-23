"""Read-only database access for the dashboard.

The dashboard reports; it never writes. Give it a MySQL user with SELECT and
nothing else — then a defect here cannot damage the club's data, whatever it
does.
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from urllib.parse import urlparse, unquote


def _config() -> dict:
    """Read DATABASE_URL, the same variable Django and the C# service use."""
    url = os.environ.get('DATABASE_URL', '')
    if not url:
        raise RuntimeError(
            'DATABASE_URL is not set. The dashboard needs a read-only MySQL account, '
            'for example: mysql://club_readonly:password@127.0.0.1:3306/club'
        )

    parts = urlparse(url)
    if parts.scheme not in ('mysql', 'mysql+mysqldb'):
        raise RuntimeError(f'The dashboard supports MySQL only, not {parts.scheme!r}.')

    return {
        'host': parts.hostname or '127.0.0.1',
        'port': parts.port or 3306,
        'user': unquote(parts.username or ''),
        'password': unquote(parts.password or ''),
        'database': (parts.path or '').lstrip('/'),
        'charset': 'utf8mb4',
    }


@contextmanager
def cursor():
    import MySQLdb

    settings = _config()
    connection = MySQLdb.connect(
        host=settings['host'], port=settings['port'], user=settings['user'],
        passwd=settings['password'], db=settings['database'], charset=settings['charset'],
    )
    try:
        handle = connection.cursor()
        try:
            yield handle
        finally:
            handle.close()
    finally:
        connection.close()


def rows(sql: str, params: tuple = ()) -> list[tuple]:
    """Run one parameterised query. Values are never formatted into the SQL."""
    with cursor() as handle:
        handle.execute(sql, params)
        return list(handle.fetchall())


def scalar(sql: str, params: tuple = ()) -> int:
    result = rows(sql, params)
    return int(result[0][0]) if result and result[0][0] is not None else 0

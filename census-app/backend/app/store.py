"""Persistence layer.

Two interchangeable backends behind one interface:

* ``MongoStore``  — used when ``MONGODB_URI`` is set (needs the optional
  ``motor`` package). This is the production path.
* ``FileStore``   — an embedded, dependency-free JSON store. It exists so the
  service runs on shared hosting, in a container with no database, or straight
  from a download, which is the difference between "you need a DBA" and "it
  works when you upload it".

Documents are plain dictionaries keyed by a string ``id``.
"""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
from pathlib import Path
from typing import Any, Iterable, Protocol

Document = dict[str, Any]

COLLECTIONS = ("users", "households", "zones", "otps", "audit", "notices")


class Store(Protocol):
    kind: str

    async def connect(self) -> None: ...
    async def close(self) -> None: ...

    async def get(self, collection: str, doc_id: str) -> Document | None: ...
    async def find(
        self, collection: str, where: dict[str, Any] | None = None
    ) -> list[Document]: ...
    async def find_one(self, collection: str, where: dict[str, Any]) -> Document | None: ...
    async def put(self, collection: str, document: Document) -> Document: ...
    async def put_many(self, collection: str, documents: Iterable[Document]) -> None: ...
    async def delete(self, collection: str, doc_id: str) -> bool: ...
    async def delete_where(self, collection: str, where: dict[str, Any]) -> int: ...
    async def count(self, collection: str, where: dict[str, Any] | None = None) -> int: ...


def _matches(document: Document, where: dict[str, Any] | None) -> bool:
    if not where:
        return True
    for key, expected in where.items():
        actual = document.get(key)
        if isinstance(expected, dict):
            # Minimal query-operator support, mirroring the Mongo syntax used here.
            for operator, operand in expected.items():
                if operator == "$in":
                    if actual not in operand:
                        return False
                elif operator == "$gt":
                    if actual is None or not actual > operand:
                        return False
                elif operator == "$gte":
                    if actual is None or not actual >= operand:
                        return False
                elif operator == "$lt":
                    if actual is None or not actual < operand:
                        return False
                elif operator == "$ne":
                    if actual == operand:
                        return False
                else:
                    raise ValueError(f"Unsupported query operator: {operator}")
        elif actual != expected:
            return False
    return True


class FileStore:
    """In-memory store with atomic JSON persistence.

    Reads are served from memory; every write rewrites the file through a
    temporary file + ``os.replace`` so a crash mid-write cannot truncate the
    dataset. Fine up to the tens of thousands of households a single field
    office collects; beyond that, point MONGODB_URI at a real database.

    **Single process only.** State lives in this process's memory and is
    serialised with an asyncio lock, so two workers would each hold their own
    copy and overwrite each other's file — silent data loss. Run one worker, or
    set MONGODB_URI. `warn_if_multiprocess` below makes the mistake loud.
    """

    kind = "embedded"

    def __init__(self, path: Path) -> None:
        self.path = path
        self._data: dict[str, dict[str, Document]] = {name: {} for name in COLLECTIONS}
        self._lock = asyncio.Lock()
        self._loaded = False

    async def connect(self) -> None:
        async with self._lock:
            if self._loaded:
                return
            self._load()
            self._loaded = True

    async def close(self) -> None:
        async with self._lock:
            self._flush()

    # -- internal ---------------------------------------------------------

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as error:
            # Never lose data silently: keep the unreadable file for inspection.
            backup = self.path.with_suffix(self.path.suffix + ".corrupt")
            try:
                self.path.replace(backup)
                print(f"census: unreadable data file moved to {backup} ({error})")
            except OSError:
                pass
            return

        if not isinstance(raw, dict):
            return
        for name in COLLECTIONS:
            rows = raw.get(name)
            if isinstance(rows, list):
                self._data[name] = {
                    row["id"]: row
                    for row in rows
                    if isinstance(row, dict) and isinstance(row.get("id"), str)
                }

    def _flush(self) -> None:
        payload = {name: list(rows.values()) for name, rows in self._data.items()}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        handle = tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=str(self.path.parent),
            prefix=self.path.name,
            suffix=".tmp",
            delete=False,
        )
        try:
            with handle as file:
                json.dump(payload, file, ensure_ascii=False, separators=(",", ":"))
                file.flush()
                os.fsync(file.fileno())
            os.replace(handle.name, self.path)
        except OSError:
            try:
                os.unlink(handle.name)
            except OSError:
                pass
            raise

    def _collection(self, collection: str) -> dict[str, Document]:
        if collection not in self._data:
            raise KeyError(f"Unknown collection: {collection}")
        return self._data[collection]

    # -- API --------------------------------------------------------------

    async def get(self, collection: str, doc_id: str) -> Document | None:
        async with self._lock:
            found = self._collection(collection).get(doc_id)
            return json.loads(json.dumps(found)) if found is not None else None

    async def find(self, collection: str, where: dict[str, Any] | None = None) -> list[Document]:
        async with self._lock:
            rows = [row for row in self._collection(collection).values() if _matches(row, where)]
            return json.loads(json.dumps(rows))

    async def find_one(self, collection: str, where: dict[str, Any]) -> Document | None:
        async with self._lock:
            for row in self._collection(collection).values():
                if _matches(row, where):
                    return json.loads(json.dumps(row))
            return None

    async def put(self, collection: str, document: Document) -> Document:
        async with self._lock:
            doc_id = document.get("id")
            if not isinstance(doc_id, str) or not doc_id:
                raise ValueError("Document requires a non-empty string 'id'")
            stored = json.loads(json.dumps(document))
            self._collection(collection)[doc_id] = stored
            self._flush()
            return json.loads(json.dumps(stored))

    async def put_many(self, collection: str, documents: Iterable[Document]) -> None:
        async with self._lock:
            target = self._collection(collection)
            for document in documents:
                doc_id = document.get("id")
                if not isinstance(doc_id, str) or not doc_id:
                    raise ValueError("Document requires a non-empty string 'id'")
                target[doc_id] = json.loads(json.dumps(document))
            self._flush()

    async def delete(self, collection: str, doc_id: str) -> bool:
        async with self._lock:
            removed = self._collection(collection).pop(doc_id, None) is not None
            if removed:
                self._flush()
            return removed

    async def delete_where(self, collection: str, where: dict[str, Any]) -> int:
        async with self._lock:
            target = self._collection(collection)
            doomed = [key for key, row in target.items() if _matches(row, where)]
            for key in doomed:
                target.pop(key, None)
            if doomed:
                self._flush()
            return len(doomed)

    async def count(self, collection: str, where: dict[str, Any] | None = None) -> int:
        async with self._lock:
            return sum(1 for row in self._collection(collection).values() if _matches(row, where))


class MongoStore:
    """MongoDB-backed store. Requires the optional `motor` package."""

    kind = "mongodb"

    def __init__(self, uri: str, database: str) -> None:
        self.uri = uri
        self.database_name = database
        self._client: Any = None
        self._db: Any = None

    async def connect(self) -> None:
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
        except ImportError as exc:  # pragma: no cover - depends on optional dep
            raise RuntimeError(
                "MONGODB_URI is set but the 'motor' package is not installed. "
                "Run: pip install -r requirements-optional.txt"
            ) from exc

        self._client = AsyncIOMotorClient(self.uri, serverSelectionTimeoutMS=5000)
        self._db = self._client[self.database_name]
        # Fail fast with a clear message rather than on the first request.
        await self._db.command("ping")

        await self._db.households.create_index("zoneId")
        await self._db.households.create_index("enumeratorId")
        await self._db.households.create_index("status")
        await self._db.households.create_index("updatedAt")
        await self._db.households.create_index("acknowledgementId", sparse=True)
        await self._db.users.create_index([("mobile", 1), ("role", 1)])
        await self._db.audit.create_index("at")
        await self._db.notices.create_index("active")
        # Expiry is stored as an epoch number (portable across both stores), so
        # sweeping is done in the auth router rather than by a Mongo TTL index.
        await self._db.otps.create_index("expiresEpoch")
        await self._db.otps.create_index("mobile")

    async def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None
            self._db = None

    def _collection(self, collection: str):
        if collection not in COLLECTIONS:
            raise KeyError(f"Unknown collection: {collection}")
        if self._db is None:
            raise RuntimeError("MongoStore.connect() was not awaited")
        return self._db[collection]

    @staticmethod
    def _clean(document: Document | None) -> Document | None:
        if document is None:
            return None
        document.pop("_id", None)
        return document

    async def get(self, collection: str, doc_id: str) -> Document | None:
        return self._clean(await self._collection(collection).find_one({"id": doc_id}))

    async def find(self, collection: str, where: dict[str, Any] | None = None) -> list[Document]:
        cursor = self._collection(collection).find(where or {})
        rows = await cursor.to_list(length=None)
        return [row for row in (self._clean(item) for item in rows) if row is not None]

    async def find_one(self, collection: str, where: dict[str, Any]) -> Document | None:
        return self._clean(await self._collection(collection).find_one(where))

    async def put(self, collection: str, document: Document) -> Document:
        doc_id = document.get("id")
        if not isinstance(doc_id, str) or not doc_id:
            raise ValueError("Document requires a non-empty string 'id'")
        payload = dict(document)
        payload.pop("_id", None)
        await self._collection(collection).replace_one({"id": doc_id}, payload, upsert=True)
        return payload

    async def put_many(self, collection: str, documents: Iterable[Document]) -> None:
        for document in documents:
            await self.put(collection, document)

    async def delete(self, collection: str, doc_id: str) -> bool:
        result = await self._collection(collection).delete_one({"id": doc_id})
        return result.deleted_count > 0

    async def delete_where(self, collection: str, where: dict[str, Any]) -> int:
        result = await self._collection(collection).delete_many(where)
        return int(result.deleted_count)

    async def count(self, collection: str, where: dict[str, Any] | None = None) -> int:
        return int(await self._collection(collection).count_documents(where or {}))


def warn_if_multiprocess(store: Store) -> None:
    """Shout if the embedded store is used with more than one worker.

    Uvicorn and Gunicorn advertise their worker count in the environment. Two
    processes sharing one JSON file lose data quietly, which is the worst way to
    lose census returns, so make the misconfiguration impossible to miss.
    """
    if getattr(store, "kind", "") != "embedded":
        return

    for variable in ("WEB_CONCURRENCY", "UVICORN_WORKERS", "GUNICORN_WORKERS"):
        raw = os.environ.get(variable)
        if not raw:
            continue
        try:
            workers = int(raw)
        except ValueError:
            continue
        if workers > 1:
            print(
                f"census: WARNING — {variable}={workers} with the embedded JSON store. "
                "Each worker keeps its own copy and they will overwrite each other. "
                "Run a single worker, or set MONGODB_URI."
            )
            return


def build_store(mongodb_uri: str | None, mongodb_db: str, data_dir: Path) -> Store:
    if mongodb_uri:
        return MongoStore(mongodb_uri, mongodb_db)
    data_dir.mkdir(parents=True, exist_ok=True)
    return FileStore(data_dir / "census.json")

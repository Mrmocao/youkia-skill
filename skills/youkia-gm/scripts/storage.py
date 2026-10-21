"""Per-Windows-user encrypted state and a cross-process session lock."""
import ctypes
import hashlib
import json
import os
import re
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path

from protocol import GMError


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


class Blob(ctypes.Structure):
    _fields_ = [('size', ctypes.c_ulong), ('data', ctypes.POINTER(ctypes.c_ubyte))]


def protect(data, decrypt=False):
    if os.name != 'nt':
        raise GMError('WINDOWS_REQUIRED', 'Credential persistence requires Windows DPAPI')
    buf = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_ubyte)))
    dest = Blob()
    crypt = ctypes.WinDLL('crypt32', use_last_error=True)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    if decrypt:
        ok = crypt.CryptUnprotectData(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(dest))
    else:
        ok = crypt.CryptProtectData(ctypes.byref(source), 'youkia GM', None, None, None, 1, ctypes.byref(dest))
    if not ok:
        raise GMError('STATE_ENCRYPTION', 'Windows could not protect/unprotect local state')
    try:
        return ctypes.string_at(dest.data, dest.size)
    finally:
        kernel.LocalFree(ctypes.cast(dest.data, ctypes.c_void_p))


class Store:
    def __init__(self, root=None):
        self.root = Path(root or os.environ.get('youkia_gm_state') or
                         Path(__file__).resolve().parents[1] / 'state')
        self.root = self.root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def path(self, key):
        if not re.fullmatch(r'[a-zA-Z0-9_-]+', key):
            raise GMError('STATE_KEY', 'Invalid state identifier')
        return self.root / (key + '.bin')

    def read(self, key, default=None):
        path = self.path(key)
        if not path.exists():
            return default
        return json.loads(protect(path.read_bytes(), decrypt=True))

    def write(self, key, value):
        data = protect(canonical(value))
        fd, name = tempfile.mkstemp(prefix='atomic-', dir=self.root)
        try:
            with os.fdopen(fd, 'wb') as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(name, self.path(key))
        finally:
            if os.path.exists(name):
                os.unlink(name)

    @contextmanager
    def lock(self):
        import msvcrt
        with (self.root / 'session.lock').open('a+b') as stream:
            if stream.tell() == 0:
                stream.write(b'0')
                stream.flush()
            deadline = time.monotonic() + 20
            while True:
                try:
                    stream.seek(0)
                    msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
                    break
                except OSError:
                    if time.monotonic() >= deadline:
                        raise GMError('SESSION_BUSY', 'Another GM operation owns this session; retry later')
                    time.sleep(0.1)
            try:
                yield
            finally:
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)

"""Small schema-driven protobuf codec; Python standard library only."""
import base64
import struct


class GMError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def varint(value):
    value &= (1 << 64) - 1
    out = bytearray()
    while value > 127:
        out.append((value & 127) | 128)
        value >>= 7
    out.append(value)
    return bytes(out)


def read_varint(data, pos):
    value = 0
    for shift in range(0, 70, 7):
        if pos >= len(data):
            raise GMError('PROTO_TRUNCATED', 'Truncated protobuf value')
        byte = data[pos]
        pos += 1
        value |= (byte & 127) << shift
        if not byte & 128:
            return value, pos
    raise GMError('PROTO_INVALID', 'Invalid protobuf varint')


class Codec:
    def __init__(self, schemas):
        self.schemas = schemas

    def scalar(self, ty, value):
        if ty in ('string', 'bytes'):
            if ty == 'string':
                if not isinstance(value, str):
                    raise GMError('PARAM_TYPE', 'Expected string')
                raw = value.encode('utf-8')
            else:
                try:
                    raw = base64.b64decode(value, validate=True)
                except Exception as exc:
                    raise GMError('PARAM_TYPE', 'bytes fields require base64') from exc
            return 2, varint(len(raw)) + raw
        if ty in self.schemas:
            raw = self.encode(ty, value)
            return 2, varint(len(raw)) + raw
        if ty in ('double', 'float'):
            return (1, struct.pack('<d', value)) if ty == 'double' else (5, struct.pack('<f', value))
        if ty == 'bool':
            if not isinstance(value, bool):
                raise GMError('PARAM_TYPE', 'Expected boolean')
            return 0, varint(int(value))
        if ty not in ('int32', 'int64', 'uint32', 'uint64', 'sint32', 'sint64', 'fixed32', 'fixed64', 'sfixed32', 'sfixed64'):
            raise GMError('PROTO_TYPE', 'Unsupported type: ' + ty)
        if isinstance(value, bool) or not isinstance(value, int):
            raise GMError('PARAM_TYPE', 'Expected integer: ' + ty)
        bits = 32 if ty.endswith('32') else 64
        unsigned = ty.startswith('uint') or ty.startswith('fixed')
        low, high = (0, 2 ** bits - 1) if unsigned else (-2 ** (bits - 1), 2 ** (bits - 1) - 1)
        if not low <= value <= high:
            raise GMError('PARAM_RANGE', 'Integer out of range: ' + ty)
        if 'fixed' in ty:
            fmt = {('fixed32'): '<I', 'fixed64': '<Q', 'sfixed32': '<i', 'sfixed64': '<q'}[ty]
            return (5 if bits == 32 else 1), struct.pack(fmt, value)
        if ty.startswith('sint'):
            value = (value << 1) ^ (value >> (bits - 1))
        return 0, varint(value)

    def encode(self, name, obj):
        if not name:
            if obj:
                raise GMError('PARAM_UNKNOWN', 'Endpoint accepts no request fields')
            return b''
        if not isinstance(obj, dict):
            raise GMError('PARAM_TYPE', 'Message must be a JSON object')
        fields = self.schemas[name]['fields']
        unknown = set(obj) - set(fields)
        if unknown:
            raise GMError('PARAM_UNKNOWN', 'Unknown fields: ' + ', '.join(sorted(unknown)))
        out = bytearray()
        for key, value in obj.items():
            field = fields[key]
            values = value if field.get('rule') == 'repeated' else [value]
            if not isinstance(values, list):
                raise GMError('PARAM_TYPE', 'Repeated field must be array: ' + key)
            if field.get('rule') == 'repeated' and field['type'] not in ('string', 'bytes') and field['type'] not in self.schemas:
                # protobufjs emits packed numeric arrays; the deployed Erlang reader expects them.
                payload = b''.join(self.scalar(field['type'], item)[1] for item in values)
                if payload:
                    out.extend(varint(field['id'] << 3 | 2) + varint(len(payload)) + payload)
                continue
            for item in values:
                wire, raw = self.scalar(field['type'], item)
                out.extend(varint(field['id'] << 3 | wire) + raw)
        return bytes(out)

    def decode(self, name, data, depth=0):
        if depth > 64:
            raise GMError('PROTO_DEPTH', 'Protobuf nesting exceeds 64')
        fields = self.schemas[name]['fields']
        by_id = {f['id']: (key, f) for key, f in fields.items()}
        out = {key: ([] if f.get('rule') == 'repeated' else
                     False if f['type'] == 'bool' else '' if f['type'] in ('string', 'bytes') else
                     0 if f['type'] not in self.schemas else None) for key, f in fields.items()}
        pos = 0
        while pos < len(data):
            tag, pos = read_varint(data, pos)
            number, wire = tag >> 3, tag & 7
            if number == 0:
                raise GMError('PROTO_INVALID', 'Zero field number')
            if wire == 0:
                raw, pos = read_varint(data, pos)
            elif wire in (1, 2, 5):
                size = 8 if wire == 1 else 4
                if wire == 2:
                    size, pos = read_varint(data, pos)
                if pos + size > len(data):
                    raise GMError('PROTO_TRUNCATED', 'Truncated protobuf field')
                raw, pos = data[pos:pos + size], pos + size
            else:
                raise GMError('PROTO_WIRE', 'Unsupported protobuf wire type')
            if number not in by_id:
                continue
            key, field = by_id[number]
            ty = field['type']
            if wire == 2 and ty not in ('string', 'bytes') and ty not in self.schemas:
                if field.get('rule') != 'repeated':
                    raise GMError('PROTO_WIRE', 'Unexpected packed field')
                offset = 0
                while offset < len(raw):
                    val, offset = read_varint(raw, offset)
                    out[key].append(self.integer(ty, val))
                continue
            if ty in self.schemas:
                val = self.decode(ty, raw, depth + 1)
            elif ty == 'string':
                val = raw.decode('utf-8')
            elif ty == 'bytes':
                val = base64.b64encode(raw).decode('ascii')
            elif ty in ('double', 'float', 'fixed32', 'fixed64', 'sfixed32', 'sfixed64'):
                val = struct.unpack({'double': '<d', 'float': '<f', 'fixed32': '<I', 'fixed64': '<Q', 'sfixed32': '<i', 'sfixed64': '<q'}[ty], raw)[0]
            else:
                val = self.integer(ty, raw)
            if field.get('rule') == 'repeated':
                out[key].append(val)
            else:
                out[key] = val
        return out

    @staticmethod
    def integer(ty, value):
        if ty == 'bool':
            return bool(value)
        if ty.startswith('sint'):
            return (value >> 1) ^ -(value & 1)
        if ty in ('int32', 'int64'):
            bits = 32 if ty == 'int32' else 64
            value &= (1 << bits) - 1
            if value >= 1 << (bits - 1):
                value -= 1 << bits
        return value

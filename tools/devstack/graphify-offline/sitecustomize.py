"""Inherited by Graphify AST workers; this local adapter permits no IP network."""
import os
import socket

if os.environ.get("MOBOCOM_GRAPHIFY_OFFLINE") == "1":
    def denied(*args, **kwargs):
        raise RuntimeError("MoboCom Graphify is local code-only: network disabled")

    socket.create_connection = denied
    socket.getaddrinfo = denied
    _connect = socket.socket.connect
    _connect_ex = socket.socket.connect_ex

    def connect(self, *args, **kwargs):
        if self.family in (socket.AF_INET, socket.AF_INET6):
            return denied()
        return _connect(self, *args, **kwargs)

    def connect_ex(self, *args, **kwargs):
        if self.family in (socket.AF_INET, socket.AF_INET6):
            return denied()
        return _connect_ex(self, *args, **kwargs)

    socket.socket.connect = connect
    socket.socket.connect_ex = connect_ex

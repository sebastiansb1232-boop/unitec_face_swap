"""Autenticación del motor antes de leer el cuerpo de una solicitud."""
import re
import secrets
from dataclasses import dataclass
from starlette.datastructures import Headers
from starlette.responses import JSONResponse

@dataclass(frozen=True)
class APIAuth:
    token: str = ''
    required: bool = False

    def __post_init__(self):
        if (self.required or self.token) and not re.fullmatch(r'[A-Za-z0-9_-]{32,256}',self.token):
            raise ValueError('Falta una clave privada válida. Ejecuta npm run setup:remote y usa npm run start:worker.')

    def permits(self, authorization):
        if not self.token:return True
        scheme,_,supplied=authorization.partition(' ')
        return scheme.lower()=='bearer' and secrets.compare_digest(self.token.encode(),supplied.encode())

class APIAuthMiddleware:
    def __init__(self, app, auth):self.app,self.auth=app,auth

    async def __call__(self, scope, receive, send):
        if scope['type']!='http':return await self.app(scope,receive,send)
        if not self.auth.permits(Headers(scope=scope).get('authorization','')):
            response=JSONResponse({'detail':'Se requiere una clave privada válida.'},status_code=401,headers={'WWW-Authenticate':'Bearer','Cache-Control':'no-store'})
            return await response(scope,receive,send)
        async def private_send(message):
            if message['type']=='http.response.start':
                message['headers']=[(k,v) for k,v in message.get('headers',[]) if k.lower()!=b'cache-control']+[(b'cache-control',b'no-store')]
            await send(message)
        await self.app(scope,receive,private_send)

import asyncio
import unittest
from api_auth import APIAuth, APIAuthMiddleware

TOKEN='private_test_key_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ'

class AuthTests(unittest.TestCase):
    def test_required_mode_rejects_missing_or_short_key(self):
        for value in ['', 'short', 'x'*32+' secret']:
            with self.assertRaises(ValueError):APIAuth(value,True)

    def test_bearer_scheme_is_insensitive_but_key_is_exact(self):
        auth=APIAuth(TOKEN,True)
        self.assertTrue(auth.permits('bEaReR '+TOKEN))
        for header in ['', 'Basic '+TOKEN,'Bearer '+TOKEN+'x','Bearer é']:
            self.assertFalse(auth.permits(header))

    def test_local_mode_remains_usable_without_key(self):
        self.assertTrue(APIAuth().permits(''))

    def test_unauthorized_request_never_reads_image_body_or_calls_inference(self):
        async def run():
            messages=[]
            async def forbidden(*args):raise AssertionError('No se debe leer el cuerpo ni ejecutar el motor')
            async def send(message):messages.append(message)
            await APIAuthMiddleware(forbidden,APIAuth(TOKEN,True))({'type':'http','headers':[]},forbidden,send)
            self.assertEqual(messages[0]['status'],401)
            self.assertNotIn(TOKEN.encode(),b''.join(m.get('body',b'') for m in messages))
        asyncio.run(run())

    def test_authorized_response_is_not_cacheable(self):
        async def run():
            messages=[]
            async def app(scope,receive,send):
                await send({'type':'http.response.start','status':200,'headers':[(b'cache-control',b'public')]})
                await send({'type':'http.response.body','body':b'ok'})
            async def send(message):messages.append(message)
            await APIAuthMiddleware(app,APIAuth(TOKEN,True))({'type':'http','headers':[(b'authorization',('Bearer '+TOKEN).encode())]},None,send)
            self.assertEqual(dict(messages[0]['headers'])[b'cache-control'],b'no-store')
        asyncio.run(run())

if __name__=='__main__':unittest.main()

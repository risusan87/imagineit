
import os

from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

class SymmetricCipherHelper:
    """
    ivg
    """
    def __init__(self, key: bytes):
        if len(key) not in [16, 24, 32]:
            raise ValueError("Invalid key size.")
        self.key = key

    def encrypt(self, plaintext: bytes) -> bytes:
        import os

        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        nonce = os.urandom(12)
        aesgcm = AESGCM(self.key)
        ciphertext = aesgcm.encrypt(nonce, plaintext, None)
        return nonce + ciphertext

    def decrypt(self, encrypted_payload: bytes) -> bytes:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        if len(encrypted_payload) < 12:
            raise ValueError("Malformed payload.")
        nonce = encrypted_payload[:12]
        ciphertext = encrypted_payload[12:]
        aesgcm = AESGCM(self.key)
        try:
            plaintext = aesgcm.decrypt(nonce, ciphertext, None)
            return plaintext
        except Exception as e:
            raise e
        
class P2PEncryption:
    def __init__(self, is_remote: bool):
        self._is_remote = is_remote
        if self._is_remote:
            self._secret = rsa.generate_private_key(
                public_exponent=65537,
                key_size=4096,
            )
            self._pem = self._secret.public_key().public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
            self._verifying_key = None
        self.cryptor: SymmetricCipherHelper = None
    
    def encryption_request(self):
        if not self._is_remote:
            print("Call this only on remote side, not local.")
            return None
        if self.cryptor is not None:
            print("Secured protocol already established. No further action needed.")
            return None
        self._verifying_key = os.urandom(32)
        print(f"Public PEM is\n{self._pem.decode('utf-8')}")
        return self._pem, self._verifying_key
    
    def encryption_response(self, public_pem: bytes, verifying_key: bytes):
        if self._is_remote:
            print("Call this only on local side, not remote.")
            return None
        if self.cryptor is not None:
            print("Secured protocol already established. No further action needed.")
            return None
        public_key = serialization.load_pem_public_key(public_pem)
        session_key = AESGCM.generate_key(bit_length=256)
        aesgcm = AESGCM(session_key)
        nonce = os.urandom(12)
        verifying_key_encrypted = aesgcm.encrypt(nonce, verifying_key, None)
        session_key_encrypted = public_key.encrypt(
            session_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )
        shared_secret = os.urandom(32)
        shared_secret_encrypted = aesgcm.encrypt(nonce, shared_secret, None)
        self.cryptor = SymmetricCipherHelper(shared_secret)
        return shared_secret_encrypted, verifying_key_encrypted, session_key_encrypted, nonce
    
    def encryption_acknowledged(self, shared_secret_encrypted: bytes, verifying_key_encrypted: bytes, session_key_encrypted: bytes, nonce: bytes):
        if not self._is_remote:
            print("Call this only on remote side, not local.")
            return False
        if self.cryptor is not None:
            print("Secured protocol already established. No further action needed.")
            return True
        try:
            session_key = self._secret.decrypt(
                session_key_encrypted,
                padding.OAEP(
                    mgf=padding.MGF1(algorithm=hashes.SHA256()),
                    algorithm=hashes.SHA256(),
                    label=None
                )
            )
            aesgcm = AESGCM(session_key)
            verifying_key = aesgcm.decrypt(nonce, verifying_key_encrypted, None)
            if verifying_key != self._verifying_key:
                print("Verifying key mismatch. Aborting.")
                return False
            shared_secret = aesgcm.decrypt(nonce, shared_secret_encrypted, None)
            self.cryptor = SymmetricCipherHelper(shared_secret)
            return True
        except Exception as e:
            print(f"Decryption or verification failed: {e}")
            return False
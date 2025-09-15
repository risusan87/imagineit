import modal

image = modal.Image.debian_slim().uv_pip_install(
    [
        "diffusers[torch]",
        "transformers",
        "torch",
        "accelerate",
        "cryptography",
    ]
)
with image.imports():
    import torch
    from diffusers import StableDiffusionXLPipeline
volume = modal.Volume.from_name("sdxl", create_if_missing=True)
app = modal.App("imagineit", image=image)
dictionary = modal.Dict.from_name("imagineit_dict", create_if_missing=True)


@app.function(
    image=modal.Image.debian_slim().pip_install("requests"),
    scaledown_window=2,
    volumes={"/sdxl": volume},
)
def download_safetensor(remote_safetensor_location: str):
    """
    Download a safetensor file from a remote URL and store it in the shared volume.

    args:
        - remote_safetensor_location (str): URL of the safetensor file to download.

    returns:
        - None:
    """
    import requests

    name = remote_safetensor_location.split("/")[-1]
    response = requests.get(remote_safetensor_location)
    with open(f"/sdxl/{name}", "wb") as f:
        f.write(response.content)


@app.function(
    image=modal.Image.debian_slim(),
    scaledown_window=2,
    volumes={"/sdxl": volume},
)
def get_models():
    """
    Return a list of available model names (without the .safetensors extension) in the shared volume.

    args:
        - None:

    returns:
        - list[str]: List of model names without the “.safetensors” extension.
    """
    import os

    contents = os.listdir("/sdxl")
    return [
        model_name.split(".safetensors")[0]
        for model_name in contents
        if model_name.endswith(".safetensors")
    ]


class SymmetricCipherHelper:
    """
    Helper class for symmetric encryption and decryption using AES‑GCM.

    This class provides simple methods to encrypt and decrypt data using a
    symmetric key. The key must be 16, 24, or 32 bytes long, corresponding
    to AES‑128, AES‑192, or AES‑256. Encryption uses a random 12‑byte nonce
    prepended to the ciphertext. Decryption expects the same format.

    Attributes:
        key (bytes): The symmetric key used for encryption/decryption.
    """

    def __init__(self, key: bytes):
        """
        Initializes the helper with a symmetric key.

        args:
            - key (bytes): The symmetric key used for encryption/decryption. The key must be 16, 24, or 32 bytes long.

        returns:
            - None:
        """
        if len(key) not in [16, 24, 32]:
            raise ValueError("Invalid key size.")
        self.key = key

    def encrypt(self, plaintext: bytes) -> bytes:
        """
        Encrypt plaintext using AES-GCM and prepend the nonce.

        args:
            - plaintext (bytes): The plaintext data to encrypt.

        returns:
            - ciphertext (bytes): The nonce concatenated with the AES-GCM encrypted ciphertext.
        """
        import os

        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        nonce = os.urandom(12)
        aesgcm = AESGCM(self.key)
        ciphertext = aesgcm.encrypt(nonce, plaintext, None)
        return nonce + ciphertext

    def decrypt(self, encrypted_payload: bytes) -> bytes:
        """
        Decrypt data encrypted by encrypt() using AES‑GCM.

        args:
            - encrypted_payload (bytes): The AES‑GCM encrypted payload, consisting of a 12‑byte nonce followed by the ciphertext.
        returns:
            - plaintext (bytes): The decrypted plaintext.
        """
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


@app.cls(
    gpu="L40S",
    image=image,
    enable_memory_snapshot=True,
    scaledown_window=2,
    volumes={"/sdxl": volume},
)
class DiffusionModel:
    """
    A DiffusionModel that loads a Stable Diffusion XL pipeline and provides secure image generation via RSA and symmetric encryption.
    """

    model_name: str = modal.parameter()

    @modal.enter()
    def setup(self):
        """
        Load the diffusion pipeline and generate RSA keys for secure communication.

        args:
            - None:

        returns:
            - None:
        """
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import rsa

        self.pipe = StableDiffusionXLPipeline.from_single_file(
            f"/sdxl/{self.model_name}.safetensors",
            torch_dtype=torch.float16,
        ).to("cuda")

        self.secret = rsa.generate_private_key(
            public_exponent=65537,
            key_size=4096,
        )
        self.pem = self.secret.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        self.cryptor = None
        self.varifying_key = None

    @modal.method()
    def generate(self, pipe_args: bytes) -> bytes:
        """
        Generate images from the diffusion pipeline and return them as base64‑encoded PNGs.

        args:
        - pipe_args (bytes): Encrypted arguments passed to the diffusion pipeline.

        returns:
        - img_dict (bytes): Encrypted dictionary with a single key `"img"` mapping to a list of base64‑encoded PNG image strings.
        """
        import base64
        from io import BytesIO

        pipe_args = self.decrypt(pipe_args)
        images = self.pipe(**pipe_args).images
        imgs = []
        for img in images:
            buffered = BytesIO()
            img.save(buffered, format="PNG")
            img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
            imgs.append(img_str)
        img_dict = {"img": imgs}
        img_dict = self.encrypt(img_dict)
        return img_dict

    @modal.method()
    def encryption_request(self):
        """
        Initiate a hand‑shake step by returning the instance’s PEM‑encoded public key along with a freshly‑generated 32‑byte verification key.

        args:
            - None:
        returns:
            - pem (bytes): the PEM‑encoded RSA public key of the local instance
            - varifying_key (bytes): a 32‑byte random key used for verifying the remote party
        """
        import os

        if self.cryptor is not None:
            raise Exception("Malformed protocol: Shared secret already established")
        self.varifying_key = os.urandom(32)
        return (self.pem, self.varifying_key)

    @modal.method()
    def encryption_acknowledged(
        self,
        shared_secret_encrypted: bytes,
        varifying_key_encrypted: bytes,
        session_key_encrypted: bytes,
        nonce: bytes,
    ):
        """
        Complete the encryption handshake by verifying the session key and establishing the symmetric cipher.

        args:
            - shared_secret_encrypted (bytes): The encrypted shared secret blob that will be decrypted with the AES-GCM cipher.
            - varifying_key_encrypted (bytes): The encrypted verifying key that is used to confirm the identity of the counter‑party.
            - session_key_encrypted (bytes): The RSA/OAEP encrypted session key that, once decrypted, becomes the AES-GCM key.
            - nonce (bytes): The nonce used for the AES-GCM decryption of both the verifying key and the shared secret.

        returns:
            - bool: True when the handshake succeeds; the method raises an exception otherwise.
        """
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import padding
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        if self.varifying_key is None:
            raise Exception("Malformed protocol: No varifying key established")
        if self.cryptor is not None:
            raise Exception("Malformed protocol: Shared secret already established")
        session_key = self.secret.decrypt(
            session_key_encrypted,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None,
            ),
        )
        aesgcm = AESGCM(session_key)
        varifying_key = aesgcm.decrypt(nonce, varifying_key_encrypted, None)
        if varifying_key != self.varifying_key:
            raise Exception("Varifying key does not match")
        shared_secret = aesgcm.decrypt(nonce, shared_secret_encrypted, None)
        self.cryptor = SymmetricCipherHelper(shared_secret)
        return True

    def decrypt(self, encrypted_payload: bytes) -> dict:
        """
        Decrypt a payload using the established symmetric cipher and parse JSON.

        args:
            - encrypted_payload (bytes): The encrypted data to be decrypted.

        returns:
            - dict: The decrypted payload parsed into a Python dictionary.
        """
        import json

        if self.cryptor is None:
            raise Exception("Secured protocol not established")
        decrypted_data = self.cryptor.decrypt(encrypted_payload).decode("utf-8")
        return json.loads(decrypted_data)

    def encrypt(self, raw_payload: dict) -> bytes:
        """
        Encrypts the given raw payload dictionary into a byte stream using the instance's cryptor.
        args:
            - raw_payload (dict): The payload data to be encrypted.
        returns:
            - encrypted_data (bytes): The encrypted byte sequence.
        """
        import json

        if self.cryptor is None:
            raise Exception("Secured protocol not established")
        raw_data = json.dumps(raw_payload).encode("utf-8")
        encrypted_data = self.cryptor.encrypt(raw_data)
        return encrypted_data

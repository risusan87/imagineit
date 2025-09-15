
import modal

image = (
    modal.Image.debian_slim()
    .uv_pip_install([
        "diffusers[torch]",
        "transformers",
        "torch>2.0",
        "accelerate",
        "cryptography",
        "peft",
    ])
)
with image.imports():
    from diffusers import StableDiffusionXLPipeline
    import torch
volume = modal.Volume.from_name("sdxl", create_if_missing=True)
app = modal.App("imagineit", image=image)
dictionary = modal.Dict.from_name("imagineit_dict", create_if_missing=True)

@app.function(
    image = modal.Image.debian_slim().pip_install("requests"),
    scaledown_window=2,
    volumes={"/sdxl": volume},
)
def download_safetensor(remote_safetensor_location: str, is_lora: bool=False):
    import os
    import requests
    if not os.path.exists("/sdxl/loras"):
        os.makedirs("/sdxl/loras")
    name = remote_safetensor_location.split("/")[-1]
    response = requests.get(remote_safetensor_location)
    with open(f'/sdxl/{"loras/" if is_lora else ""}{name}', 'wb') as f:
        f.write(response.content)

@app.function(
    image = modal.Image.debian_slim(),
    scaledown_window=2,
    volumes={"/sdxl": volume},
)
def get_models():
    import os
    contents = os.listdir("/sdxl")
    return [model_name.split(".safetensors")[0] for model_name in contents if model_name.endswith(".safetensors")]

class SymmetricCipherHelper:
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

@app.cls(
    gpu="L40S", 
    image=image,
    enable_memory_snapshot=True,
    scaledown_window=2,
    volumes={"/sdxl": volume},
)   
class DiffusionModel:
    model_name: str = modal.parameter()
    loras: str = modal.parameter(default="[]")

    @modal.enter()
    def setup(self):
        import os
        import json
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization

        self.pipe = StableDiffusionXLPipeline.from_single_file(
            f'/sdxl/{self.model_name}.safetensors',
            torch_dtype=torch.float16,
        )
        self.pipe.to("cuda")
        if not os.path.exists("/sdxl/loras"):
            os.makedirs("/sdxl/loras")
        adapters = []
        loras = json.loads(self.loras)
        for lora in loras:
            adapters.append(lora["name"])
            self.pipe.load_lora_weights(f'/sdxl/loras/{lora["name"]}.safetensors', adapter_name=lora["name"])
        self.pipe.set_adapters(adapters, adapter_weights=[lora["weight"] for lora in loras])
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
        raw data is stringified dictionary via json.dumps
        when fixed seed is desired, use "seed" with type integer instead of torch.Generator
        returning json contains PNG images encoded as base64 strings
        """
        from io import BytesIO
        import base64
        pipe_args = self.decrypt(pipe_args)
        img_iterate = pipe_args.pop("images", 1)
        images = []
        for _ in range(img_iterate):
            image = self.pipe(**pipe_args).images
            images.extend([img for img in image])
        print("Done!")
        imgs = []
        for img in images:
            buffered = BytesIO()
            img.save(buffered, format="PNG")
            img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
            imgs.append(img_str)
        img_dict = {"img": imgs}
        img_dict = self.encrypt(img_dict)
        print("Sending...")
        return img_dict
    
    @modal.method()
    def encryption_request(self):
        import os
        if self.cryptor is not None:
            print("Secured protocol already established. No further action needed.")
            return None
        self.varifying_key = os.urandom(32)
        print(f"Public PEM is {self.pem.decode('utf-8')}")
        return (self.pem, self.varifying_key)

    @modal.method()
    def encryption_acknowledged(self, shared_secret_encrypted: bytes, varifying_key_encrypted: bytes, session_key_encrypted: bytes, nonce: bytes):
        from cryptography.hazmat.primitives.asymmetric import padding
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        if self.varifying_key is None:
            raise Exception("No varifying key created. Call encryption_request first.")
        if self.cryptor is not None:
            return True
        session_key = self.secret.decrypt(
            session_key_encrypted,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )
        aesgcm = AESGCM(session_key)
        varifying_key = aesgcm.decrypt(nonce, varifying_key_encrypted, None)
        if varifying_key != self.varifying_key:
            print("Remote can not varify the varifying key and this should not happen with correct protocol.")
            return False
        shared_secret = aesgcm.decrypt(nonce, shared_secret_encrypted, None)
        self.cryptor = SymmetricCipherHelper(shared_secret)
        print("Secured protocol established!")
        return True

    def decrypt(self, encrypted_payload: bytes) -> dict:
        import json
        if self.cryptor is None:
            raise Exception("Secured protocol not established")
        decrypted_data = self.cryptor.decrypt(encrypted_payload).decode('utf-8')
        return json.loads(decrypted_data)
    
    def encrypt(self, raw_payload: dict) -> bytes:
        import json
        if self.cryptor is None:
            raise Exception("Secured protocol not established")
        raw_data = json.dumps(raw_payload).encode('utf-8')
        encrypted_data = self.cryptor.encrypt(raw_data)
        return encrypted_data

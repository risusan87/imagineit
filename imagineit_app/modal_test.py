
import os
import json
import base64

from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import modal

from imagineit_app.serverless_modal import SymmetricCipherHelper


# Contact Modal to get DiffusionModel class on cloud from app imagineit
DiffusionModel = modal.Cls.from_name("imagineit", "DiffusionModel")
diffusion = DiffusionModel(model_name="animagine-xl-4.0-opt")

# remote -> local: encryption request: 
# remote creates a public/private key pair and sends public key to local, as well as a varifying key
pem, varifying_key = diffusion.encryption_request.remote()

# local -> remote: encryption response
# local responds with encrypted shared secret and varifying key using remote's public key.
public_key = serialization.load_pem_public_key(pem)
session_key = AESGCM.generate_key(bit_length=256)
aesgcm = AESGCM(session_key)
nonce = os.urandom(12)
varifying_key_encrypted = aesgcm.encrypt(nonce, varifying_key, None)
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

# remote -> local: encryption acknowledged
# varifying key must match the original one after decryption on remote side.
# remote then decrypts the shared secret to establish symmetric cipher.
# remote gracefully returns True if all is good.
diffusion.encryption_acknowledged.remote(shared_secret_encrypted, varifying_key_encrypted, session_key_encrypted, nonce)

# dataflow now is secured at this point
cryptor = SymmetricCipherHelper(shared_secret)
diffusion_command_dict = {
    "prompt": "1girl, shigure ui, v tuber, full body, red hat, white bon bons, school uniform, high school, masterpiece, high score, great score, absurdres",
    "negative_prompt": "lowres, bad anatomy, bad hands, text, error, missing finger, extra digits, fewer digits, cropped, worst quality, low quality, low score, bad score, average score, signature, watermark, username, blurry",
    "num_inference_steps": 28,
    "guidance_scale": 5.0,
}
encrypted_args = cryptor.encrypt(json.dumps(diffusion_command_dict).encode('utf-8'))
encrypted_images = diffusion.generate.remote(encrypted_args)
images = json.loads(cryptor.decrypt(encrypted_images).decode('utf-8'))
if not os.path.exists("out_images"):
    os.makedirs("out_images")
for i, img_str in enumerate(images["img"]):
    with open(f"out_images/output_{i}.png", "wb") as f:
        f.write(base64.b64decode(img_str.encode('utf-8')))
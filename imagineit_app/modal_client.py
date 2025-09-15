
import os
import json
import base64

import modal

from imagineit_app.encryption import P2PEncryption


# Contact Modal to get DiffusionModel class on cloud from app imagineit
DiffusionModel = modal.Cls.from_name("imagineit", "DiffusionModel")
diffusion = DiffusionModel(model_name="animagine-xl-4.0-opt", loras='[{"name": "pixel-art-xl", "weight": 1.0}]')
cipher = P2PEncryption(is_remote=False)

# remote -> local: encryption request: 
# remote creates a public/private key pair and sends public key to local, as well as a varifying key
hints = diffusion.encryption_request.remote()

if hints is not None:
    pem, varifying_key = hints
    # local -> remote: encryption response
    # local responds with encrypted shared secret and varifying key using remote's public key.
    response = cipher.encryption_response(pem, varifying_key)

# remote -> local: encryption acknowledged
# varifying key must match the original one after decryption on remote side.
# remote then decrypts the shared secret to establish symmetric cipher.
# remote gracefully returns True if all is good.
success = diffusion.encryption_acknowledged.remote(*response)
if not success:
    raise Exception("Encryption handshake failed :(")

# dataflow is secured at this point
diffusion_command_dict = {
    "prompt": "pixel, 1girl, mococo abyssgard, v tuber, safe, full body, fluffy tails, high school, masterpiece, high score, great score, absurdres",
    "negative_prompt": "3d render, realistic, lowres, bad anatomy, bad hands, text, error, missing finger, extra digits, fewer digits, cropped, worst quality, low quality, low score, bad score, average score, signature, watermark, username, blurry",
    "num_inference_steps": 28,
    "guidance_scale": 5.0,
    "num_images_per_prompt": 2,
    "images": 5,
}
encrypted_args = cipher.cryptor.encrypt(json.dumps(diffusion_command_dict).encode('utf-8'))
encrypted_images = diffusion.generate.remote(encrypted_args)
images = json.loads(cipher.cryptor.decrypt(encrypted_images).decode('utf-8'))
if not os.path.exists("out_images"):
    os.makedirs("out_images")
for i, img_str in enumerate(images["img"]):
    with open(f"out_images/output_{i}.png", "wb") as f:
        f.write(base64.b64decode(img_str.encode('utf-8')))
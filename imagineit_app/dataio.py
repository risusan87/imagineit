
import os
import pandas as pd
import hashlib
import json

IMG_DIR = os.environ.get('IMG_DIR', 'imagineit_app/static/imgs')

def to_bytes(image_path):
    with open(image_path, 'rb') as f:
        return f.read()

def to_img(image_data: bytes, output_path: str):
    with open(output_path, 'wb') as f:
        f.write(image_data)

def save_img(image_data: bytes, seed: int, prompt: str, negative_prompt: str, width: int, height: int, steps: int, guidance_scale: float):
    """
    Saves the image to formatted data file
    """
    if not os.path.exists(IMG_DIR):
        os.makedirs(IMG_DIR)
    if not os.path.exists(f"{IMG_DIR}/metadata.csv"):
        pd.DataFrame(columns=[
            "seed",
            "prompt",
            "negative_prompt",
            "width",
            "height",
            "steps",
            "guidance_scale"
        ]).to_csv(f"{IMG_DIR}/metadata.csv", index=False)
    img_metadata = {
        "seed": seed,
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "width": width,
        "height": height,
        "steps": steps,
        "guidance_scale": guidance_scale,
        "labeled": False
    }
    data_string = json.dumps(img_metadata, sort_keys=True, separators=(',', ':'))
    data_bytes = data_string.encode('utf-8')
    sha256_hash = hashlib.sha256()
    sha256_hash.update(data_bytes)
    hex_digest = sha256_hash.hexdigest()
    img_metadata["hash"] = hex_digest
    new_df = pd.DataFrame([img_metadata])
    metadata_df = pd.read_csv(f"{IMG_DIR}/metadata.csv")
    metadata_df = pd.concat([metadata_df, new_df], ignore_index=True)
    metadata_df.to_csv(f"{IMG_DIR}/metadata.csv", index=False)
    image_path = f"{IMG_DIR}/{hex_digest}.png"
    to_img(image_data, image_path)
    return hex_digest

def load_img_metadata():
    if not os.path.exists(f"{IMG_DIR}/metadata.csv"):
        return None
    return pd.read_csv(f"{IMG_DIR}/metadata.csv")

def load_img(hash: str=None, index: int=None):
    if hash is not None:
        img_path = IMG_DIR + f"/{hash}.png"
        if os.path.exists(img_path):
            return to_bytes(img_path)
    if index is not None:
        png_file_list = os.listdir(IMG_DIR)
        png_file_list = [f for f in png_file_list if f.endswith('.png')]
        if index < len(png_file_list):
            img_path = os.path.join(IMG_DIR, png_file_list[index])
            return to_bytes(img_path)
    return None

def label_img(hash: str, label_prompt: str, label_negative_prompt: str):
    metadata_df = load_img_metadata()
    target_metadata_df = metadata_df[metadata_df['hash'] == hash]
    if target_metadata_df.empty:
        print(f"No metadata found for hash: {hash}")
        return
    metadata_df.loc[metadata_df['hash'] == hash, 'labeled'] = True
    metadata_df.loc[metadata_df['hash'] == hash, 'label_prompt'] = label_prompt
    metadata_df.loc[metadata_df['hash'] == hash, 'label_negative_prompt'] = label_negative_prompt
    metadata_df.to_csv(f"{IMG_DIR}/metadata.csv", index=False)
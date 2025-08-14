
import os
import struct
import zlib
from io import BytesIO
import json
import hashlib

import pandas as pd

IMDB_PATH = os.environ.get('IMDB_PATH', 'data.imdb')

def metadata_size(f):
    f.seek(0)
    size_bytes = f.read(4)
    if size_bytes == b'':
        return 0
    size = struct.unpack("<I", size_bytes)[0]
    # print(f"Metadata size: {size + 4}")
    return size + 4

def mapper_size(f):
    f.seek(metadata_size(f))
    size_bytes = f.read(4)
    if size_bytes == b'':
        return 0
    size = struct.unpack("<I", size_bytes)[0]
    return size + 4

def next_index_pos(f):
    size_bytes = f.read(8)
    if size_bytes == b'':
        return 0
    index = int.from_bytes(size_bytes, "little", signed=False)
    return index

def write_next_index_position(f, index: int):
    f.write(int.to_bytes(index, 8, "little", signed=False))

def read_metadata(f):
    size_bytes = f.read(4)
    if size_bytes == b'':
        return pd.DataFrame(columns=[
            "seed", "prompt", "negative_prompt",
            "width", "height", "steps", "guidance_scale", "hash"
        ])
    metadata_size = struct.unpack("<I", size_bytes)[0]
    metadata = f.read(metadata_size)
    csv = BytesIO(zlib.decompress(metadata))
    return pd.read_csv(csv)

def write_metadata(f, df: pd.DataFrame):
    metadata = df.to_csv(index=False).encode("utf-8")
    metadata = zlib.compress(metadata)
    metadata_size = struct.pack("<I", len(metadata))
    f.write(metadata_size)
    f.write(metadata)

def read_mapper(f):
    mapper_size_bytes = f.read(4)
    if mapper_size_bytes == b'':
        return {}
    mapper_size = struct.unpack("<I", mapper_size_bytes)[0]
    mapper_bytes = BytesIO(f.read(mapper_size))
    mapper = {}
    for i in range(mapper_size // 40):
        base = i * 40
        mapper_bytes.seek(base)
        hash_num = int.from_bytes(mapper_bytes.read(32), "big", signed=False)
        mapper_bytes.seek(base + 32)
        index = struct.unpack("<I", mapper_bytes.read(4))[0]
        mapper_bytes.seek(base + 36)
        size = struct.unpack("<I", mapper_bytes.read(4))[0]
        mapper[hex(hash_num)] = (index, size)
    return mapper

def write_mapper(f, mapper: dict):
    mapper_bytes = bytearray()
    for key, (index, size) in mapper.items():
        mapper_bytes.extend(int.to_bytes(int(key, 16), 32, 'big', signed=False))
        mapper_bytes.extend(struct.pack("<I", index))
        mapper_bytes.extend(struct.pack("<I", size))
    f.write(struct.pack("<I", len(mapper_bytes)))
    f.write(mapper_bytes)

def add_img(img: bytes, seed: int, prompt: str, negative_prompt: str, width: int, height: int, steps: int, guidance_scale: float):
    if type(prompt) is float:
        prompt = ""
    if type(negative_prompt) is float:
        negative_prompt = ""
    img_metadata = {
        "seed": seed,
        "prompt": prompt,#.replace(" ", "").replace("\t", "").replace("\n", ""),
        "negative_prompt": negative_prompt,#.replace(" ", "").replace("\t", "").replace("\n", ""),
        "width": width,
        "height": height,
        "steps": steps,
        "guidance_scale": guidance_scale,
        "labeled": False
    }
    img = zlib.compress(img)
    data_string = json.dumps(img_metadata, sort_keys=True, separators=(',', ':'))
    data_bytes = data_string.encode('utf-8')
    sha256_hash = hashlib.sha256()
    sha256_hash.update(data_bytes)
    hex_digest = sha256_hash.hexdigest()
    img_metadata["hash"] = hex_digest
    new_df = pd.DataFrame([img_metadata])
    with open(IMDB_PATH, "r+b") as f:
        # print('reading...')
        current_metadata = read_metadata(f)
        current_mapper = read_mapper(f)
        print(current_mapper)
        current_next_index = next_index_pos(f)
        current_img_bytes = f.read()
        # print('size of current metadata:', current_metadata.shape[0])
        # print('size of current mapper:', len(current_mapper))
        # print("writing...")
        f.seek(0)
        next_metadata = pd.concat([current_metadata, new_df], ignore_index=True)
        current_mapper[hex_digest] = (current_next_index, len(img))
        print(current_mapper)
        next_next_index = current_next_index + len(img)
        # print('next size of metadata:', next_metadata.shape[0])
        # print('next size of mapper:', len(current_mapper))
        write_metadata(f, next_metadata)
        write_mapper(f, current_mapper)
        write_next_index_position(f, next_next_index)
        f.write(current_img_bytes)
        f.write(img)
    
def load_img(hash: str):
    hash = hex(int(hash, 16))
    with open(IMDB_PATH, "rb") as f:
        f.seek(metadata_size(f))
        mapper = read_mapper(f)
        print(len(mapper))
        if (hash) not in mapper:
            return None
        index, size = mapper[hash]
        f.seek(metadata_size(f) + mapper_size(f) + 8 + index)
        img = zlib.decompress(f.read(size))
    return img

def load_metadata():
    with open(IMDB_PATH, "rb") as f:
        return read_metadata(f)

# m = pd.read_csv("/Users/kitsui/workingspace/prune/imagineit_app/static/data/sd_images/metadata.csv")
# for i, row in m.iterrows():
#     hash = row['hash']
#     with open("/Users/kitsui/workingspace/prune/imagineit_app/static/data/sd_images/{}.png".format(hash), "rb") as f:
#         img = f.read()
#     print("Concatinating image with hash: {}".format(hash))
#     add_img(
#         img=img,
#         seed=row['seed'],
#         prompt=row['prompt'],
#         negative_prompt=row['negative_prompt'],
#         width=row['width'],
#         height=row['height'],
#         steps=row['steps'],
#         guidance_scale=row['guidance_scale']
#     )

# img = load_img("d3759b87dd89b6313642d01e427f59fa367423443bf699e4153de6eb367d555d")
# with open("test.png", "wb") as f:
#     f.write(img)
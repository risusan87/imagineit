
import os
import struct
import zlib
from io import BytesIO
import json
import hashlib
import hmac

import pandas as pd

IMDB_PATH = os.environ.get('IMDB_PATH', 'datav2.imdb')

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
        # print(current_mapper)
        current_next_index = next_index_pos(f)
        current_img_bytes = f.read()
        # print('size of current metadata:', current_metadata.shape[0])
        # print('size of current mapper:', len(current_mapper))
        # print("writing...")
        f.seek(0)
        next_metadata = pd.concat([current_metadata, new_df], ignore_index=True)
        current_mapper[hex_digest] = (current_next_index, len(img))
        # print(current_mapper)
        next_next_index = current_next_index + len(img)
        # print('next size of metadata:', next_metadata.shape[0])
        # print('next size of mapper:', len(current_mapper))
        write_metadata(f, next_metadata)
        write_mapper(f, current_mapper)
        write_next_index_position(f, next_next_index)
        f.write(current_img_bytes)
        f.write(img)
    return hex_digest

def write_v2(identity_hash: str, uncompressed_img: bytes=None, seed: int=None, prompt: str=None, negative_prompt: str=None, width: int=None, height: int=None, steps: int=None, guidance_scale: float=None, labeled: bool=None, label: str=None):
    if not os.path.exists(IMDB_PATH):
        with open(IMDB_PATH, "wb") as f:
            empty_df_with_heads = pd.DataFrame(columns=["seed", "prompt", "negative_prompt", "width", "height", "steps", "guidance_scale", "labeled", "label", "identity"])
            df_bytes = zlib.compress(empty_df_with_heads.to_csv(index=False).encode('utf-8'))
            f.write(int.to_bytes(16, 8, "little", signed=False)) 
            f.write(int.to_bytes(16, 8, "little", signed=False))
            f.write(df_bytes)
    with open(IMDB_PATH, "rb") as f:
        mapper_loc = int.from_bytes(f.read(8), "little", signed=False)
        metadata_loc = int.from_bytes(f.read(8), "little", signed=False)
        f.seek(mapper_loc)
        mapper_buff = BytesIO(f.read(metadata_loc - mapper_loc))
        f.seek(metadata_loc)
        metadata_bytes = BytesIO(zlib.decompress(f.read()))
    mapper = {}
    for i in range(len(mapper_buff.getvalue()) // 64):
        mapper_buff.seek(i * 64)
        salt = bytes(mapper_buff.read(16)[::-1]).hex()
        hash = bytes(mapper_buff.read(32)[::-1]).hex()
        index = int.from_bytes(mapper_buff.read(8), "little", signed=False)
        size = int.from_bytes(mapper_buff.read(8), "little", signed=False)
        mapper[salt + "$" + hash] = (index, size)
    metadata_df = pd.read_csv(metadata_bytes)
    mapper_buff.close()
    metadata_bytes.close()
    target = None if identity_hash is None else (metadata_df['identity'] == identity_hash)
    target_metadata = None if target is None else metadata_df[target]
    if target_metadata is None:
        if uncompressed_img is None or seed is None or prompt is None or negative_prompt is None or width is None or height is None or steps is None or guidance_scale is None:
            raise ValueError("All parameters must be provided when adding new image")
        target_metadata = pd.DataFrame([img_metadata_v2(seed, prompt, negative_prompt, width, height, steps, guidance_scale)])
        identity_hash = target_metadata['identity'].iloc[0]
        metadata_df = pd.concat([metadata_df, target_metadata], ignore_index=True)
        target_img = zlib.compress(uncompressed_img)
        mapper[identity_hash] = (mapper_loc, len(target_img))
    elif target_metadata.shape[0] == 0:
        raise ValueError("No metadata found for image hash", hash)
    else:
        if seed is not None:
            metadata_df.loc[target, 'seed'] = seed
        if prompt is not None:
            metadata_df.loc[target, 'prompt'] = prompt
        if negative_prompt is not None:
            metadata_df.loc[target, 'negative_prompt'] = negative_prompt
        if width is not None:
            metadata_df.loc[target, 'width'] = width
        if height is not None:
            metadata_df.loc[target, 'height'] = height
        if steps is not None:
            metadata_df.loc[target, 'steps'] = steps
        if guidance_scale is not None:
            metadata_df.loc[target, 'guidance_scale'] = guidance_scale
        new_metadata = img_metadata_v2(**metadata_df.loc[target, ['seed', 'prompt', 'negative_prompt', 'width', 'height', 'steps', 'guidance_scale']].iloc[0].to_dict())
        if not identity_hash_validation_v2(identity_hash.split('$')[1], new_metadata['identity']):
            mapper[new_metadata['identity']] = mapper.pop(target_metadata['identity'].iloc[0])
            metadata_df.loc[target, 'identity'] = new_metadata['identity']
        if labeled is not None:
            metadata_df.loc[target, 'labeled'] = labeled
        if label is not None:
            metadata_df.loc[target, 'label'] = label
        # TODO mapper update (Done)
        target_img = None
        if uncompressed_img is not None:
            target_img = zlib.compress(uncompressed_img)
            mapper[new_metadata['identity']] = (mapper[new_metadata['identity']][0], len(target_img))
    new_mapper_loc = mapper_loc
    new_metadata_loc = metadata_loc
    with open(IMDB_PATH, "r+b") as f:
        if target_img is not None:
            f.seek(mapper_loc)
            f.write(target_img)
            new_mapper_loc = mapper_loc + len(target_img)
            new_metadata_loc = metadata_loc + len(target_img)
        mapper_buffer = BytesIO()
        for key, (index, size) in mapper.items():
            salt, hash = key.split("$")
            mapper_buffer.write(int.to_bytes(int(salt, 16), 16, "little", signed=False))
            mapper_buffer.write(int.to_bytes(int(hash, 16), 32, "little", signed=False))
            mapper_buffer.write(int.to_bytes(index, 8, "little", signed=False))
            mapper_buffer.write(int.to_bytes(size, 8, "little", signed=False))
        mapper_bytes = mapper_buffer.getvalue()
        mapper_buffer.close()
        f.seek(new_mapper_loc)
        f.write(mapper_bytes)
        exceeded_bytes = len(mapper_bytes) - (new_metadata_loc - new_mapper_loc)
        if exceeded_bytes > 0:
            new_metadata_loc += exceeded_bytes
        f.seek(new_metadata_loc)
        f.write(zlib.compress(metadata_df.to_csv(index=False).encode('utf-8')))
        f.seek(0)
        f.write(int.to_bytes(new_mapper_loc, 8, "little", signed=False))
        f.write(int.to_bytes(new_metadata_loc, 8, "little", signed=False))
    return identity_hash

def read_img_v2(identity_hash: str):
    identity_salt, target_hash = identity_hash.split("$")
    with open(IMDB_PATH, "rb") as f:
        mapper_loc = int.from_bytes(f.read(8), "little", signed=False)
        metadata_loc = int.from_bytes(f.read(8), "little", signed=False)
        f.seek(mapper_loc)
        mapper_bytes = BytesIO(f.read(metadata_loc - mapper_loc))
        for _ in range(len(mapper_bytes.getvalue()) // 64):
            salt = hex(int.from_bytes(mapper_bytes.read(16), "little", signed=False))
            hash = hex(int.from_bytes(mapper_bytes.read(32), "little", signed=False))
            #print('checking', salt +"$" + hash)
            if int(identity_salt, 16) == int(salt, 16) and int(target_hash, 16) == int(hash, 16):
                index = int.from_bytes(mapper_bytes.read(8), "little", signed=False)
                size = int.from_bytes(mapper_bytes.read(8), "little", signed=False)
                f.seek(index)
                img = zlib.decompress(f.read(size))
                return img
            mapper_bytes.read(16)
    return None

def del_img_v2(identity_hash: str):
    with open(IMDB_PATH, "rb") as f:
        mapper_loc = int.from_bytes(f.read(8), "little", signed=False)
        metadata_loc = int.from_bytes(f.read(8), "little", signed=False)
        f.seek(mapper_loc)
        mapper_buff = BytesIO(f.read(metadata_loc - mapper_loc))
        f.seek(metadata_loc)
        metadata_bytes = BytesIO(zlib.decompress(f.read()))
    mapper = {}
    for i in range(len(mapper_buff.getvalue()) // 64):
        mapper_buff.seek(i * 64)
        salt = bytes(mapper_buff.read(16)[::-1]).hex()
        hash = bytes(mapper_buff.read(32)[::-1]).hex()
        index = int.from_bytes(mapper_buff.read(8), "little", signed=False)
        size = int.from_bytes(mapper_buff.read(8), "little", signed=False)
        mapper[salt + "$" + hash] = (index, size)
    metadata_df = pd.read_csv(metadata_bytes)
    mapper_buff.close()
    metadata_bytes.close()
    if identity_hash not in mapper:
        return False
    img_loc, img_size = mapper.pop(identity_hash)
    metadata_df = metadata_df[metadata_df['identity'] != identity_hash]
    with open(IMDB_PATH, "r+b") as f:
        f.seek(img_loc + img_size)
        img_bytes = f.read(mapper_loc - (img_loc + img_size))
        f.seek(img_loc)
        f.write(img_bytes)
        for key, (index, size) in mapper.items():
            if index >= img_loc + img_size:
                mapper[key] = (index - img_size, size)
        mapper_loc -= img_size
        f.seek(mapper_loc)
        mapper_buffer = BytesIO()
        for key, (index, size) in mapper.items():
            salt, hash = key.split("$")
            mapper_buffer.write(int.to_bytes(int(salt, 16), 16, "little", signed=False))
            mapper_buffer.write(int.to_bytes(int(hash, 16), 32, "little", signed=False))
            mapper_buffer.write(int.to_bytes(index, 8, "little", signed=False))
            mapper_buffer.write(int.to_bytes(size, 8, "little", signed=False))
        mapper_bytes = mapper_buffer.getvalue()
        mapper_buffer.close()
        f.write(mapper_bytes)
        metadata_loc = mapper_loc + len(mapper_bytes)
        f.seek(metadata_loc)
        f.write(zlib.compress(metadata_df.to_csv(index=False).encode('utf-8')))
        f.seek(0)
        f.write(int.to_bytes(mapper_loc, 8, "little", signed=False))
        f.write(int.to_bytes(metadata_loc, 8, "little", signed=False))
    return True

    

        

def read_metadata_v2() -> pd.DataFrame:
    with open(IMDB_PATH, "rb") as f:
        f.seek(8)
        metadata_loc = int.from_bytes(f.read(8), "little", signed=False)
        f.seek(metadata_loc)
        return pd.read_csv(BytesIO(zlib.decompress(f.read())))

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

def identity_hash_validation_v2(hash: str, identity: str):
    salt, expected_hash = identity.split("$")
    salt = bytes.fromhex(salt)
    expected_hash = bytes.fromhex(expected_hash)
    compare_identity = hashlib.pbkdf2_hmac('sha256', bytes.fromhex(hash), salt, 100000)
    return hmac.compare_digest(compare_identity, expected_hash)

def img_metadata_v2(seed: int, prompt: str, negative_prompt: str, width: int, height: int, steps: int, guidance_scale: float) -> dict:
    if type(prompt) is float:
        prompt = ""
    if type(negative_prompt) is float:
        negative_prompt = ""
    prompt = ",".join([tag.strip() for tag in prompt.split(",")])
    negative_prompt = ",".join([tag.strip() for tag in negative_prompt.split(",")])
    img_metadata = {
        "seed": int(seed),
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "width": int(width),
        "height": int(height),
        "steps": int(steps),
        "guidance_scale": float(guidance_scale),
        "labeled": False,
        "label": prompt,
    }
    print(img_metadata)
    data_string = json.dumps({k:v for k, v in img_metadata.items() if k in ["seed", "prompt", "negative_prompt", "width", "height", "steps", "guidance_scale"]}, sort_keys=True, separators=(',', ':'))
    data_bytes = data_string.encode('utf-8')
    salt = os.urandom(16)
    sha256_hash = hashlib.pbkdf2_hmac('sha256', data_bytes, salt, 100000)
    identity_hash = f"{salt.hex()}${sha256_hash.hex()}"
    img_metadata["identity"] = identity_hash
    return img_metadata

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

# migration v1 -> v2
# meta = load_metadata()
# for data in meta.itertuples(index=True):
#     IMDB_PATH = "data.imdb"
#     img = load_img(data.hash)
#     seed = data.seed
#     prompt = data.prompt
#     negative_prompt = data.negative_prompt
#     width = data.width
#     height = data.height
#     steps = data.steps
#     guidance_scale = data.guidance_scale
#     IMDB_PATH = "datav2.imdb"
#     write_v2(
#         identity_hash=None,
#         uncompressed_img=img,
#         seed=seed,
#         prompt=prompt,
#         negative_prompt=negative_prompt,
#         width=width,
#         height=height,
#         steps=steps,
#         guidance_scale=guidance_scale
#     )

# h = "f7426c5305500f6257aa62c1b4f76a28d5fd6a54e43b8ca4b1977447174e3479"
# metadata_df = pd.read_csv("/Users/kitsui/workingspace/prune/imagineit_app/static/data/sd_images/metadata.csv")
# for entry in metadata_df.itertuples(index=True):
#     with open(f"/Users/kitsui/workingspace/prune/imagineit_app/static/data/sd_images/{entry.hash}.png", "rb") as f:
#         img = f.read()
#     write_v2(
#         identity_hash=None,
#         uncompressed_img=img,
#         seed=entry.seed,
#         prompt=entry.prompt,
#         negative_prompt=entry.negative_prompt,
#         width=entry.width,
#         height=entry.height,
#         steps=entry.steps,
#         guidance_scale=entry.guidance_scale
#     )

# df = read_metadata_v2()
# hashes = df['identity'].tolist()
# for h in hashes:
#     img = read_img_v2(h)
#     print(img is not None)
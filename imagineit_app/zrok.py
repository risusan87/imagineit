import subprocess
import re

def zrok_enable(token: str):
    subprocess.run(["zrok", "enable", token])

def zrok_disable():
    subprocess.run(["zrok", "disable"])

def zrok_share(host: str):
    process = subprocess.Popen(["zrok", "share", "public", host], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    for line in process.stdout:
        url = re.findall(r'https://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', line)
        if len(url) > 0:
            break
    return process, url[0]


# Settingup
## Install external programs
Frontend and backend are managed by Caddy, then Zrok tunnels this network connection.

Download Caddy binary here:
https://github.com/caddyserver/caddy/releases/tag/v2.10.2
Extracted binary "caddy" must be placed at the root, where pyproject.toml is at.

For Zrok, follow their instruction at:
https://docs.zrok.io/docs/guides/install/<br>
For those first time using Zrok, this software dynamically enable/disables the servive that (VERY) easily lose reference if not managed properly. If you encounter any issue regarding Zrok, try following:
1. Run `$zrok disable`. If this does not solve the issue, 
2. Visit https://api-v1.zrok.io/ then manually release the reference.

## Install front-end
Frontend is powered by React with Vite. You will need to install dependencies before running frontend first time.

Make sure you have `npm >= 10.0`:<br>
```
$npm --version
> 11.4.2
```
Then run:
```
$cd imagineit_app/static && npm install
```

## Install back-end
Developer is not aware of specific threshold of Python version that works properly. Python tested is somewhere between 3.10 and 3.12:
```
$python --version
> Python 3.12.7
```
It is best adviced with the use of virtual environment with venv:
```
$python -m venv .venv && source ./venv/bin/activate
```
Tested environment is CPU and Nvidia GPU. If you use AMD GPU, there is a workaround as well. Apple Silicons and TPUs are currently not supported.

Make sure you are at the root of the repository where the .toml file is and Python virtual environment sourced, then run following to setup `imagineit` app:
```
$pip install -e .
```

Importantly, setup environment variables with `.env` (or export them). Following are the variables that you must setup:
```
ZROK_AUTHTOKEN=zrok_token
IMDB_PATH=path/to/the/imdbv2.imdb
```
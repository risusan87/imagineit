import os
import subprocess

os.environ["DB_NAME"] = "datav2.imdb"
os.environ["ZROK_AUTHTOKEN"] = "88xVC3a4hObj"
os.environ["IMDB_PATH"] = os.environ["DB_NAME"]

# Persistence Sign-in
from pydrive2.auth import GoogleAuth
from pydrive2.drive import GoogleDrive

settings = {
    "client_config_file": "client_secrets.json",
    "save_credentials": True,
    "save_credentials_file": "creds.txt",
    "save_credentials_backend": "file",
    "get_refresh_token": True,
    "oauth_scope": ["https://www.googleapis.com/auth/drive"]
}
gauth = GoogleAuth(settings=settings)
gauth.CommandLineAuth()

drive = GoogleDrive(gauth)
gauth.CommandLineAuth()

drive = GoogleDrive(gauth)
# folder_name = "sd_images"
file_name = os.environ["DB_NAME"] # imdb # imdb
local_folder_path = file_name # os.path.join("/content", file_name)
folder_list = drive.ListFile({'q': f"title='{file_name}' and trashed=false"}).GetList()
file_on_cloud = folder_list[0] if folder_list else None
if file_on_cloud is None:
    print(f"Image data not exist. Creating '{file_name}' on Google Drive...")
    folder_metadata = {
        'title': file_name
    }
    folder = drive.CreateFile(folder_metadata)
    folder.Upload()
    print(f"Your drive now has {file_name}")
    if not os.path.exists(local_folder_path):
        with open(local_folder_path, "w"):
            pass
        print(f"'{file_name}' created successfully.")
else:
    file_on_cloud.GetContentFile(local_folder_path)
    print(f"'{file_name}' downloaded successfully.")

try:
    subprocess.run(["imagineit"])
except KeyboardInterrupt:
    pass
finally:
    # Save the sd_images folder back to drive with updated logic
    # folder_name = "sd_images"
    file_name = os.environ["DB_NAME"]
    local_folder_path = os.environ.get("IMDB_PATH")

    # Query to find the folder on Google Drive
    folder_list = drive.ListFile({'q': f"title='{file_name}' and trashed=false"}).GetList()
    file_on_cloud = folder_list[0]
    # if folder_list:
    #     drive_folder_id = folder_list[0]['id']
    # else:
    #     # Folder does not exist, create it
    #     print(f"Creating folder '{folder_name}' on Google Drive...")
    #     folder_metadata = {
    #         'title': folder_name,
    #         'mimeType': 'application/vnd.google-apps.folder'
    #     }
    #     folder = drive.CreateFile(folder_metadata)
    #     folder.Upload()
    #     drive_folder_id = folder['id']

    # List existing files in the Google Drive folder for comparison
    # print("Checking for existing files on Google Drive...")
    # existing_files_list = drive.ListFile({'q': f"'{drive_folder_id}' in parents and trashed=false"}).GetList()
    # drive_files = {file['title']: file for file in existing_files_list}
    # print(f"Found {len(drive_files)} existing files in the '{folder_name}' folder.")

    # # Iterate through local files and apply synchronization logic
    file_on_cloud.SetContentFile(local_folder_path)
    # print(f"Starting synchronization of local folder '{local_folder_path}' to Google Drive...")
    # for file_name in os.listdir(local_folder_path):
    #     local_file_path = os.path.join(local_folder_path, file_name)
    #     if os.path.isfile(local_file_path):
    #         is_png = file_name.lower().endswith('.png')
    #         is_csv = file_name.lower().endswith('.csv')

    #         # Check if the file already exists on Drive
    #         if file_name in drive_files:
    #             if is_csv:
    #                 # Always update CSV files
    #                 print(f"Updating existing CSV file: {file_name}...")
    #                 drive_file = drive_files[file_name]
    #                 drive_file.SetContentFile(local_file_path)
    #                 drive_file.Upload()
    #             elif is_png:
    #                 # Ignore existing PNG files as requested
    #                 print(f"Ignoring existing PNG file: {file_name}")
    #             # Other existing files will be ignored. To update them, add an else block here.
    #         else:
    #             # File does not exist on Drive, so upload it
    #             print(f"Uploading new file: {file_name}...")
    #             file_metadata = {
    #                 'title': file_name,
    #                 'parents': [{'id': drive_folder_id}]
    #             }
    #             file_to_upload = drive.CreateFile(file_metadata)
    #             file_to_upload.SetContentFile(local_file_path)
    #             file_to_upload.Upload()
    file_on_cloud.Upload()
    print("Syncrionization Successful")

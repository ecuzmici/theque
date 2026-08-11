# Kobo Clara BW — device setup handoff

Scope: the on-device work only. This document does not cover the theque side.
Do this work on a computer with a USB cable and the device in your hands.

Target flow when you finish: you put an EPUB file in a Google Drive folder.
The Kobo downloads the file by itself on the next sync.

## Before you start

You need these items:

1. The Kobo Clara BW, unopened.
2. A USB-C cable.
3. A computer with a text editor that keeps Unix line endings.
4. A WiFi network and its password.
5. About 45 minutes.

Do not put any files on the device before step 4. A factory reset or a
firmware update can delete them.

## Step 1 — Create the Google account

1. Open a private browser window.
2. Go to `https://accounts.google.com/signup`.
3. Create the account. Use a name she will keep, for example
   `firstname.reads@gmail.com`.
4. Write down the address and the password.
5. Stay signed in to this account in the private window. You need it in step 2.

## Step 2 — Create the Kobo account

1. Go to `https://www.kobo.com`.
2. Select **Sign in**, then **Create an account**.
3. Use the new Gmail address from step 1.
4. Open the new Gmail inbox and confirm the verification email.

You can also create this account during step 3 on the device. The browser is
faster and the on-screen keyboard is slow.

## Step 3 — First boot

1. Charge the device for 30 minutes before the first boot.
2. Hold the power button until the screen turns on.
3. Select the language.
4. Connect to WiFi.
5. Sign in with the Kobo account from step 2.
6. Skip the Kobo Plus offer and the reading-goal screens.

The device now shows the home screen.

## Step 4 — Let the firmware update finish

1. Go to **More → Settings → Device information**.
2. Read the software version.
3. Select **Check for updates**.
4. Wait for the update and the restart. This can take 15 minutes.
5. Repeat steps 2 to 4 until no update remains.

Do this before you install KoboCloud. A firmware update can remove KoboCloud.
Kobo gives no switch to stop automatic updates. Plan to reinstall KoboCloud
after a future update.

## Step 5 — Create the Google Drive folder

Do not create this folder in the Drive web UI. theque holds the
`drive.file` OAuth scope. That scope hides every folder that theque did not
create, so an upload to a folder made by hand fails with a 404. The command
below creates the folder through the API and shares it in one step.

1. Open a terminal in the theque project folder.
2. Check that `.env.local` holds the three `GOOGLE_DRIVE_` OAuth variables.
3. Check that the refresh token belongs to the new Google account from step 1.
4. Run `npm run drive:create-folder`.
5. The command creates a folder named `Kobo`. It sets access to **Anyone with
   the link** and the role to **Viewer**.
6. Copy the printed `GOOGLE_DRIVE_FOLDER_ID=` line into `.env.local`.
7. Set the same variable in the Vercel project for production.
8. Copy the printed folder link. The link looks like
   `https://drive.google.com/drive/folders/<ID>`.
9. Save the link in a note. You need it in step 7.

Run this command one time only. A second run creates a second folder. The
device reads one folder only, so half of the books never arrive.

KoboCloud reads public share links only. It cannot read a private folder.
Anybody who holds this link can read the folder. Do not put private files in it.

KoboCloud does not read subfolders. Keep all EPUB files at the top level of
the `Kobo` folder.

## Step 6 — Install KoboCloud

1. Go to `https://github.com/fsantini/KoboCloud/releases`.
2. Download `KoboRoot.tgz`. Do not unpack it.
3. Connect the Kobo to the computer with the USB cable.
4. Select **Connect** on the device screen.
5. Open the `KOBOeReader` drive.
6. Show hidden files in your file manager.
7. Copy `KoboRoot.tgz` into the `.kobo` folder.
8. Eject the drive safely.
9. Disconnect the cable.

The device installs the package and restarts. The screen shows an update
message for about one minute.

Safari users: Safari unpacks the file to `KoboRoot.tar` on download. Use a
different browser.

## Step 7 — Configure KoboCloud

1. Connect the Kobo to the computer again.
2. Open the `KOBOeReader` drive.
3. Open the folder `.add/kobocloud`. If that folder is absent, look for
   `.adds/kobocloud`.
4. Open the file `kobocloudrc` in a text editor.
5. Add the share link from step 5 on its own line.
6. Put no space before the link. Put no space after the link.
7. Save the file with Unix line endings.
8. Eject the drive safely.
9. Disconnect the cable.

## Step 8 — Test the sync

1. Put one small EPUB file in the Google Drive `Kobo` folder.
2. On the device, select the sync icon at the top of the home screen.
3. Wait for the sync to finish.
4. Wait a further 5 minutes. KoboCloud processes files after the sync.
5. Open **My Books**. The new book must appear in the list.

KoboCloud stores the downloaded files in `.add/kobocloud/Library`.

## Optional — Browse Google Drive on the device

This step gives a manual file browser. It does not give automatic download.
Skip it if step 8 works.

1. Install NickelMenu from `https://github.com/pgaskin/NickelMenu/releases`.
   Copy its `KoboRoot.tgz` into `.kobo` and eject.
2. Open `.kobo/Kobo/Kobo eReader.conf`.
3. Find the section `[OneStoreServices]`. Create the section if it is absent.
4. Add this line:
   `googledrive_link_account_start=https://authorize.kobo.com/{region}/{language}/linkcloudstorage/provider/google_drive`
5. Add this line:
   `kobo_googledrive_link_account_enabled=True`
6. Open `.adds/nm/config`.
7. Add this line:
   `menu_item:main:Google Drive:nickel_open:library:gdrive`
8. Eject the drive and let the device restart.
9. Open the new menu entry and link the Google account.

## Troubleshooting

| Symptom | Cause | Action |
|---------|-------|--------|
| No book appears after step 8 | The share link is wrong or private | Open the link in a private browser window. It must show the folder without a sign-in. |
| No book appears, link is correct | KoboCloud did not install | Repeat step 6. Check that `.add/kobocloud` exists. |
| Book appears, cover is missing | The EPUB has no cover image | Add the cover in the theque upload step. |
| Sync icon does nothing | The device lost WiFi | Reconnect WiFi in **Settings → WiFi**. |
| KoboCloud stops after some weeks | A firmware update removed it | Repeat step 6. The config file survives. |

## To remove KoboCloud

1. Open `.add/kobocloud/kobocloudrc`.
2. Delete all content.
3. Write `UNINSTALL` on one line.
4. Restart the device and connect it to WiFi. The program deletes itself.
5. Move your books out of `.add/kobocloud/Library` before you delete the folder.

## Limits of this setup

Know these limits before you promise anything:

1. The Kobo library shows sideloaded books in one flat list. It has no genre
   filter. Series names do show.
2. KoboCloud pulls files one way. It never uploads.
3. KoboCloud reads no subfolders.
4. A firmware update can remove KoboCloud. The Drive folder and the config
   file are not affected.

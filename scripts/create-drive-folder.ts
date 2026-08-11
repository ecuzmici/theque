/**
 * One-shot bootstrap: make the Google Drive folder that holds the synced EPUB
 * files, and share it with anybody who holds the link.
 *
 * The OAuth scope is https://www.googleapis.com/auth/drive.file. That scope
 * shows the app only the files that the app made. A folder that a person makes
 * in the Drive web UI stays invisible to the app, and every upload to it fails
 * with a 404. Thus the app must make the folder through the API.
 *
 * Usage:
 *   npm run drive:create-folder
 *   npm run drive:create-folder -- "Kobo books"
 *   npm run drive:create-folder -- --force
 *
 * (The npm script passes --conditions=react-server so the "server-only" guard
 * in the imported Drive client resolves to its no-op build under tsx.)
 *
 * Requires GOOGLE_DRIVE_CLIENT_ID + GOOGLE_DRIVE_CLIENT_SECRET +
 * GOOGLE_DRIVE_REFRESH_TOKEN in env (or .env.local). It does not need
 * GOOGLE_DRIVE_FOLDER_ID, because it makes that value.
 *
 * Privacy: this script prints the folder name, the folder id and the folder
 * link only. It never prints the client secret, the refresh token or an access
 * token. A folder id is not a secret, because it is part of the share link.
 */

import { loadEnvConfig } from "@next/env";

import { createSyncFolder, DriveError } from "../src/lib/drive/client";

loadEnvConfig(process.cwd());

const DEFAULT_FOLDER_NAME = "Kobo";

const args = process.argv.slice(2);
const force = args.includes("--force");
const folderName = args.find((arg) => !arg.startsWith("--")) ?? DEFAULT_FOLDER_NAME;

function printPasteLine(id: string): void {
  console.log("");
  console.log("Paste this line into .env.local, and set the same variable in Vercel:");
  console.log("");
  console.log(`  GOOGLE_DRIVE_FOLDER_ID=${id}`);
}

async function run(): Promise<void> {
  const current = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (current && !force) {
    // A second folder splits the library. The device reads one folder only, so
    // half of the books never arrive.
    console.error(`GOOGLE_DRIVE_FOLDER_ID is already set to ${current}.`);
    console.error("This script makes a NEW folder. Two folders split the library.");
    console.error("The device reads one folder only, so half of the books never arrive.");
    console.error("");
    console.error("Run this command again only if you really want a new folder:");
    console.error("  npm run drive:create-folder -- --force");
    process.exitCode = 1;
    return;
  }

  console.log(`Creating the Drive folder "${folderName}"...`);
  const folder = await createSyncFolder(folderName);

  console.log("");
  console.log("Drive folder created and shared.");
  console.log("");
  console.log(`  name  ${folderName}`);
  console.log(`  id    ${folder.id}`);
  console.log(`  open  ${folder.webViewLink}`);
  printPasteLine(folder.id);
  console.log("");
  console.log("Anybody who holds the link can read this folder. Keep private files out of it.");
  console.log("Keep all EPUB files at the top level. KoboCloud does not read subfolders.");
}

run().catch((error: unknown) => {
  if (error instanceof DriveError) {
    console.error(`Drive bootstrap failed (${error.code}): ${error.message}`);
    // The folder exists, so the operator must keep the id. A new run would make
    // a second folder.
    if (error.folderId) printPasteLine(error.folderId);
    process.exitCode = 1;
    return;
  }
  console.error(error);
  process.exitCode = 1;
});

import { exec, execSync } from 'node:child_process';
import { glob } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

/**
 * @example
 * "    iPad Pro 13-inch (M5) (F16AE60F-D893-491F-A63A-95DB4D73AC84) (Booted)"
 */
const simctlDevicePattern =
  /\s*(.*) \(([0-9A-Za-z]{8}-[0-9A-Za-z]{4}-4[0-9A-Za-z]{3}-[89ABab][0-9A-Za-z]{3}-[0-9A-Za-z]{12})\) \((Booted|Shutdown)\)/;

async function main() {
  const stdout = execSync('xcrun simctl list devices', { encoding: 'utf-8' });

  const booted = new Map<Uppercase<string>, string>();
  for (const line of stdout.split('\n')) {
    const match = simctlDevicePattern.exec(line);
    if (!match) {
      continue;
    }

    const [_fullmatch, deviceName, uuid, status] = match;
    if (status !== 'Booted') {
      continue;
    }

    booted.set(uuid.toUpperCase() as Uppercase<string>, deviceName);
  }

  const fileProviderStorages = new Map<
    Uppercase<string>,
    { deviceName: string; storagePath: string }
  >();

  for (const [uuid, deviceName] of booted.entries()) {
    for await (const {
      plistPath,
      plist: { MCMMetadataIdentifier },
    } of walkAppGroups(uuid)) {
      if (
        // The Apple Files app
        MCMMetadataIdentifier !== 'group.com.apple.FileProvider.LocalStorage'
      ) {
        continue;
      }

      fileProviderStorages.set(uuid, {
        deviceName,
        storagePath: path.resolve(
          path.dirname(plistPath),
          'File Provider Storage',
        ),
      });
    }
  }

  // Map(1) {
  //   'AEFDBC13-07B0-4B77-A085-CF95B2BB6484' => {
  //     deviceName: 'iPhone 17 Pro',
  //     storagePath: '/Users/jamie/Library/Developer/CoreSimulator/Devices/AEFDBC13-07B0-4B77-A085-CF95B2BB6484/data/Containers/Shared/AppGroup/546B5F27-F792-4FCB-B7C8-8E7075E5AC16/File Provider Storage'
  //   }
  // }
  console.log(fileProviderStorages);
}

main();

/**
 * Walks all AppGroups for a given iOS Simulator.
 *
 * @yields
 * - `plist`: The plist for the App Group, in JSON format.
 * - `plistPath`: The path to said plist.
 */
async function* walkAppGroups(simulatorUuid: Uppercase<string>) {
  const appGroups = path.resolve(
    homedir(),
    `Library/Developer/CoreSimulator/Devices/${simulatorUuid}/data/Containers/Shared/AppGroup/*/.com.apple.mobile_container_manager.metadata.plist`,
  );

  for await (const plistPath of glob(appGroups)) {
    const plist = await parsePlist(plistPath);
    yield { plistPath, plist };
  }
}

async function parsePlist(plistPath: string) {
  const stdout = await new Promise<string>((resolve, reject) => {
    exec(`plutil -convert json -o - ${plistPath}`, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });

  return JSON.parse(stdout);
}

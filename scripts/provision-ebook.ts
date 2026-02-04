import { exec, execSync, spawn } from 'node:child_process';
import readline from 'node:readline';
import { glob } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { checkbox } from '@inquirer/prompts';

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

  const simulators = await checkbox({
    message: 'Select which simulators to sync ebooks to',
    choices: [
      ...fileProviderStorages.entries().map(value => {
        const [uuid, { deviceName }] = value;
        return { name: `${deviceName} (${uuid})`, value, checked: true };
      }),
    ],
  });

  for (const [_simulator, { deviceName, storagePath }] of simulators) {
    console.log(`Syncing ${deviceName}...`);

    const stdout = await syncEbooks({
      source: '/Users/jamie/Library/Mobile Documents/com~apple~CloudDocs/epubs',
      dest: path.resolve(storagePath, 'epubs'),
      extraFlags: [
        // '--dry-run',
        '--exclude=.DS_Store',
        '--exclude=exclude',
        // (yes, it's correct to omit quotes here)
        '--exclude=AZW3 to EPUB.app',
      ],
    });
    console.log(stdout);
  }
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

function syncEbooks({
  source,
  dest,
  extraFlags = [],
}: {
  source: string;
  dest: string;
  extraFlags?: Array<string>;
}) {
  return new Promise<string>((resolve, reject) => {
    const command = [
      'rsync',
      [
        '-avv',
        '--progress',
        // '--quiet',
        ...extraFlags,
        `${source.replace(/\/*$/, '/')}`,
        `${dest.replace(/\/*$/, '/')}`,
      ],
    ] as const;

    console.log(`Running:\n${command[0]} ${command[1].join(' ')}`);

    const cp = spawn(...command, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (!cp.stdout || !cp.stderr) {
      return reject(new Error('Child process had no stdout/stderr.'));
    }

    const stdoutInterface = readline.createInterface({
      input: cp.stdout,
      crlfDelay: Infinity,
    });
    const stderrInterface = readline.createInterface({
      input: cp.stderr,
      crlfDelay: Infinity,
    });

    let stdout = '';
    let stderr = '';

    stdoutInterface.on('line', line => {
      stdout += `${line}\n`;
    });

    stderrInterface.on('line', line => {
      stderr += `${line}\n`;
    });

    cp.on('close', (code, signal) => {
      if (code) {
        reject(
          new Error(
            `Child process with code ${code} and signal ${signal}. stderr: ${stderr}`,
          ),
        );
        return;
      }

      resolve(stdout);
    });
  });
}

// Reads updateUrl from launcher.config.json so the update address lives in one place.
const config = require('./resources/launcher.config.json')

const updateUrl = (config.updateUrl || '').trim()
if (!updateUrl) console.warn('\n  ! launcher.config.json içinde updateUrl boş: otomatik güncelleme dosyası (latest.yml) üretilmeyecek.\n')

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.static.launcher',
  productName: 'Static Launcher',
  copyright: 'Copyright © 2026 Static',
  directories: { output: 'release', buildResources: 'resources' },
  files: ['out/**', 'package.json', '!**/*.map'],
  extraResources: [
    { from: 'resources/launcher.config.json', to: 'launcher.config.json' },
    { from: 'resources/icon.png', to: 'icon.png' }
  ],
  asar: true,
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'resources/icon.png',
    artifactName: 'StaticLauncher-Setup-${version}.${ext}'
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: 'always',
    createStartMenuShortcut: true,
    shortcutName: 'Static Launcher',
    uninstallDisplayName: 'Static Launcher',
    installerLanguages: ['tr_TR'],
    language: '1055',
    deleteAppDataOnUninstall: false
  },
  // generic = any https folder; electron-builder writes latest.yml next to the installer
  publish: updateUrl ? [{ provider: 'generic', url: updateUrl.endsWith('/') ? updateUrl : updateUrl + '/' }] : null
}

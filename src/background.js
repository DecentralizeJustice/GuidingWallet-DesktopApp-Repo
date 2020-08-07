'use strict'
// '/Applications/GuidingWallet.app/Contents/Resources/node_modules/@deadcanaries/granax'
import path from 'path'
import { fork } from 'child_process'
import { app, protocol, BrowserWindow } from 'electron'
import {
  createProtocol,
  installVueDevtools
} from 'vue-cli-plugin-electron-builder/lib'
const log = require('electron-log')
// const fs = require('fs-extra')
const isDevelopment = process.env.NODE_ENV !== 'production'
const { autoUpdater } = require('electron-updater')
autoUpdater.autoDownload = false
const { ipcMain } = require('electron')
const options = {
  stdio: ['pipe', 'pipe', 'pipe', 'ipc']
}
// eslint-disable-line
let port
let sender
function setPort (portNumber) {
  log.warn('portSet', portNumber)
  if (!isDevelopment) {
    win.webContents.session.setProxy({ proxyRules: 'socks5://127.0.0.1:' + portNumber })
  }
}
const resourcePath = app.getAppPath().slice(0, -9)
log.warn(app.getAppPath())
let granaxLocation = resourcePath + '/node_modules/@deadcanaries/granax'
let manageTorPath = path.join(resourcePath, '/public/manageTor.js')
if (isDevelopment) {
  manageTorPath = './public/manageTor.js'
  granaxLocation = '@deadcanaries/granax'
}
const child = fork(manageTorPath, [granaxLocation, resourcePath], options)
child.stderr.on('data', function (data) {
  log.warn('stdout: ' + data)
})
child.on('error', (err) => {
  log.error(err)
})
child.on('exit', () => {
  log.error('Exiting Process')
})
child.on('close', () => {
  log.error('Closing')
})
try {
  child.on('message', message => {
    if (message.port) {
      setPort(message.port)
    }
    if (message.dormant) {
      sender.send('dormant', message.dormant)
    }
    if (message.circuitEstablished) {
      sender.send('circuitEstablished', message.circuitEstablished)
    }
  })
} catch (e) {
  log.error(e)
}
ipcMain.on('dormant', event => {
  try {
    sender = event.sender
    child.send({ dormant: true })
  } catch (e) {
    // log.error(e)
  }
})
ipcMain.on('circuitEstablished', (event, message) => {
  try {
    sender = event.sender
    child.send({ circuitEstablished: true })
  } catch (e) {
    // log.error(e)
  }
})
// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win
// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { secure: true, standard: true } }])

function createWindow () {
  // Create the browser window.
  win = new BrowserWindow(
    {
      width: 1500,
      height: 1000,
      icon: path.join(__static, 'icon.png'), // eslint-disable-line
      webPreferences: {
        nodeIntegration: true,
        webSecurity: false
      }
    })
  if (port) {
    setPort(port)
  }
  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    win.loadURL(process.env.WEBPACK_DEV_SERVER_URL)
    if (!process.env.IS_TEST) win.webContents.openDevTools()
  } else {
    createProtocol('app')
    // Load the index.html when not in development
    win.loadURL('app://./index.html')
  }

  win.on('closed', () => {
    win = null
  })
  win.webContents.on('will-navigate', function (event, url) {
    console.log('no navigation Allowed')
  })
  win.webContents.on('new-window', function (event, url) {
    console.log('no new Windows Allowed')
    event.preventDefault()
  })
}
app.on('will-quit', () => {
})
// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow()
  }
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  if (isDevelopment && !process.env.IS_TEST) {
    // Install Vue Devtools
    // Devtools extensions are broken in Electron 6.0.0 and greater
    // See https://github.com/nklayman/vue-cli-plugin-electron-builder/issues/378 for more info
    // Electron will not launch with Devtools extensions installed on Windows 10 with dark mode
    // If you are not using Windows 10 dark mode, you may uncomment these lines
    // In addition, if the linked issue is closed, you can upgrade electron and uncomment these lines
    try {
      await installVueDevtools()
    } catch (e) {
      console.error('Vue Devtools failed to install:', e.toString())
    }
  }
  createWindow()
})
autoUpdater.on('update-downloaded', (ev, info) => {
  autoUpdater.quitAndInstall(true, true)
})
ipcMain.on('CHECK_FOR_UPDATE_PENDING', event => {
  sender = event.sender

  // Automatically invoke success on development environment.
  if (process.env.NODE_ENV === 'development') {
    // sender.send(CHECK_FOR_UPDATE_SUCCESS);
  } else {
    autoUpdater.autoDownload = false
    const result = autoUpdater.checkForUpdates()
    result
      .then((checkResult) => {
        const { updateInfo } = checkResult
        sender.send('CHECK_FOR_UPDATE_SUCCESS', updateInfo)
      })
      .catch((err) => {
        sender.send('CHECK_FOR_UPDATE_FAILURE', err)
      })
  }
})

ipcMain.on('DOWNLOAD_UPDATE_PENDING', event => {
  autoUpdater.autoDownload = false
  const result = autoUpdater.downloadUpdate()
  const { sender } = event
  result
    .then(() => {
      sender.send('DOWNLOAD_UPDATE_SUCCESS')
    })
    .catch((err) => {
      sender.send('DOWNLOAD_UPDATE_FAILURE', err)
    })
})

// ipcMain.on('QUIT_AND_INSTALL_UPDATE', () => {
//   autoUpdater.quitAndInstall()
//   // app.quit()
// })
// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', data => {
      if (data === 'graceful-exit') {
        app.quit()
      }
    })
  } else {
    process.on('SIGTERM', () => {
      app.quit()
    })
  }
}

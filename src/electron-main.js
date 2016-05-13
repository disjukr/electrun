'use strict';

const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const ipcMain = electron.ipcMain;


function send(message) {
    if (process.connected) {
        try {
            process.send(message);
        } catch (err) {
            console.error(err && err.stack || err);
        }
    }
}
app.once('ready', () => send('ready'));
process.on('message', req => {
    handlers[req.type](req).then(result => {
        send({
            type: req.type,
            requestId: req.requestId,
            result: result
        });
    }).catch(err => {
        let _err = err instanceof Error ? {
            name: err.name,
            message: err.message,
            stack: err.stack
        } : err;
        send({
            type: 'error',
            requestId: req.requestId,
            error: _err
        });
    });
});

const handlers = {};
const windows = {};
const authMap = new WeakMap();

handlers['open'] = req => Promise.resolve().then(() => {
    const window = new BrowserWindow(req.options);
    const { windowId } = req;
    const { webContents } = window;
    const eventTypes = [
        'did-finish-load',
        'did-fail-load',
        'did-frame-finish-load',
        'did-start-loading',
        'did-stop-loading',
        'did-get-response-details',
        'did-get-redirect-request',
        'dom-ready',
        'page-favicon-updated',
        'new-window',
        'will-navigate',
        'did-navigate',
        'did-navigate-in-page',
        'crashed',
        'plugin-crashed',
        'destroyed',
        'devtools-opened',
        'devtools-closed',
        'devtools-focused',
        'certificate-error',
        'select-client-certificate',
        'login',
        'found-in-page',
        'media-started-playing',
        'media-paused',
        'did-change-theme-color',
        'cursor-changed',
    ];
    for (let eventType of eventTypes) {
        webContents.on(eventType, function sendEvent() {
            send({
                type: 'event',
                eventType: eventType,
                windowId: windowId,
                args: Array.from(arguments).map(v => { // #1
                    if (typeof v === 'function' || v && v.preventDefault) {
                        return {};
                    } else {
                        return v;
                    }
                })
            });
        });
    }
    window.on('close', () => webContents.removeAllListeners());
    windows[windowId] = window;
});

handlers['close'] = req => Promise.resolve().then(() => {
    const window = windows[req.windowId];
    window.destroy();
});

handlers['auth'] = req => Promise.resolve().then(() => {
    const window = windows[req.windowId];
    const { username, password } = req;
    if (!authMap.has(window)) {
        window.webContents.on('login', (event, request, authInfo, callback) => {
            const { username, password } = authMap.get(window);
            event.preventDefault();
            callback(username, password);
        });
    }
    authMap.set(window, { username, password });
});

handlers['goto'] = req => Promise.resolve().then(() => {
    const window = windows[req.windowId];
    window.loadURL(req.url);
    return window.webContents;
}).then(webContents => onload(webContents));

handlers['wait'] = req => new Promise(resolve => {
    setTimeout(resolve, req.ms);
});

let waitSelectorId = 0;
handlers['wait-selector'] = req => new Promise(resolve => {
    const window = windows[req.windowId];
    const message = `wait-selector-${ waitSelectorId++ }`;
    const code = `
        try {
            const { ipcRenderer } = require('electron');
            ipcRenderer.send(
                '${ message }',
                !!document.querySelector(${
                    JSON.stringify(req.selector)
                })
            );
        } catch (err) {
            console.error(err);
        }
    `;
    ipcMain.addListener(message, messageHandler);
    const intervalId = setInterval(
        () => window.webContents.executeJavaScript(code, true),
        100
    );
    function messageHandler(event, selectorResult) {
        if (selectorResult) {
            ipcMain.removeListener(message, messageHandler);
            clearInterval(intervalId);
            resolve();
        }
    }
});

handlers['eval'] = req => evalOnWindow(windows[req.windowId], req.code);

handlers['click'] = req => evalOnWindow(windows[req.windowId], `
    document.activeElement.blur();
    const event = document.createEvent('MouseEvent');
    event.initEvent('click', true, true);
    document.querySelector(${ JSON.stringify(req.selector) }).dispatchEvent(event);
`);

handlers['mousedown'] = req => evalOnWindow(windows[req.windowId], `
    document.activeElement.blur();
    const event = document.createEvent('MouseEvent');
    event.initEvent('mousedown', true, true);
    document.querySelector(${ JSON.stringify(req.selector) }).dispatchEvent(event);
`);

handlers['reload'] = req => Promise.resolve().then(() => {
    const window = windows[req.windowId];
    window.webContents.reloadIgnoringCache();
    return window.webContents;
}).then(webContents => onload(webContents));

handlers['toggle-dev-tool'] = req => {
    const { webContents } = windows[req.windowId];
    if (webContents.isDevToolsOpened()) {
        return handlers['close-dev-tool'](req);
    } else {
        return handlers['open-dev-tool'](req);
    }
};

handlers['open-dev-tool'] = req => new Promise((resolve, reject) => {
    const { webContents } = windows[req.windowId];
    if (!webContents.isDevToolsOpened()) {
        webContents.once('devtools-opened', () => resolve());
        webContents.openDevTools(req.options);
    } else {
        resolve();
    }
});

handlers['close-dev-tool'] = req => new Promise((resolve, reject) => {
    const { webContents } = windows[req.windowId];
    if (webContents.isDevToolsOpened()) {
        webContents.once('devtools-closed', () => resolve());
        webContents.closeDevTools();
    } else {
        resolve();
    }
});

let evalId = 0;
function evalOnWindow(window, codeString) {
    return new Promise((resolve, reject) => {
        const _evalId = evalId++;
        const resultMessage = `eval-result-${ _evalId }`;
        const errorMessage = `eval-error-${ _evalId }`;
        const code = `
            try {
                const evalResult = eval(${ JSON.stringify(codeString) });
                const { ipcRenderer } = require('electron');
                ipcRenderer.send('${ resultMessage }', evalResult);
            } catch (err) {
                try {
                    const { ipcRenderer } = require('electron');
                    if (err instanceof Error) {
                        ipcRenderer.send('${ errorMessage }', {
                            name: err.name,
                            message: err.message,
                            stack: err.stack
                        });
                    } else {
                        ipcRenderer.send('${ errorMessage }', err);
                    }
                } catch (_err) {
                    console.error(_err);
                }
            }
        `;
        ipcMain.addListener(resultMessage, resultMessageHandler);
        ipcMain.addListener(errorMessage, errorMessageHandler);
        window.webContents.executeJavaScript(code, true);
        function resultMessageHandler(event, result) {
            ipcMain.removeListener(resultMessage, resultMessageHandler);
            ipcMain.removeListener(errorMessage, errorMessageHandler);
            resolve(result);
        }
        function errorMessageHandler(event, err) {
            ipcMain.removeListener(resultMessage, resultMessageHandler);
            ipcMain.removeListener(errorMessage, errorMessageHandler);
            reject(err);
        }
    });
}

function onload(webContents) {
    return new Promise((resolve, reject) => {
        webContents.addListener('did-finish-load', finishHandler);
        webContents.addListener('did-fail-load', failHandler);
        function finishHandler() {
            removeListener();
            resolve();
        }
        function failHandler(event) {
            removeListener();
            reject(event);
        }
        function removeListener() {
            webContents.removeListener('did-finish-load', finishHandler);
            webContents.removeListener('did-fail-load', failHandler);
        }
    });
}

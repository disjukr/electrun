'use strict';

const childProcess = require('child_process');
const EventEmitter = require('events');
const path = require('path');

const electronPath = require('electron-prebuilt');


class Electrun {
    constructor() {
        this.process = childProcess.spawn(
            electronPath,
            [path.join(__dirname, './electron-main.js')],
            { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] }
        );
        this._requestId = 0;
        this._windowId = 0;
        this._windows = {};
        this._ready = false;
        this.ready = new Promise(resolve => {
            if (this._ready) {
                resolve();
                return;
            }
            this.process.once('message', message => {
                if (message === 'ready') {
                    this._ready = true;
                    resolve();
                }
            })
        });
        this.ready.then(() => this.process.on('message', message => {
            if (message.type === 'event') {
                const window = this._windows[message.windowId];
                message.args.unshift(message.eventType);
                window.emit.apply(window, message.args);
            }
        }));
    }
    open(browserWindowOptions) {
        const windowId = this._windowId++;
        return this.ready.then(() => this._request({
            type: 'open',
            windowId: windowId,
            options: browserWindowOptions,
        })).then(() => {
            const window = new BrowserWindow(this, windowId);
            this._windows[windowId] = window;
            return window;
        });
    }
    kill() {
        if (this.process.connected) {
            this.process.disconnect();
            this.process.kill();
        }
    }
    _request(req) {
        return new Promise((resolve, reject) => {
            req.requestId = this._requestId++;
            const electronProcess = this.process;
            electronProcess.addListener('message', handler);
            electronProcess.send(req);
            function handler(res) {
                if (res.requestId === req.requestId) {
                    electronProcess.removeListener('message', handler);
                    if (res.type === 'error') {
                        reject(res.error);
                    } else {
                        resolve(res.result);
                    }
                }
            }
        });
    }
};

class BrowserWindow extends EventEmitter {
    constructor(electrun, windowId) {
        super();
        this.electrun = electrun;
        this.windowId = windowId;
    }
    close() {
        return this._request({ type: 'close' });
    }
    goto(urlString) {
        return this._request({ type: 'goto', url: urlString });
    }
    wait(msOrSelector) {
        if (typeof msOrSelector === 'number') {
            return this._request({ type: 'wait', ms: msOrSelector });
        }
        return this._request({ type: 'wait-selector', selector: msOrSelector });
    }
    eval(code) {
        return this._request({ type: 'eval', code: code });
    }
    reload() {
        return this._request({ type: 'reload' });
    }
    f5() {
        return this.reload();
    }
    devTool(open, openOptions) {
        if (open === void 0) {
            return this._request({ type: 'toggle-dev-tool' });
        }
        if (open) {
            return this._request({ type: 'open-dev-tool', options: openOptions });
        } else {
            return this._request({ type: 'close-dev-tool' });
        }
    }
    f12(open) {
        return this.devTool(open);
    }
    _request(req) {
        req.windowId = this.windowId;
        return this.electrun._request(req);
    }
}

Electrun.BrowserWindow = BrowserWindow;

module.exports = Electrun;

# electrun
browser automation library.
inspired by [nightmare](https://github.com/segmentio/nightmare/)


## install
```js
npm install --save electrun
```


## example
```sh
npm install -g babel@5
babel-node example.js
```

**example.js**
```js
import Electrun from 'electrun';

async function main() {
    let electrun = new Electrun();
    electrun.process.stdout.pipe(process.stdout);
    electrun.process.stderr.pipe(process.stderr);

    let w = await electrun.open({ width: 1024, height: 768, show: true });
    await w.goto('about:blank');
    await w.devTool(true);
    await w.eval(`process.stdout.write('hello, electrun!\\n')`);
    await w.eval(`console.log('this will presented on devtool')`);
    await w.wait(3000);
    w.goto('http://google.com/');
    await w.wait('#lst-ib');

    // following code is todo
    await w.val('#lst-ib', 'electron');
    await w.submit('form');
    w.once('did-finish-load', async () => {
        await w.saveScreenshot('./electron.png');
    });
}

main().catch(err => console.error(err && err.stack || err));
```


## api

### Electrun
 - `open([browserWindowOptions]) -> Promise<BrowserWindow>`: open and returns browser window ([options](https://github.com/electron/electron/blob/master/docs/api/browser-window.md#new-browserwindowoptions))
 - `kill() -> void`: kill electron process

### BrowserWindow
 - `close() -> Promise`: close browser window
 - `auth(username, password) -> Promise`: set user info for passing basic authentication
 - `goto(urlString) -> Promise`: goto url
 - `wait(msOrSelector) -> Promise`: wait till selected element is present
 - `eval(code) -> Promise<JsonValue>`: eval javascript code and return result
 - `reload() -> Promise`: reload page
 - `f5() -> Promise`: same as `reload`
 - `devTool() -> Promise`: toggle developer tool
 - `devTool(true) -> Promise`: open developer tool
 - `devTool(false) -> Promise`: close developer tool
 - `f12() -> Promise`: same as `devTool`

#### todo
 - `click(selector) -> Promise`
 - `mousedown(selector) -> Promise`
 - `val(selector) -> Promise<JsonValue>`
 - `val(selector, value) -> Promise`
 - `screenshot([rect]) -> Promise<Buffer>`: returns screenshot as png buffer ([rect](https://github.com/electron/electron/blob/master/docs/api/browser-window.md#wincapturepagerect-callback))
 - `saveScreenshot(savePath[, rect]) -> Promise`: save screenshot as png
 - `pdf([options]) -> Promise<Buffer>`: ([options](https://github.com/electron/electron/blob/master/docs%2Fapi%2Fweb-contents.md#webcontentsprinttopdfoptions-callback))
 - `savePdf(savePath[, options]) -> Promise`


## license
[zlib](./LICENSE)

const { spawn, exec } = require('node:child_process')
const { join } = require('node:path')
const { SerialPort } = require('serialport')
const { platform } = require("node:os")

console.log(platform())

const runApp = (path) => {
    const config = {
        path: path,
        baudRate: 115200,
        pathToFile: join(__dirname, 'testfirm.bin').toString()
    }

    const args = [new Buffer.from(JSON.stringify(config))]

    // const app = spawn('node', ['index.js', [...args]])
    const fileName = "mtm-serial-port-win.exe"
    if (platform() === "darwin") fileName = "mtm-serial-port-macos"
    const app = spawn(join("release", fileName), [...args])

    app.stdout.on('data', (data) => {
        console.log(data.toString())
    })

    app.stderr.on('data', (data) => console.error(data.toString()))

    app.on('close', (code) => {
        console.log("Close code", code)
    })
}

SerialPort.list()
    .then(list => {
        console.log(list)
        const dev = list.find(d => {
            if (!d.serialNumber) return false
            if (d.serialNumber.includes("BOOT:")) return true
            return false
        })
        if (!dev) throw new Error('Didnt find bootloader Device')
        runApp(dev.path)
    })
    .catch(err => console.error(err))
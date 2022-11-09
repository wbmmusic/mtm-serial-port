const { spawn } = require('node:child_process')
const { join } = require('node:path')
const { SerialPort } = require('serialport')

const runApp = (path) => {
    const config = {
        path: path,
        baudRate: 115200,
        pathToFile: join(__dirname, 'testfirm.bin').toString()
    }

    const args = [new Buffer.from(JSON.stringify(config))]

    const app = spawn('node', ['index.js', [...args]])

    app.stdout.on('data', (data) => {
        console.log(data.toString())
    })

    app.on('close', (code) => {
        console.log("Close code", code)
    })
}

SerialPort.list()
    .then(list => {
        console.log(list)
        const dev = list.find(d => d.serialNumber.includes("BOOT:"))
        if (!dev) throw new Error('Didnt find bootloader Device')
        runApp(dev.path)
    })
    .catch(err => console.error(err))
const { spawn } = require('node:child_process')
const { join, normalize } = require('node:path')

const config = {
    port: 'COM7',
    baudRate: 115200,
    pathToFile: join('C:', 'testfirm.bin').toString()
}

const args = [new Buffer.from(JSON.stringify(config))]

const app = spawn('node', ['index.js', [...args]])

app.stdout.on('data', (data) => {
    console.log(data.toString())
})

app.on('close', (code) => {
    console.log("Close code", code)
})
const { SerialPort } = require('serialport')
const { readFileSync } = require('node:fs')

console.log('hello')
console.log(process.argv)

const config = JSON.parse(process.argv[2])
console.log(config)

const fileData = readFileSync(config.pathToFile)

const sendProgramCommand = async(port) => {
    return new Promise(async(resolve, reject) => {
        const exit = (err) => {
            clearTimeout(timer)
            port.removeListener('data', handleData)
            if (err) reject(err)
            else resolve()
        }
        const handleData = (data) => {
            if (data.toString().includes('WBM:READY')) {
                console.log('Device is ready for sequence')
                exit()
            } else exit(new Error("Didn't get expected response in sendProgramCommand"))
        }
        const timer = setTimeout(() => exit(new Error('sendProgramCommand timed out')), 1000);
        port.on('data', handleData)
        port.write('WBM:LOAD')
    })
}

const olsendPage = async(page) => {
    console.log('Send Page')
    return new Promise(async(resolve, reject) => {
        const exit = (err) => {
            console.log("Send Page exit", err)
            clearInterval(timer)
            port.removeListener('data', handleData)
            if (err) reject(err)
            else resolve()
        }

        const handleData = (data) => {
            console.log('handleData', data.length)
            if (JSON.stringify([...data]) === JSON.stringify([...page])) {
                exit()
            } else {
                exit(new Error('Page Mismatch in sendPage'))
            }
        }

        // console.log("Send Page")
        let timer = setTimeout(() => exit(new Error('sendPage timed out')), 1000);
        // console.log('Sending Page', page.length)
        port.on('data', handleData)
        port.write(new Buffer.from(page))
    })

}

const sendHalfPage = async(port, pageHalf, half) => {
    // console.log('Send Page Half', half)
    return new Promise(async(resolve, reject) => {
        const exit = (err) => {
            // console.log("Send Page exit", err)
            clearInterval(timer)
            port.removeListener('data', handleData)
            if (err) reject(err)
            else resolve()
        }

        const handleData = (data) => {
            // console.log('handleData', data.length)
            if (JSON.stringify([...data]) === JSON.stringify([...pageHalf])) {
                exit()
            } else {
                exit(new Error('Page Mismatch in sendPage'))
            }
        }

        // console.log("Send Page")
        let timer = setTimeout(() => exit(new Error('sendPage timed out')), 1000);
        // console.log('Sending Page', page.length)
        port.on('data', handleData)
        if (half === 0) {
            const msg = new Buffer.from("WBM:PAGE0")
            port.write(Buffer.concat([msg, new Buffer.from(pageHalf)]))
        } else {
            const msg = new Buffer.from("WBM:PAGE1")
            port.write(Buffer.concat([msg, new Buffer.from(pageHalf)]))
        }

    })
}

const sendPage = async(port, page) => {
    // page.forEach((byte, idx) => console.log(idx, byte))
    return new Promise(async(resolve, reject) => {
        try {
            await sendHalfPage(port, page.slice(0, 32), 0)
            await sendHalfPage(port, page.slice(32, 64), 1)
            resolve()
        } catch (error) {
            reject(error)
        }
    })

}

const sendDone = async() => {
    // console.log('Send Done')
    return new Promise(async(resolve, reject) => {
        const exit = (err) => {
            // console.log("Exit done", err)
            clearInterval(timer)
            if (port) port.removeListener('data', handleData)
            if (err) reject(err)
            else resolve()
        }
        const handleData = (data) => {
            // console.log("Done Data", data.toString())
            if (data.toString().includes('WBM:DONE')) {
                // console.log("Got Done")
                exit()
            } else exit(new Error('Unexpected Response in sendDone'))
        }
        const timer = setTimeout(() => exit(new Error('sendDone timed out')), 1000);
        port.on('data', handleData);
        port.write('WBM:DONE', (err) => {
            if (err) exit(error)
        })
    })
}

const sendBootToBootloader = async() => {
    const serial = connectedDeviceInfo.serialNumber.split(':')[1]
    return new Promise(async(resolve, reject) => {
        const exit = (err) => {
            clearTimeout(timeout)
            bootEmitter.removeListener('bootloaderDeviceConnected', handleEvent)
            port.removeListener('data', handleData)
            if (err) reject(err)
            else {
                bootloader.waiting = true
                bootloader.serialNumber = serial
                resolve()
            }
        }

        const handleData = (data) => {
            if (data.toString() === "WBM:BOOT") { console.log("Got This Message in boot to bootloader", data.toString()) }
        }

        const handleEvent = serialNumber => {
            if (serialNumber.includes(serial)) exit()
            else exit(new Error('Bootloader device serial is not what was expected'))
        }

        const timeout = setTimeout(() => {
            exit(new Error('Timed Out sending boot to bootloader'))
        }, 3000);

        port.on('data', handleData)

        bootEmitter.on('bootloaderDeviceConnected', handleEvent)

        port.write('WBM:BOOTLOADER', () => console.log("Sent Boot To Bootloader"))
    })

}

const sendPages = async(port, pages) => {
    return new Promise(async(resolve, reject) => {
        let pagesSent = 0;
        await pages.reduce(async(acc, thePage) => {
            try {
                await acc
                await sendPage(port, thePage)
                console.log("Sent Page", pagesSent)
                pagesSent++
            } catch (error) {
                throw error
            }
        }, Promise.resolve([]))
        console.log("Sent", pagesSent, "pages")
        resolve()
    })

}

const writeMcuFlash = async(port, data) => {
    return new Promise(async(resolve, reject) => {
        try {
            const { pageSize, availableSpace } = await getDeviceInfo(port)
            console.log('Got Info | Page Size =', pageSize, "| Available Space =", availableSpace)

            if (data.length > availableSpace) reject(new Error('Sequence will not fit in EEPROM'))

            let pages = makePages(data, pageSize)
            console.log(pages.length, "Pages made")

            // send program command
            // console.log("Sending program command")
            await sendProgramCommand(port)

            // send pages
            await sendPages(port, pages)
                // console.log('Sent Pages')

            // send done
            await sendDone(port)

            resolve()

        } catch (error) {
            reject(error)
        }
    })
}

const makePages = (data, pageSize) => {
    console.log(data.length, "bytes to be packed into pages")
        // console.log(data)
    let pages = []
    let page = []
    data.forEach(byte => {
        page.push(byte)
        if (page.length === pageSize) {
            pages.push(page)
            page = []
        }
    })
    while (page.length < pageSize) page.push(0xFF)
    pages.push(page)
        // console.log("Prepared", pages.length, "pages")
    return pages
}

const getDeviceInfo = async(port) => {
    return new Promise(async(resolve, reject) => {

        const exit = (data, err) => {
            clearInterval(timer)
            port.removeListener('data', handleData)
            if (err !== undefined) {
                reject(err)
            } else resolve(data)
        }
        const handleData = (data) => {
            if (data.toString().includes('WBM:FLASHINFO')) {
                // console.log("Got Device Info")
                const pageSize = (data[data.length - 2] << 8) | data[data.length - 1]
                const availableSpace = (data[data.length - 6] << 24) | (data[data.length - 5] << 16) | (data[data.length - 4] << 8) | data[data.length - 3]
                exit({ pageSize, availableSpace })
            } else exit({}, new Error(`Unexpected data in getDeviceInfo ${data.toString()}`))

        }
        const timer = setTimeout(() => exit({}, new Error('getDeviceInfo timed out')), 1000);
        port.on('data', handleData)
        port.write('WBM:GETFLASHINFO')
    })
}

const upload = async(port, data) => {
    console.log("UPLOAD")
    return new Promise(async(resolve, reject) => {
        try {
            // console.log("in Upload")
            const send = await writeMcuFlash(port, data)
                // console.log('Upload Complete')
            resolve()
        } catch (error) {
            reject(error)
        }
    })
}


const tryUpload = async(port) => {
    try {
        const info = await upload(port, fileData)
        console.log(info)
    } catch (error) {
        console.log(error)
    }
}



const port = new SerialPort({ path: "COM22", baudRate: 115200 })
port.on('open', async() => {
    tryUpload(port)
})
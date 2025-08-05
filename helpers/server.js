const cluster = require('cluster')

// Only start server in master process
if (cluster.isMaster) {
    const express = require('express')
    const path = require('path')
    const http = require('http')
    const cors = require('cors')

    // SERVER CONFIG
    const PORT = process.env.PORT || 5000
    const app = express();
    const server = http.createServer(app).listen(PORT, '0.0.0.0', () => console.log(`Listening on ${PORT}\n`))
    app.use(express.static(path.join(__dirname, 'public')))
    app.use(cors({ credentials: true, origin: '*' }))
}
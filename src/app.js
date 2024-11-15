/**
 * name : app.js
 * author : Nevil Mathew
 * Date : 01-Oct-2024
 * Description : Start file of a user service
 */
require('module-alias/register')
const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const path = require('path')
require('dotenv').config({ path: './.env' })
const i18next = require('i18next')
const Backend = require('i18next-fs-backend')
const middleware = require('i18next-http-middleware')

let environmentData = require('./envVariables')()

if (!environmentData.success) {
	console.error('Server could not start . Not all environment variable is provided', {
		triggerNotification: true,
	})
	process.exit()
}
i18next
	.use(Backend)
	.use(middleware.LanguageDetector)
	.init({
		fallbackLng: 'en',
		lng: 'en',
		ns: ['translation'],
		defaultNS: 'translation',
		backend: {
			loadPath: './locales/{{lng}}.json',
		},
		detection: {
			lookupHeader: 'accept-language',
		},
	})

const app = express()

// Health check
//require('@health-checks')(app)

app.use(cors())
app.use(middleware.handle(i18next))

app.use(bodyParser.urlencoded({ extended: true, limit: '50MB' }))
app.use(bodyParser.json({ limit: '50MB' }))

app.use(express.static('public'))

app.get(process.env.API_DOC_URL, function (req, res) {
	res.sendFile(path.join(__dirname, './api-doc/index.html'))
})

/* Logs request info if environment is not development*/
app.all('*', (req, res, next) => {
	console.log('***Notification Service Request Log***', {
		request: {
			requestType: `Request Type ${req.method} for ${req.url} on ${new Date()} from `,
			requestHeaders: req.headers,
			requestBody: req.body,
			requestFiles: req.files,
		},
	})
	next()
})

/* Registered routes here */
require('./routes')(app)

// Server listens to given port
app.listen(process.env.APPLICATION_PORT, (res, err) => {
	if (err) {
		onError(err)
	}
	console.log('Environment: ' + process.env.APPLICATION_ENV)
	console.log('Application is running on the port:' + process.env.APPLICATION_PORT)
})

// Handles specific listen errors with friendly messages
function onError(error) {
	switch (error.code) {
		case 'EACCES':
			console.error(process.env.APPLICATION_PORT + ' requires elevated privileges', {
				triggerNotification: true,
			})
			process.exit(1)
		case 'EADDRINUSE':
			console.error(process.env.APPLICATION_PORT + ' is already in use', {
				triggerNotification: true,
			})
			process.exit(1)
		default:
			throw error
	}
}

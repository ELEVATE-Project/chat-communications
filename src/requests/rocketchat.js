const axios = require('axios')

const chatPlatformAxios = axios.create({
	baseURL: process.env.CHAT_PLATFORM_URL,
	headers: {
		'X-Auth-Token': process.env.CHAT_PLATFORM_ACCESS_TOKEN,
		'X-User-Id': process.env.CHAT_PLATFORM_ADMIN_USER_ID,
		'Content-Type': 'application/json',
		accept: 'application/json',
	},
})

// Common error handler
const handleError = (error) => {
	if (error.response) {
		if (error.response.status === 401) {
			console.log('Unauthorized access - check your credentials or token')
			throw new Error('unauthorized')
		}
		if (error.response.status === 400 && error.response.data.errorType === 'error-invalid-user') {
			console.log('Unauthorized error-invalid-user - check your credentials or token')

			throw new Error('invalid-users')
		}
	} else {
		console.log('Error occurred in Rocket.Chat API call::', error.message)
		throw error
	}
}

// Sign up function
exports.signup = async (name, username, password, email) => {
	try {
		const payload = {
			name,
			username,
			password,
			email,
			verified: true,
			setRandomPassword: false,
			requirePasswordChange: false,
			customFields: {},
			sendWelcomeEmail: false,
			joinDefaultChannels: false,
		}
		const response = await chatPlatformAxios.post('/api/v1/users.create', payload)
		return {
			user_id: response.data.user._id,
		}
	} catch (error) {
		return handleError(error)
	}
}

// Login function
exports.login = async (username, password) => {
	try {
		const payload = { user: username, password }
		const response = await chatPlatformAxios.post('/api/v1/login', payload)
		return {
			user_id: response.data.data.userId,
			auth_token: response.data.data.authToken,
		}
	} catch (error) {
		return handleError(error)
	}
}

// Admin login function
exports.adminLogin = async () => {
	try {
		const payload = {
			user: process.env.CHAT_PLATFORM_ADMIN_EMAIL,
			password: process.env.CHAT_PLATFORM_ADMIN_PASSWORD,
		}
		const response = await chatPlatformAxios.post('/api/v1/login', payload)
		return response.data
	} catch (error) {
		return handleError(error)
	}
}

// Initiate chat room function
exports.initiateChatRoom = async (usernames, excludeSelf = true) => {
	try {
		const payload = { usernames: usernames.join(','), excludeSelf }
		const response = await chatPlatformAxios.post('/api/v1/im.create', payload)
		//console.log('Response::', response.data)
		return {
			room: {
				room_id: response.data.room.rid,
			},
		}
	} catch (error) {
		throw handleError(error)
	}
}

exports.logout = async (userId, token) => {
	try {
		// Create a new Axios instance for sending the message with the user's token
		const userAxios = axios.create({
			baseURL: process.env.CHAT_PLATFORM_URL,
			headers: {
				'X-Auth-Token': token,
				'X-User-Id': userId,
				'Content-Type': 'application/json',
				accept: 'application/json',
			},
		})

		const response = await userAxios.post('/api/v1/logout')
		console.log('Logged out!!')
		return response.data
	} catch (error) {
		return handleError(error)
	}
}
exports.logoutOtherClients = async (userId, token) => {
	try {
		// Create a new Axios instance for sending the message with the user's token
		const userAxios = axios.create({
			baseURL: process.env.CHAT_PLATFORM_URL,
			headers: {
				'X-Auth-Token': token,
				'X-User-Id': userId,
				'Content-Type': 'application/json',
				accept: 'application/json',
			},
		})

		const response = await userAxios.post('/api/v1/users.logoutOtherClients')
		console.log('Logged out!!', response.data)
		return response.data
	} catch (error) {
		return handleError(error)
	}
}
// Send message function
exports.sendMessage = async (username, password, rid, msg) => {
	try {
		// Call the login function to get the user ID and auth token
		const loginResponse = await this.login(username, password)

		// Check if login was successful and retrieve the auth token
		if (loginResponse.auth_token) {
			const payload = {
				message: {
					rid,
					msg,
				},
			}

			// Create a new Axios instance for sending the message with the user's token
			const userAxios = axios.create({
				baseURL: process.env.CHAT_PLATFORM_URL,
				headers: {
					'X-Auth-Token': loginResponse.auth_token,
					'X-User-Id': loginResponse.user_id,
					'Content-Type': 'application/json',
					accept: 'application/json',
				},
			})

			const response = await userAxios.post('/api/v1/chat.sendMessage', payload)

			this.logout(loginResponse.user_id, loginResponse.auth_token)

			return response.data
		} else {
			throw new Error('Login failed, unable to send message')
		}
	} catch (error) {
		return handleError(error)
	}
}

exports.setAvatar = async (username, imageUrl) => {
	try {
		// Step 1: Download the image from the provided URL
		const imageResponse = await axios.get(imageUrl, {
			responseType: 'arraybuffer',
		})

		// Convert the ArrayBuffer to Blob
		const imageBuffer = Buffer.from(imageResponse.data)
		const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' })

		// Generate a timestamp for the filename
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
		const filename = `avatar-${timestamp}.jpg`

		// Step 2: Prepare the image data and username in FormData for the API request
		const form = new FormData()
		form.append('image', imageBlob, filename)
		form.append('username', username)

		// Step 3: Send the image data to the setAvatar API endpoint
		const response = await chatPlatformAxios.post(`${process.env.CHAT_PLATFORM_URL}/api/v1/users.setAvatar`, form, {
			headers: {
				'Content-Type': 'multipart/form-data',
			},
		})
		return response.data
	} catch (error) {
		return handleError(error)
	}
}

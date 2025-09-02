const axios = require('axios')
const apiEndpoints = require('@constants/endpoints')

const chatPlatformAxios = axios.create({
	baseURL: process.env.CHAT_PLATFORM_URL,
	headers: {
		'X-Auth-Token': process.env.CHAT_PLATFORM_ACCESS_TOKEN,
		'X-User-Id': process.env.CHAT_PLATFORM_ADMIN_USER_ID,
		'Content-Type': 'application/json',
		accept: 'application/json',
	},
})

// Debug: Log RocketChat configuration
console.log('=== RocketChat Configuration Debug ===')
console.log('CHAT_PLATFORM_URL:', process.env.CHAT_PLATFORM_URL)
console.log('CHAT_PLATFORM_ADMIN_USER_ID:', process.env.CHAT_PLATFORM_ADMIN_USER_ID)
console.log('CHAT_PLATFORM_ACCESS_TOKEN exists:', !!process.env.CHAT_PLATFORM_ACCESS_TOKEN)
console.log('CHAT_PLATFORM_ACCESS_TOKEN length:', process.env.CHAT_PLATFORM_ACCESS_TOKEN?.length)
console.log('=======================================')

const buildSignupPayload = (name, username, password, email) => ({
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
})

// Common error handler
const handleError = (error) => {
	if (error.response) {
		if (error.response.status === 401) {
			console.log('Unauthorized access - check your credentials or token', error.message)
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
		const payload = buildSignupPayload(name, username, password, email)

		console.log('=== RocketChat Signup Request Debug ===')
		console.log('Endpoint:', apiEndpoints.ROCKETCHAT.USERS_CREATE)
		console.log('Payload:', payload)
		console.log('Headers:', {
			'X-Auth-Token': process.env.CHAT_PLATFORM_ACCESS_TOKEN ? 'SET' : 'MISSING',
			'X-User-Id': process.env.CHAT_PLATFORM_ADMIN_USER_ID || 'MISSING',
		})
		console.log('Full URL:', process.env.CHAT_PLATFORM_URL + apiEndpoints.ROCKETCHAT.USERS_CREATE)

		const response = await chatPlatformAxios.post(apiEndpoints.ROCKETCHAT.USERS_CREATE, payload)

		console.log('=== RocketChat Signup Success ===')
		console.log('Response status:', response.status)
		console.log('User created:', response.data.user._id)

		return {
			user_id: response.data.user._id,
		}
	} catch (error) {
		console.log('=== RocketChat Signup Error ===')
		console.log('Error status:', error.response?.status)
		console.log('Error data:', error.response?.data)
		console.log('Error headers:', error.response?.headers)
		return handleError(error)
	}
}

// Update user
exports.updateUser = async (userId, name) => {
	try {
		const payload = {
			userId,
			data: { name },
		}

		const response = await chatPlatformAxios.post(apiEndpoints.ROCKETCHAT.USERS_UPDATE, payload)

		return response.data
	} catch (error) {
		return handleError(error)
	}
}

// Login function
exports.login = async (username, password) => {
	try {
		const payload = { user: username, password }

		console.log('=== RocketChat Login Request Debug ===')
		console.log('Endpoint:', apiEndpoints.ROCKETCHAT.LOGIN)
		console.log('Username:', username)
		console.log('Password length:', password?.length)
		console.log('Full URL:', process.env.CHAT_PLATFORM_URL + apiEndpoints.ROCKETCHAT.LOGIN)

		const response = await chatPlatformAxios.post(apiEndpoints.ROCKETCHAT.LOGIN, payload)

		console.log('=== RocketChat Login Success ===')
		console.log('Response status:', response.status)
		console.log('User ID:', response.data.data.userId)
		console.log('Auth token exists:', !!response.data.data.authToken)

		return {
			user_id: response.data.data.userId,
			auth_token: response.data.data.authToken,
		}
	} catch (error) {
		console.log('=== RocketChat Login Error ===')
		console.log('Error status:', error.response?.status)
		console.log('Error data:', error.response?.data)
		console.log('Error message:', error.message)
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
		const response = await chatPlatformAxios.post(apiEndpoints.ROCKETCHAT.LOGIN, payload)
		return response.data
	} catch (error) {
		return handleError(error)
	}
}

// Initiate chat room function
exports.initiateChatRoom = async (usernames, excludeSelf = true) => {
	try {
		const payload = { usernames: usernames.join(','), excludeSelf }
		const response = await chatPlatformAxios.post(apiEndpoints.ROCKETCHAT.IM_CREATE, payload)
		return {
			room: {
				room_id: response.data.room.rid,
			},
		}
	} catch (error) {
		throw handleError(error)
	}
}

// Logout function
exports.logout = async (userId, token) => {
	try {
		const response = await chatPlatformAxios.post(
			apiEndpoints.ROCKETCHAT.LOGOUT,
			{},
			{
				headers: {
					'X-Auth-Token': token,
					'X-User-Id': userId,
				},
			}
		)
		return response.data
	} catch (error) {
		return handleError(error)
	}
}

// Logout other clients function
exports.logoutOtherClients = async (userId, token) => {
	try {
		const response = await chatPlatformAxios.post(
			apiEndpoints.ROCKETCHAT.LOGOUT_OTHER_CLIENTS,
			{},
			{
				headers: {
					'X-Auth-Token': token,
					'X-User-Id': userId,
				},
			}
		)
		return response.data
	} catch (error) {
		return handleError(error)
	}
}

// Send message to a room and add to the senders DM list
exports.sendMessage = async (username, password, rid, msg) => {
	try {
		const loginResponse = await this.login(username, password)

		if (loginResponse.auth_token) {
			const payload = {
				message: {
					rid,
					msg,
				},
			}

			const response = await chatPlatformAxios.post(apiEndpoints.ROCKETCHAT.CHAT_SEND_MESSAGE, payload, {
				headers: {
					'X-Auth-Token': loginResponse.auth_token,
					'X-User-Id': loginResponse.user_id,
				},
			})
			await chatPlatformAxios.post(
				apiEndpoints.ROCKETCHAT.IM_OPEN,
				{ roomId: rid },
				{
					headers: {
						'X-Auth-Token': loginResponse.auth_token,
						'X-User-Id': loginResponse.user_id,
					},
				}
			)
			await this.logout(loginResponse.user_id, loginResponse.auth_token)

			return response.data
		} else {
			throw new Error('Login failed, unable to send message')
		}
	} catch (error) {
		return handleError(error)
	}
}

// Set avatar function
exports.setAvatar = async (username, imageUrl) => {
	try {
		const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' })
		const imageBuffer = Buffer.from(imageResponse.data)
		const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' })

		const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
		const filename = `avatar-${timestamp}.jpg`

		const form = new FormData()
		form.append('image', imageBlob, filename)
		form.append('username', username)

		const response = await chatPlatformAxios.post(apiEndpoints.ROCKETCHAT.USERS_SET_AVATAR, form, {
			headers: {
				'Content-Type': 'multipart/form-data',
			},
		})
		return response.data
	} catch (error) {
		return handleError(error)
	}
}

exports.setActiveStatus = async (activeStatus, userId, confirmRelinquish = true) => {
	try {
		const payload = {
			activeStatus,
			userId,
			confirmRelinquish,
		}

		const response = await chatPlatformAxios.post(apiEndpoints.ROCKETCHAT.USERS_SET_ACTIVE_STATUS, payload)

		return response.data
	} catch (error) {
		return handleError(error)
	}
}

// reset avatar function
exports.resetAvatar = async (username) => {
	try {
		const payload = {
			username,
		}

		const response = await chatPlatformAxios.post(apiEndpoints.ROCKETCHAT.USERS_RESET_AVATAR, payload)
		return response.data
	} catch (error) {
		return handleError(error)
	}
}

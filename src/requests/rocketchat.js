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
		console.log('[ROCKETCHAT] error response', {
			status: error.response.status,
			errorType: error.response.data?.errorType,
			error: error.response.data?.error,
			message: error.response.data?.message,
		})
		if (error.response.status === 401) {
			throw new Error('unauthorized')
		}
		if (error.response.status === 400 && error.response.data.errorType === 'error-invalid-user') {
			throw new Error('invalid-users')
		}
		// Handle other response errors
		throw new Error(`RocketChat API error: ${error.response.status}`)
	} else {
		console.log('[ROCKETCHAT] network/unknown error', { message: error.message })
		throw error
	}
}

// Sign up function
exports.signup = async (name, username, password, email) => {
	try {
		const payload = buildSignupPayload(name, username, password, email)
		console.log('[ROCKETCHAT] signup →', {
			url: apiEndpoints.ROCKETCHAT.USERS_CREATE,
			username,
			name,
			hasEmail: !!email,
		})
		const response = await chatPlatformAxios.post(apiEndpoints.ROCKETCHAT.USERS_CREATE, payload)
		console.log('[ROCKETCHAT] signup ←', {
			rcUserId: response.data.user?._id,
			username: response.data.user?.username,
		})
		return {
			user_id: response.data.user._id,
		}
	} catch (error) {
		console.log('[ROCKETCHAT] signup error', {
			username,
			status: error.response?.status,
			body: error.response?.data,
		})
		return handleError(error)
	}
}

// Update user
exports.updateUser = async (userId, name) => {
	try {
		const payload = { userId, data: { name } }
		console.log('[ROCKETCHAT] updateUser →', { url: apiEndpoints.ROCKETCHAT.USERS_UPDATE, userId, name })
		const response = await chatPlatformAxios.post(apiEndpoints.ROCKETCHAT.USERS_UPDATE, payload)
		console.log('[ROCKETCHAT] updateUser ←', { status: response.status })
		return response.data
	} catch (error) {
		console.log('[ROCKETCHAT] updateUser error', {
			userId,
			status: error.response?.status,
			body: error.response?.data,
		})
		return handleError(error)
	}
}

// Login function
exports.login = async (username, password) => {
	try {
		const payload = { user: username, password }
		console.log('[ROCKETCHAT] login →', { url: apiEndpoints.ROCKETCHAT.LOGIN, username })
		const response = await chatPlatformAxios.post(apiEndpoints.ROCKETCHAT.LOGIN, payload)
		console.log('[ROCKETCHAT] login ←', {
			status: response.status,
			rcUserId: response.data.data?.userId,
			hasAuthToken: !!response.data.data?.authToken,
		})
		return {
			user_id: response.data.data.userId,
			auth_token: response.data.data.authToken,
		}
	} catch (error) {
		console.log('[ROCKETCHAT] login error', {
			username,
			status: error.response?.status,
			body: error.response?.data,
		})
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
		console.log('[ROCKETCHAT] adminLogin →', {
			url: apiEndpoints.ROCKETCHAT.LOGIN,
			adminEmail: process.env.CHAT_PLATFORM_ADMIN_EMAIL,
		})
		const response = await chatPlatformAxios.post(apiEndpoints.ROCKETCHAT.LOGIN, payload)
		console.log('[ROCKETCHAT] adminLogin ←', { status: response.status })
		return response.data
	} catch (error) {
		console.log('[ROCKETCHAT] adminLogin error', { status: error.response?.status, body: error.response?.data })
		return handleError(error)
	}
}

// Initiate chat room function
exports.initiateChatRoom = async (usernames, excludeSelf = true) => {
	try {
		const payload = { usernames: usernames.join(','), excludeSelf }
		console.log('[ROCKETCHAT] initiateChatRoom →', {
			url: apiEndpoints.ROCKETCHAT.IM_CREATE,
			usernames: payload.usernames,
			excludeSelf,
		})
		const response = await chatPlatformAxios.post(apiEndpoints.ROCKETCHAT.IM_CREATE, payload)
		console.log('[ROCKETCHAT] initiateChatRoom ←', { roomId: response.data.room?.rid, status: response.status })
		return {
			room: {
				room_id: response.data.room.rid,
			},
		}
	} catch (error) {
		console.log('[ROCKETCHAT] initiateChatRoom error', {
			usernames,
			status: error.response?.status,
			body: error.response?.data,
		})
		throw handleError(error)
	}
}

// Logout function
exports.logout = async (userId, token) => {
	try {
		console.log('[ROCKETCHAT] logout →', { url: apiEndpoints.ROCKETCHAT.LOGOUT, userId })
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
		console.log('[ROCKETCHAT] logout ←', { status: response.status })
		return response.data
	} catch (error) {
		console.log('[ROCKETCHAT] logout error', { userId, status: error.response?.status, body: error.response?.data })
		return handleError(error)
	}
}

// Logout other clients function
exports.logoutOtherClients = async (userId, token) => {
	try {
		console.log('[ROCKETCHAT] logoutOtherClients →', { url: apiEndpoints.ROCKETCHAT.LOGOUT_OTHER_CLIENTS, userId })
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
		console.log('[ROCKETCHAT] logoutOtherClients ←', { status: response.status })
		return response.data
	} catch (error) {
		console.log('[ROCKETCHAT] logoutOtherClients error', {
			userId,
			status: error.response?.status,
			body: error.response?.data,
		})
		return handleError(error)
	}
}

// Send message to a room and add to the senders DM list
exports.sendMessage = async (username, password, rid, msg) => {
	try {
		console.log('[ROCKETCHAT] sendMessage → login first', { username, rid })
		const loginResponse = await this.login(username, password)

		if (loginResponse.auth_token) {
			const payload = {
				message: {
					rid,
					msg,
				},
			}

			console.log('[ROCKETCHAT] sendMessage → sending message', {
				url: apiEndpoints.ROCKETCHAT.CHAT_SEND_MESSAGE,
				rid,
				msgLength: msg?.length,
			})
			const response = await chatPlatformAxios.post(apiEndpoints.ROCKETCHAT.CHAT_SEND_MESSAGE, payload, {
				headers: {
					'X-Auth-Token': loginResponse.auth_token,
					'X-User-Id': loginResponse.user_id,
				},
			})
			console.log('[ROCKETCHAT] sendMessage → opening DM', { rid })
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
			console.log('[ROCKETCHAT] sendMessage ← success')
			return response.data
		} else {
			throw new Error('Login failed, unable to send message')
		}
	} catch (error) {
		console.log('[ROCKETCHAT] sendMessage error', {
			username,
			rid,
			status: error.response?.status,
			message: error.message,
		})
		return handleError(error)
	}
}

// Set avatar function
exports.setAvatar = async (username, imageUrl) => {
	try {
		console.log('[ROCKETCHAT] setAvatar → downloading image', { username, imageUrl })
		const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' })
		const imageBuffer = Buffer.from(imageResponse.data)
		const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' })

		const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
		const filename = `avatar-${timestamp}.jpg`

		const form = new FormData()
		form.append('image', imageBlob, filename)
		form.append('username', username)

		console.log('[ROCKETCHAT] setAvatar → uploading to RocketChat', {
			url: apiEndpoints.ROCKETCHAT.USERS_SET_AVATAR,
			username,
		})
		const response = await chatPlatformAxios.post(apiEndpoints.ROCKETCHAT.USERS_SET_AVATAR, form, {
			headers: {
				'Content-Type': 'multipart/form-data',
			},
		})
		console.log('[ROCKETCHAT] setAvatar ←', { status: response.status, username })
		return response.data
	} catch (error) {
		console.log('[ROCKETCHAT] setAvatar error', {
			username,
			imageUrl,
			status: error.response?.status,
			message: error.message,
		})
		return handleError(error)
	}
}

exports.setActiveStatus = async (activeStatus, userId, confirmRelinquish = true) => {
	try {
		const payload = { activeStatus, userId, confirmRelinquish }
		console.log('[ROCKETCHAT] setActiveStatus →', {
			url: apiEndpoints.ROCKETCHAT.USERS_SET_ACTIVE_STATUS,
			userId,
			activeStatus,
		})
		const response = await chatPlatformAxios.post(apiEndpoints.ROCKETCHAT.USERS_SET_ACTIVE_STATUS, payload)
		console.log('[ROCKETCHAT] setActiveStatus ←', { status: response.status, userId })
		return response.data
	} catch (error) {
		console.log('[ROCKETCHAT] setActiveStatus error', {
			userId,
			activeStatus,
			status: error.response?.status,
			body: error.response?.data,
		})
		return handleError(error)
	}
}

// reset avatar function
exports.resetAvatar = async (username) => {
	try {
		const payload = { username }
		console.log('[ROCKETCHAT] resetAvatar →', { url: apiEndpoints.ROCKETCHAT.USERS_RESET_AVATAR, username })
		const response = await chatPlatformAxios.post(apiEndpoints.ROCKETCHAT.USERS_RESET_AVATAR, payload)
		console.log('[ROCKETCHAT] resetAvatar ←', { status: response.status, username })
		return response.data
	} catch (error) {
		console.log('[ROCKETCHAT] resetAvatar error', {
			username,
			status: error.response?.status,
			body: error.response?.data,
		})
		return handleError(error)
	}
}

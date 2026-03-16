// Declare chatAPIs variable at a higher scope
let chatAPIs

// Define a map for different chat platforms
const chatPlatformModules = {
	rocketchat: '@requests/rocketchat',
}

// Get the module path based on CHAT_PLATFORM env variable
const chatPlatform = process.env.CHAT_PLATFORM
const modulePath = chatPlatformModules[chatPlatform]

// Dynamically assign to chatAPIs
if (modulePath) {
	chatAPIs = require(modulePath)
} else {
	throw new Error(`Unsupported CHAT_PLATFORM: ${chatPlatform}`)
}

const httpStatusCode = require('@generics/http-status')
const apiResponses = require('@constants/api-responses')
const responses = require('@helpers/responses')
const { usernameHash, passwordHash } = require('@generics/utils')
const userQueries = require('../database/queries/user')

/**
 * Helper class for handling communication-related operations with chat platform API.
 */
module.exports = class CommunicationHelper {
	static async signup(bodyData) {
		const tenantCode = bodyData.tenant_code
		delete bodyData.tenant_code

		console.log('[CHAT SERVICE] signup → received', {
			userId: bodyData.user_id,
			name: bodyData.name,
			hasEmail: !!bodyData.email,
			hasImage: !!bodyData.image_url,
			tenantCode,
		})

		const userExists = await userQueries.findOne({ user_id: bodyData.user_id }, tenantCode)
		if (userExists) {
			console.log('[CHAT SERVICE] signup → user already exists in DB', { userId: bodyData.user_id, tenantCode })
			return responses.failureResponse({
				statusCode: httpStatusCode.conflict,
				message: 'USER_ALREADY_EXISTS',
			})
		}

		console.log('[CHAT SERVICE] signup → user not in DB, calling RocketChat signup')
		try {
			let chatResponse = await chatAPIs.signup(
				bodyData.name,
				usernameHash(bodyData.user_id),
				passwordHash(bodyData.user_id),
				bodyData.email
			)

			console.log('[CHAT SERVICE] signup → RocketChat signup success', { rcUserId: chatResponse.user_id })

			await userQueries.create(
				{
					user_id: bodyData.user_id,
					user_info: {
						external_user_id: chatResponse.user_id,
					},
				},
				tenantCode
			)

			console.log('[CHAT SERVICE] signup → user saved to DB')

			if (bodyData.image_url) {
				console.log('[CHAT SERVICE] signup → setting avatar', { userId: bodyData.user_id })
				await chatAPIs.setAvatar(usernameHash(bodyData.user_id), bodyData.image_url)
				console.log('[CHAT SERVICE] signup → avatar set')
			}

			console.log('[CHAT SERVICE] signup ← success', { userId: bodyData.user_id, rcUserId: chatResponse.user_id })
			return responses.successResponse({
				statusCode: httpStatusCode.created,
				message: 'USER_CREATED_SUCCESSFULLY',
				result: chatResponse,
			})
		} catch (error) {
			console.log('[CHAT SERVICE] signup ← FAILED', {
				userId: bodyData.user_id,
				error: error.message,
				stack: error.stack,
			})
			return responses.failureResponse({
				statusCode: httpStatusCode.internal_server_error,
				message: 'SIGNUP_FAILED',
				responseCode: 'SERVER_ERROR',
			})
		}
	}

	static async login(bodyData) {
		const tenantCode = bodyData.tenant_code
		delete bodyData.tenant_code

		console.log('[CHAT SERVICE] login → received', { userId: bodyData.user_id, tenantCode })

		// Check if user exists in local database first
		const userExists = await userQueries.findOne({ user_id: bodyData.user_id }, tenantCode)

		if (!userExists) {
			console.log('[CHAT SERVICE] login → user NOT found in DB, returning USER_NOT_FOUND', {
				userId: bodyData.user_id,
				tenantCode,
			})
			return responses.failureResponse({
				statusCode: httpStatusCode.bad_request,
				message: 'USER_NOT_FOUND_PLEASE_SIGNUP_FIRST',
				responseCode: 'CLIENT_ERROR',
			})
		}

		console.log('[CHAT SERVICE] login → user found in DB, calling RocketChat login', {
			userId: bodyData.user_id,
			rcExternalUserId: userExists.user_info?.external_user_id,
		})

		const hashedUsername = usernameHash(bodyData.user_id)
		const hashedPassword = passwordHash(bodyData.user_id)

		try {
			let chatResponse = await chatAPIs.login(hashedUsername, hashedPassword)

			console.log('[CHAT SERVICE] login ← success', {
				userId: bodyData.user_id,
				rcUserId: chatResponse.user_id,
				hasAuthToken: !!chatResponse.auth_token,
			})
			return responses.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'LOGGED_IN',
				result: chatResponse,
			})
		} catch (error) {
			console.log('[CHAT SERVICE] login ← FAILED', { userId: bodyData.user_id, error: error.message })
			if (error.message === 'unauthorized') {
				return responses.failureResponse({
					message: apiResponses.UNAUTHORIZED_REQUEST,
					statusCode: httpStatusCode.unauthorized,
					responseCode: 'UNAUTHORIZED',
				})
			}
			return responses.failureResponse({
				statusCode: httpStatusCode.internal_server_error,
				message: 'LOGIN_FAILED',
				responseCode: 'SERVER_ERROR',
			})
		}
	}

	static async logout(bodyData) {
		const tenantCode = bodyData.tenant_code
		delete bodyData.tenant_code

		console.log('[CHAT SERVICE] logout → received', {
			userId: bodyData.user_id,
			hasToken: !!bodyData.token,
			tenantCode,
		})

		try {
			let chatResponse
			if (bodyData.token) {
				console.log('[CHAT SERVICE] logout → token-based logout')
				chatResponse = await chatAPIs.logout(bodyData.user_id, bodyData.token)
			} else {
				const userExists = await userQueries.findOne({ user_id: bodyData.user_id }, tenantCode)
				if (!userExists) {
					console.log('[CHAT SERVICE] logout → user NOT found in DB', { userId: bodyData.user_id })
					return responses.failureResponse({
						statusCode: httpStatusCode.not_found,
						message: 'USER_DOES_NOT_EXIST',
					})
				}
				console.log('[CHAT SERVICE] logout → logging in to get token, then logout all sessions')
				const loginResponse = await chatAPIs.login(
					usernameHash(bodyData.user_id),
					passwordHash(bodyData.user_id)
				)
				await chatAPIs.logoutOtherClients(loginResponse.user_id, loginResponse.auth_token)
				chatResponse = await chatAPIs.logout(loginResponse.user_id, loginResponse.auth_token)
			}
			console.log('[CHAT SERVICE] logout ← success', { userId: bodyData.user_id })
			return responses.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'LOGGED_OUT',
				result: chatResponse,
			})
		} catch (error) {
			console.log('[CHAT SERVICE] logout ← FAILED', { userId: bodyData.user_id, error: error.message })
			if (error.message === 'unauthorized') {
				return responses.failureResponse({
					message: apiResponses.UNAUTHORIZED_REQUEST,
					statusCode: httpStatusCode.unauthorized,
					responseCode: 'UNAUTHORIZED',
				})
			}
			return responses.failureResponse({
				statusCode: httpStatusCode.internal_server_error,
				message: 'LOGOUT_FAILED',
				responseCode: 'SERVER_ERROR',
			})
		}
	}

	static async createRoom(bodyData) {
		const tenantCode = bodyData.tenant_code
		delete bodyData.tenant_code

		console.log('[CHAT SERVICE] createRoom → received', {
			usernames: bodyData.usernames,
			hasInitialMessage: !!bodyData.initial_message,
			tenantCode,
		})

		try {
			const userA = usernameHash(bodyData.usernames[0])
			const userB = usernameHash(bodyData.usernames[1])
			let users = [userA, userB]

			console.log('[CHAT SERVICE] createRoom → hashed usernames', { userA, userB })
			console.log('[CHAT SERVICE] createRoom → calling initiateChatRoom')

			let chatResponse = await chatAPIs.initiateChatRoom(users)

			console.log('[CHAT SERVICE] createRoom → room created', { roomId: chatResponse?.room?.room_id })
			console.log('[CHAT SERVICE] createRoom → sending initial message to room', {
				roomId: chatResponse.room.room_id,
			})

			await chatAPIs.sendMessage(
				userA,
				passwordHash(bodyData.usernames[0]),
				chatResponse.room.room_id,
				bodyData.initial_message
			)

			console.log('[CHAT SERVICE] createRoom ← success', { roomId: chatResponse.room.room_id })
			return responses.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'CHAT_ROOM_CREATED',
				result: chatResponse,
			})
		} catch (error) {
			console.log('[CHAT SERVICE] createRoom ← FAILED', {
				usernames: bodyData.usernames,
				error: error.message,
				stack: error.stack,
			})
			if (error.message === 'invalid-users') {
				return responses.failureResponse({
					message: apiResponses.USER_DOEST_NOT_EXIST,
					statusCode: httpStatusCode.bad_request,
					responseCode: 'CLIENT_ERROR',
				})
			}
			return responses.failureResponse({
				statusCode: httpStatusCode.internal_server_error,
				message: 'ROOM_CREATION_FAILED',
				responseCode: 'SERVER_ERROR',
			})
		}
	}

	static async updateAvatar(bodyData) {
		const tenantCode = bodyData.tenant_code
		const userId = bodyData.user_id
		const imageUrl = bodyData.image_url
		delete bodyData.tenant_code

		console.log('[CHAT SERVICE] updateAvatar → received', { userId, hasImageUrl: !!imageUrl, tenantCode })

		try {
			let chatResponse = await chatAPIs.setAvatar(usernameHash(userId), imageUrl)
			console.log('[CHAT SERVICE] updateAvatar ← success', { userId })
			return responses.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'IMAGE_SET',
				result: chatResponse,
			})
		} catch (error) {
			console.log('[CHAT SERVICE] updateAvatar ← FAILED', { userId, error: error.message })
			return responses.failureResponse({
				statusCode: httpStatusCode.internal_server_error,
				message: 'AVATAR_UPDATE_FAILED',
				responseCode: 'SERVER_ERROR',
			})
		}
	}

	static async updateUser(bodyData) {
		const tenantCode = bodyData.tenant_code
		const userId = bodyData.user_id
		const name = bodyData.name
		delete bodyData.tenant_code

		console.log('[CHAT SERVICE] updateUser → received', { userId, name, tenantCode })

		const userDetails = await userQueries.findOne({ user_id: userId }, tenantCode)
		if (!userDetails) {
			console.log('[CHAT SERVICE] updateUser → user NOT found in DB', { userId, tenantCode })
			return responses.failureResponse({
				message: apiResponses.USER_DOEST_NOT_EXIST,
				statusCode: httpStatusCode.bad_request,
				responseCode: 'CLIENT_ERROR',
			})
		}

		console.log('[CHAT SERVICE] updateUser → calling RocketChat updateUser', {
			userId,
			rcExternalUserId: userDetails.user_info?.external_user_id,
		})
		try {
			await chatAPIs.updateUser(userDetails.user_info.external_user_id, name)
			console.log('[CHAT SERVICE] updateUser ← success', { userId })
			return responses.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'NAME_UPDATED',
				result: { success: true },
			})
		} catch (error) {
			console.log('[CHAT SERVICE] updateUser ← FAILED', { userId, error: error.message })
			return responses.failureResponse({
				statusCode: httpStatusCode.internal_server_error,
				message: 'USER_UPDATE_FAILED',
				responseCode: 'SERVER_ERROR',
			})
		}
	}

	static async userMapping(bodyData) {
		const tenantCode = bodyData.tenant_code
		const externalUserId = bodyData.external_user_id

		console.log('[CHAT SERVICE] userMapping → received', { externalUserId, tenantCode })

		if (!tenantCode) {
			return responses.failureResponse({
				message: 'TENANT_CODE_REQUIRED',
				statusCode: httpStatusCode.bad_request,
				responseCode: 'CLIENT_ERROR',
			})
		}

		if (!externalUserId) {
			return responses.failureResponse({
				message: 'EXTERNAL_USER_ID_REQUIRED',
				statusCode: httpStatusCode.bad_request,
				responseCode: 'CLIENT_ERROR',
			})
		}

		try {
			const userDetails = await userQueries.findUserWithJsonbFilter(
				{ user_info_external_user_id: externalUserId },
				tenantCode
			)

			if (!userDetails) {
				console.log('[CHAT SERVICE] userMapping → user NOT found', { externalUserId, tenantCode })
				return responses.failureResponse({
					message: apiResponses.USER_DOEST_NOT_EXIST,
					statusCode: httpStatusCode.bad_request,
					responseCode: 'CLIENT_ERROR',
				})
			}

			console.log('[CHAT SERVICE] userMapping ← success', { userId: userDetails.user_id, externalUserId })
			return responses.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'USER_MAPPED_SUCCESSFULLY',
				result: {
					user_id: userDetails.user_id,
					external_user_id: userDetails.user_info.external_user_id,
				},
			})
		} catch (error) {
			console.error('[CHAT SERVICE] userMapping ← FAILED', { externalUserId, error: error.message })
			return responses.failureResponse({
				statusCode: httpStatusCode.internal_server_error,
				message: 'USER_MAPPING_FAILED',
				responseCode: 'SERVER_ERROR',
			})
		}
	}

	static async setActiveStatus(bodyData) {
		const tenantCode = bodyData.tenant_code
		const userId = bodyData.user_id
		const activeStatus = bodyData.activeStatus
		const confirmRelinquish = bodyData.confirmRelinquish
		delete bodyData.tenant_code

		console.log('[CHAT SERVICE] setActiveStatus → received', {
			userId,
			activeStatus,
			confirmRelinquish,
			tenantCode,
		})

		const userDetails = await userQueries.findOne({ user_id: userId }, tenantCode)
		if (!userDetails) {
			console.log('[CHAT SERVICE] setActiveStatus → user NOT found in DB', { userId, tenantCode })
			return responses.failureResponse({
				message: apiResponses.USER_DOEST_NOT_EXIST,
				statusCode: httpStatusCode.bad_request,
				responseCode: 'CLIENT_ERROR',
			})
		}

		console.log('[CHAT SERVICE] setActiveStatus → calling RocketChat', {
			userId,
			rcExternalUserId: userDetails.user_info?.external_user_id,
			activeStatus,
		})
		try {
			await chatAPIs.setActiveStatus(activeStatus, userDetails.user_info.external_user_id, confirmRelinquish)
			console.log('[CHAT SERVICE] setActiveStatus ← success', { userId, activeStatus })
			return responses.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'STATUS_UPDATED',
				result: { success: true },
			})
		} catch (error) {
			console.log('[CHAT SERVICE] setActiveStatus ← FAILED', { userId, error: error.message })
			return responses.failureResponse({
				statusCode: httpStatusCode.internal_server_error,
				message: 'STATUS_UPDATE_FAILED',
				responseCode: 'SERVER_ERROR',
			})
		}
	}

	static async removeAvatar(bodyData) {
		const tenantCode = bodyData.tenant_code
		const userId = bodyData.user_id
		delete bodyData.tenant_code

		console.log('[CHAT SERVICE] removeAvatar → received', { userId, tenantCode })

		const userDetails = await userQueries.findOne({ user_id: userId }, tenantCode)
		if (!userDetails) {
			console.log('[CHAT SERVICE] removeAvatar → user NOT found in DB', { userId, tenantCode })
			return responses.failureResponse({
				message: apiResponses.USER_DOEST_NOT_EXIST,
				statusCode: httpStatusCode.bad_request,
				responseCode: 'CLIENT_ERROR',
			})
		}

		try {
			let chatResponse = await chatAPIs.resetAvatar(usernameHash(userId))
			console.log('[CHAT SERVICE] removeAvatar ← success', { userId })
			return responses.successResponse({
				statusCode: httpStatusCode.ok,
				message: 'IMAGE_RESET',
				result: chatResponse,
			})
		} catch (error) {
			console.log('[CHAT SERVICE] removeAvatar ← FAILED', { userId, error: error.message })
			return responses.failureResponse({
				statusCode: httpStatusCode.internal_server_error,
				message: 'AVATAR_REMOVAL_FAILED',
				responseCode: 'SERVER_ERROR',
			})
		}
	}
}

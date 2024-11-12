const communicationService = require('@services/communication')

module.exports = class Communication {
	async signup(req) {
		try {
			return await communicationService.signup(req.body)
		} catch (error) {
			return error
		}
	}

	async login(req) {
		try {
			return await communicationService.login(req.body)
		} catch (error) {
			return error
		}
	}
	async logout(req) {
		try {
			return await communicationService.logout(req.body)
		} catch (error) {
			return error
		}
	}
	async createRoom(req) {
		try {
			return await communicationService.createRoom(req.body)
		} catch (error) {
			return error
		}
	}
	async updateAvatar(req) {
		try {
			return await communicationService.updateAvatar(req.body.user_id, req.body.image_url)
		} catch (error) {
			return error
		}
	}
}

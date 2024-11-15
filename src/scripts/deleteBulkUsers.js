require('dotenv').config({ path: '../.env' })
const axios = require('axios')

// Configuration
const CHAT_URL = process.env.CHAT_PLATFORM_URL
const ACCESS_TOKEN = process.env.CHAT_PLATFORM_ACCESS_TOKEN
const ADMIN_USER_ID = process.env.CHAT_PLATFORM_ADMIN_USER_ID

// Axios instance
const apiClient = axios.create({
	baseURL: `${CHAT_URL}/api/v1`,
	headers: {
		'X-Auth-Token': ACCESS_TOKEN,
		'X-User-Id': ADMIN_USER_ID,
		'Content-Type': 'application/json',
	},
})

// Helper function to fetch all users
async function fetchAllUsers(excludedUserIds = []) {
	let users = []
	let offset = 0
	const count = 100

	try {
		while (true) {
			const { data } = await apiClient.get(`/users.list`, {
				params: { offset, count },
			})

			if (data.success) {
				const filteredUsers = data.users.filter((user) => !excludedUserIds.includes(user._id))
				users = users.concat(filteredUsers)

				if (data.users.length < count) break // No more pages
				offset += count
			} else {
				throw new Error(`Failed to fetch users: ${JSON.stringify(data)}`)
			}
		}
		console.log(`Fetched ${users.length} users.`)
		return users
	} catch (error) {
		console.error('Error fetching users:', error.message)
		return []
	}
}

// Helper function to delete a user
async function deleteUser(userId) {
	try {
		const { data } = await apiClient.post(`/users.delete`, {
			userId,
			confirmRelinquish: true,
		})
		return data.success ? { success: true, userId } : { success: false, userId }
	} catch (error) {
		return { success: false, userId, error: error.message }
	}
}

// Main function
async function manageUsers() {
	const excludedUserIds = ['qfhuNKjHrWJvWm82m', 'rocket.cat', 'gGQMHdbEJ9WPqWwdf'] // Add IDs to exclude here
	const successLog = []
	const failureLog = []

	// Fetch all users
	const users = await fetchAllUsers(excludedUserIds)

	// Log users and their details
	console.log(
		'Users fetched:',
		users.map((user) => user.name)
	)

	// Delete users
	for (const user of users) {
		const result = await deleteUser(user._id)
		if (result.success) {
			successLog.push(user.name)
		} else {
			failureLog.push({ name: user.name, error: result.error })
		}
	}

	// Log results
	console.log('\nUser Management Summary:')
	console.log(`- Users successfully deleted: ${successLog.length}`)
	console.log(`- Users failed to delete: ${failureLog.length}`)
	if (failureLog.length > 0) {
		console.log('Failed Users:')
		failureLog.forEach((fail) => console.log(`  - ${fail.name}: ${fail.error}`))
	}
	console.log('User management process completed.')
}

// Run the script
manageUsers()

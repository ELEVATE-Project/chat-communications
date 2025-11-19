require('dotenv').config({ path: '../.env' })
const axios = require('axios')

// Configuration
const CHAT_URL = process.env.CHAT_PLATFORM_URL
const ACCESS_TOKEN = process.env.CHAT_PLATFORM_ACCESS_TOKEN // Set in .env
const ADMIN_USER_ID = process.env.CHAT_PLATFORM_ADMIN_USER_ID // Set in .env

// Axios instance
const apiClient = axios.create({
	baseURL: `${CHAT_URL}/api/v1`,
	headers: {
		'X-Auth-Token': ACCESS_TOKEN,
		'X-User-Id': ADMIN_USER_ID,
		'Content-Type': 'application/json',
	},
})

// Reusable function to log results
function logResult(name, success, data = null, error = null) {
	if (success) {
		console.log(` ${name} completed successfully.`)
	} else {
		console.error(` ${name} failed.`)
		if (data) console.error('Response Data:', data)
		if (error) console.error('Error:', error.message)
	}
}

// Reusable function to call API
async function callAPI(endpoint, data, name) {
	try {
		const response = await apiClient.post(endpoint, data)
		const isSuccess = response.data && response.data.success
		logResult(name, isSuccess, response.data)
		return isSuccess
	} catch (error) {
		logResult(name, false, null, error)
		return false
	}
}

// Helper function to save settings
async function saveSettings(id, settings, name) {
	const settingsData = {
		message: JSON.stringify({
			msg: 'method',
			id,
			method: 'saveSettings',
			params: [settings],
		}),
	}
	return callAPI('/method.call/saveSettings', settingsData, name)
}

// Helper function to update permissions
async function updatePermissions(permissions, name) {
	const permissionsData = { permissions }
	return callAPI('/permissions.update', permissionsData, name)
}

// Main function to run all operations
async function run() {
	console.log(' Starting configuration...')

	await saveSettings(
		'27',
		[
			{ _id: 'Accounts_AllowUserProfileChange', value: false },
			{ _id: 'Accounts_AllowUserAvatarChange', value: false },
			{ _id: 'Accounts_AllowRealNameChange', value: false },
			{ _id: 'Accounts_AllowUserStatusMessageChange', value: false },
			{ _id: 'Accounts_AllowUsernameChange', value: false },
			{ _id: 'Accounts_AllowEmailChange', value: false },
			{ _id: 'Accounts_AllowPasswordChange', value: false },
			{ _id: 'Accounts_AllowPasswordChangeForOAuthUsers', value: false },
			{ _id: 'Accounts_AllowEmailNotifications', value: false },
		],
		'Save Settings Group 1'
	)

	await saveSettings('33', [{ _id: 'UI_Use_Real_Name', value: true }], 'Save Settings Group 2')

	await saveSettings(
		'39',
		[{ _id: 'Accounts_TwoFactorAuthentication_Enabled', value: false }],
		'Save Settings Group 4'
	)

	await saveSettings(
		'40',
		[{ _id: 'Accounts_Default_User_Preferences_hideUsernames', value: true }],
		'Save Settings Group 5'
	)

	await updatePermissions([{ _id: 'view-outside-room', roles: ['admin'] }], 'Update Permissions')

	await saveSettings(
		'50',
		[
			{ _id: 'API_Enable_CORS', value: true },
			{ _id: 'API_CORS_Origin', value: '*' }, // OR your domain
		],
		'Enable CORS'
	)

	await saveSettings(
        '65', // Use a unique ID like '60'
        [
            { _id: 'API_Enable_Rate_Limiter', value: true },
            { _id: 'API_Enable_Rate_Limiter_Limit_Calls_Default', value: 100 }, 
            { _id: 'API_Enable_Rate_Limiter_Limit_Time_Default', value: 60000 }, 
        ],
        'Configure API Rate Limiter'
    )
	

	
	console.log(' Configuration completed.')
}

// Run the script
run()

require('dotenv').config({ path: '../../.env' })
const { Sequelize } = require('sequelize')
const fs = require('fs')
const path = require('path')
const csv = require('csv-parser')
const DatabaseConnectionManager = require('./db-connection-utils')

/**
 * CSV Data Filling Script for Chat Communications Tenant Migration
 *
 * This script ONLY handles data filling using CSV lookups.
 * All schema changes (columns, indexes, foreign keys, constraints) are handled in migrations.
 *
 * USAGE:
 *   node fill-tenant-data-from-csv.js
 *
 * REQUIREMENTS:
 *   - DEFAULT_TENANT_CODE environment variable
 *   - data/user_tenant_mapping.csv file (optional - if present, used for CSV-based overwrites)
 *   - Database must be migrated first (run migrations before this script)
 */

class TenantDataFiller {
	constructor() {
		this.dbManager = new DatabaseConnectionManager({
			poolMax: 10,
			poolMin: 2,
			logging: false,
		})
		this.sequelize = this.dbManager.getSequelize()

		this.defaultTenantCode = process.env.DEFAULT_TENANT_CODE

		if (!this.defaultTenantCode) {
			throw new Error('DEFAULT_TENANT_CODE environment variable is required')
		}

		// CSV lookup cache for user-tenant mapping
		this.userTenantLookupCache = new Map()

		this.stats = {
			totalProcessed: 0,
			successfulUpdates: 0,
			failedUpdates: 0,
			startTime: Date.now(),
			csvRecords: 0,
			usersWithoutTenantCode: 0,
			usersWithTenantCode: 0,
		}

		// Only users table for chat-communications
		this.tableConfig = {
			name: 'users',
			columns: ['tenant_code'],
			titleColumn: 'user_id',
		}
	}

	async loadLookupData() {
		console.log('🔄 Loading lookup data from CSV file...')

		const possibleCsvPaths = [
			path.join(__dirname, '../../../data/user_tenant_mapping.csv'),
			path.join(__dirname, '../../data/user_tenant_mapping.csv'),
			'/var/src/data/user_tenant_mapping.csv',
			path.join(__dirname, '../../../src/data/user_tenant_mapping.csv'),
		]

		const csvPath = possibleCsvPaths.find((p) => fs.existsSync(p))

		if (!csvPath) {
			console.log('⚠️  No user_tenant_mapping.csv file found - will use default tenant code for all users')
			return 0
		}

		console.log(`📁 Found CSV file: ${csvPath}`)

		return new Promise((resolve, reject) => {
			fs.createReadStream(csvPath)
				.pipe(csv())
				.on('data', (row) => {
					const userId = String(row.user_id || '').trim()
					const tenantCode = String(row.tenant_code || '').trim()

					if (userId && tenantCode) {
						this.userTenantLookupCache.set(userId, tenantCode)
					}
				})
				.on('end', () => {
					this.stats.csvRecords = this.userTenantLookupCache.size
					console.log(`✅ CSV loaded: ${this.stats.csvRecords} user-tenant mappings`)
					resolve(this.stats.csvRecords)
				})
				.on('error', (error) => {
					console.error('❌ Error loading CSV:', error)
					reject(error)
				})
		})
	}

	async validatePrerequisites() {
		console.log('🔍 Validating prerequisites...')

		try {
			// Check if users table exists
			const tableExists = await this.sequelize.query(
				`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')`,
				{ type: Sequelize.QueryTypes.SELECT }
			)

			if (!tableExists[0].exists) {
				throw new Error('users table does not exist')
			}

			// Check if tenant_code column exists
			const columnExists = await this.sequelize.query(
				`SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'tenant_code')`,
				{ type: Sequelize.QueryTypes.SELECT }
			)

			if (!columnExists[0].exists) {
				throw new Error('tenant_code column does not exist - run migrations first')
			}

			// Check current data state
			const dataCheck = await this.sequelize.query(
				`SELECT 
					COUNT(*) as total_users,
					COUNT(tenant_code) as users_with_tenant_code,
					COUNT(*) - COUNT(tenant_code) as users_without_tenant_code
				FROM users 
				WHERE deleted_at IS NULL`,
				{ type: Sequelize.QueryTypes.SELECT }
			)

			this.stats.usersWithoutTenantCode = parseInt(dataCheck[0].users_without_tenant_code)
			this.stats.usersWithTenantCode = parseInt(dataCheck[0].users_with_tenant_code)

			console.log(`✅ Prerequisites check passed`)
			console.log(`   - Total users: ${dataCheck[0].total_users}`)
			console.log(`   - Users with tenant_code: ${this.stats.usersWithTenantCode}`)
			console.log(`   - Users without tenant_code: ${this.stats.usersWithoutTenantCode}`)

			return {
				ready: true,
				totalUsers: parseInt(dataCheck[0].total_users),
				needsUpdate: this.stats.usersWithoutTenantCode > 0,
			}
		} catch (error) {
			console.error('❌ Prerequisites validation failed:', error.message)
			throw error
		}
	}

	async fillTenantData() {
		console.log('🔄 Updating tenant_code data from CSV and defaults...')

		const transaction = await this.sequelize.transaction()

		try {
			// Determine update strategy based on CSV availability
			let usersToUpdate = []
			let updateStrategy = ''

			if (this.stats.csvRecords > 0) {
				// Strategy 1: Update users based on CSV + fill missing with defaults
				console.log('📋 CSV data available - updating specific users from CSV and filling gaps with defaults')

				// Get all users (both with and without tenant_code)
				usersToUpdate = await this.sequelize.query(
					`SELECT user_id, tenant_code FROM users WHERE deleted_at IS NULL ORDER BY user_id`,
					{
						type: Sequelize.QueryTypes.SELECT,
						transaction,
					}
				)
				updateStrategy = 'csv_and_defaults'
			} else {
				// Strategy 2: Only fill users missing tenant_code with defaults
				console.log('📋 No CSV data - filling missing tenant_code with defaults only')

				usersToUpdate = await this.sequelize.query(
					`SELECT user_id, tenant_code FROM users WHERE tenant_code IS NULL AND deleted_at IS NULL ORDER BY user_id`,
					{
						type: Sequelize.QueryTypes.SELECT,
						transaction,
					}
				)
				updateStrategy = 'defaults_only'
			}

			console.log(`📊 Found ${usersToUpdate.length} users to process`)

			if (usersToUpdate.length === 0) {
				await transaction.rollback()
				console.log('✅ No users need updates')
				return
			}

			let batchCount = 0
			const batchSize = 1000
			let updatedCount = 0
			let skippedCount = 0

			for (let i = 0; i < usersToUpdate.length; i += batchSize) {
				const batch = usersToUpdate.slice(i, i + batchSize)
				batchCount++

				console.log(
					`📦 Processing batch ${batchCount}: users ${i + 1}-${Math.min(i + batchSize, usersToUpdate.length)}`
				)

				// Process each user in the batch
				for (const user of batch) {
					const userId = user.user_id.toString()
					const currentTenantCode = user.tenant_code

					let newTenantCode = null
					let shouldUpdate = false

					if (updateStrategy === 'csv_and_defaults') {
						// Check CSV first, then decide whether to update
						if (this.userTenantLookupCache.has(userId)) {
							// User is in CSV - always update to CSV value
							newTenantCode = this.userTenantLookupCache.get(userId)
							shouldUpdate = true
						} else if (!currentTenantCode) {
							// User not in CSV but has no tenant_code - set default
							newTenantCode = this.defaultTenantCode
							shouldUpdate = true
						}
						// Users not in CSV and already have tenant_code are left unchanged
					} else if (updateStrategy === 'defaults_only') {
						// Only update users without tenant_code
						if (!currentTenantCode) {
							newTenantCode = this.defaultTenantCode
							shouldUpdate = true
						}
					}

					if (shouldUpdate && newTenantCode) {
						await this.sequelize.query(
							`UPDATE users SET tenant_code = :tenantCode WHERE user_id = :userId`,
							{
								replacements: { tenantCode: newTenantCode, userId },
								type: Sequelize.QueryTypes.UPDATE,
								transaction,
							}
						)
						updatedCount++
					} else {
						skippedCount++
					}

					this.stats.totalProcessed++

					if (this.stats.totalProcessed % 100 === 0) {
						process.stdout.write(
							`   Processed ${this.stats.totalProcessed}/${usersToUpdate.length} users (${updatedCount} updated, ${skippedCount} skipped)\r`
						)
					}
				}
			}

			this.stats.successfulUpdates = updatedCount
			console.log(`\n✅ Processing complete: ${updatedCount} users updated, ${skippedCount} users skipped`)

			await transaction.commit()
		} catch (error) {
			await transaction.rollback()
			console.error('❌ Error updating tenant data:', error)
			throw error
		}
	}

	async validateResults() {
		console.log('🔍 Validating results...')

		try {
			const finalCheck = await this.sequelize.query(
				`SELECT 
					COUNT(*) as total_users,
					COUNT(tenant_code) as users_with_tenant_code,
					COUNT(*) - COUNT(tenant_code) as users_without_tenant_code,
					COUNT(DISTINCT tenant_code) as unique_tenant_codes
				FROM users 
				WHERE deleted_at IS NULL`,
				{ type: Sequelize.QueryTypes.SELECT }
			)

			console.log(`📊 Final validation results:`)
			console.log(`   - Total users: ${finalCheck[0].total_users}`)
			console.log(`   - Users with tenant_code: ${finalCheck[0].users_with_tenant_code}`)
			console.log(`   - Users without tenant_code: ${finalCheck[0].users_without_tenant_code}`)
			console.log(`   - Unique tenant codes: ${finalCheck[0].unique_tenant_codes}`)

			const success = parseInt(finalCheck[0].users_without_tenant_code) === 0

			if (success) {
				console.log('✅ All users have tenant_code - validation passed')
			} else {
				console.log(`⚠️  ${finalCheck[0].users_without_tenant_code} users still missing tenant_code`)
			}

			return {
				success,
				totalUsers: parseInt(finalCheck[0].total_users),
				usersWithTenantCode: parseInt(finalCheck[0].users_with_tenant_code),
				usersWithoutTenantCode: parseInt(finalCheck[0].users_without_tenant_code),
				uniqueTenantCodes: parseInt(finalCheck[0].unique_tenant_codes),
			}
		} catch (error) {
			console.error('❌ Error validating results:', error)
			throw error
		}
	}

	getStats() {
		const duration = Date.now() - this.stats.startTime
		return {
			...this.stats,
			duration,
			durationFormatted: this.formatDuration(duration),
		}
	}

	formatDuration(ms) {
		const seconds = Math.floor(ms / 1000)
		const minutes = Math.floor(seconds / 60)

		if (minutes > 0) {
			return `${minutes}m ${seconds % 60}s`
		} else {
			return `${seconds}s`
		}
	}

	async close() {
		await this.dbManager.close()
	}
}

// Main execution
async function main() {
	console.log('🎯 Chat Communications - Tenant Data Filling')
	console.log('='.repeat(50))
	console.log('📋 This script fills tenant_code data using CSV lookups')
	console.log('📋 Run migrations first: npx sequelize-cli db:migrate')
	console.log('='.repeat(50))

	const filler = new TenantDataFiller()

	try {
		// Step 1: Load CSV data
		console.log('\n=== STEP 1: Loading CSV Data ===')
		const csvRecords = await filler.loadLookupData()

		// Step 2: Validate prerequisites
		console.log('\n=== STEP 2: Validating Prerequisites ===')
		const prereqResult = await filler.validatePrerequisites()

		if (!prereqResult.ready) {
			console.log('❌ Prerequisites not met - exiting')
			process.exit(1)
		}

		if (!prereqResult.needsUpdate && csvRecords === 0) {
			console.log('✅ All users already have tenant_code and no CSV updates - skipping data processing')
		} else {
			// Step 3: Process tenant data (CSV updates + fill missing)
			console.log('\n=== STEP 3: Processing Tenant Data ===')

			if (csvRecords > 0) {
				console.log(`🔄 CSV found with ${csvRecords} mappings - will update users from CSV and fill gaps`)
			} else if (prereqResult.needsUpdate) {
				console.log(
					`🔄 No CSV found - will fill ${filler.stats.usersWithoutTenantCode} users with default tenant_code`
				)
			}

			await filler.fillTenantData()
		}

		// Step 4: Validate results
		console.log('\n=== STEP 4: Validating Results ===')
		const validationResult = await filler.validateResults()

		// Step 5: Final summary
		console.log('\n=== SUMMARY ===')
		const stats = filler.getStats()
		console.log(`   Duration: ${stats.durationFormatted}`)
		console.log(`   CSV records loaded: ${csvRecords}`)
		console.log(`   Users processed: ${stats.totalProcessed}`)
		console.log(`   Successful updates: ${stats.successfulUpdates}`)
		console.log(`   Final users with tenant_code: ${validationResult.usersWithTenantCode}`)
		console.log(`   Final users without tenant_code: ${validationResult.usersWithoutTenantCode}`)

		if (validationResult.success) {
			console.log('\n✅ TENANT DATA FILLING COMPLETED SUCCESSFULLY!')
			console.log('\n📋 Next Steps:')
			console.log('   1. Verify migration completed: npx sequelize-cli db:migrate:status')
			console.log('   2. Update Sequelize models to use composite primary key')
			console.log('   3. Update application code to include tenant_code in queries')
			console.log('   4. Test application functionality with tenant isolation')
		} else {
			console.log('\n⚠️  DATA FILLING COMPLETED WITH ISSUES')
			console.log(`   ${validationResult.usersWithoutTenantCode} users still missing tenant_code`)
			console.log('   Review user_tenant_mapping.csv file for completeness')
		}
	} catch (error) {
		console.error('\n❌ TENANT DATA FILLING FAILED:', error.message)
		console.error('Stack trace:', error.stack)
		process.exit(1)
	} finally {
		await filler.close()
	}
}

// Run if called directly
if (require.main === module) {
	main()
}

module.exports = TenantDataFiller

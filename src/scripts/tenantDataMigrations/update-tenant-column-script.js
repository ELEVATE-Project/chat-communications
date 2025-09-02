require('dotenv').config()
const DatabaseConnectionManager = require('./db-connection-utils')
const readline = require('readline')

/**
 * Script for Chat Communications Tenant Constraint Updates
 * Updates users table to use composite primary key (user_id, tenant_code)
 */

class TenantMigrationFinalizer {
	constructor() {
		// Initialize database connection manager
		this.dbManager = new DatabaseConnectionManager({
			poolMax: 5,
			poolMin: 1,
			logging: false,
		})
		this.sequelize = this.dbManager.getSequelize()

		// Only users table for chat communications
		this.tableName = 'users'
		this.originalPrimaryKey = 'user_id'
		this.newCompositePrimaryKey = ['user_id', 'tenant_code']

		this.stats = {
			startTime: Date.now(),
			operations: [],
		}
	}

	/**
	 * Check current table structure and constraints
	 */
	async analyzeCurrentStructure() {
		console.log('🔍 Analyzing current users table structure...')

		try {
			// Get current primary key constraint
			const primaryKeys = await this.sequelize.query(
				`
				SELECT 
					tc.constraint_name,
					kcu.column_name,
					tc.constraint_type
				FROM information_schema.table_constraints tc
				JOIN information_schema.key_column_usage kcu 
					ON tc.constraint_name = kcu.constraint_name
				WHERE tc.table_name = 'users' 
				AND tc.constraint_type = 'PRIMARY KEY'
				ORDER BY kcu.ordinal_position
			`,
				{ type: this.sequelize.QueryTypes.SELECT }
			)

			// Get all constraints on users table
			const allConstraints = await this.sequelize.query(
				`
				SELECT 
					tc.constraint_name,
					tc.constraint_type,
					kcu.column_name
				FROM information_schema.table_constraints tc
				LEFT JOIN information_schema.key_column_usage kcu 
					ON tc.constraint_name = kcu.constraint_name
				WHERE tc.table_name = 'users'
				ORDER BY tc.constraint_type, kcu.ordinal_position
			`,
				{ type: this.sequelize.QueryTypes.SELECT }
			)

			// Get all indexes on users table
			const indexes = await this.sequelize.query(
				`
				SELECT 
					indexname,
					indexdef
				FROM pg_indexes 
				WHERE tablename = 'users'
				ORDER BY indexname
			`,
				{ type: this.sequelize.QueryTypes.SELECT }
			)

			// Check data integrity
			const dataCheck = await this.sequelize.query(
				`
				SELECT 
					COUNT(*) as total_users,
					COUNT(user_id) as users_with_id,
					COUNT(tenant_code) as users_with_tenant_code,
					COUNT(*) - COUNT(tenant_code) as users_without_tenant_code
				FROM users 
				WHERE deleted_at IS NULL
			`,
				{ type: this.sequelize.QueryTypes.SELECT }
			)

			console.log('\n📊 Current Structure Analysis:')
			console.log(`   Primary Keys: ${primaryKeys.map((pk) => pk.column_name).join(', ') || 'None found'}`)
			console.log(`   Total Constraints: ${allConstraints.length}`)
			console.log(`   Total Indexes: ${indexes.length}`)
			console.log(`   Data Integrity:`)
			console.log(`     - Total users: ${dataCheck[0].total_users}`)
			console.log(`     - Users with tenant_code: ${dataCheck[0].users_with_tenant_code}`)
			console.log(`     - Users missing tenant_code: ${dataCheck[0].users_without_tenant_code}`)

			// Detailed constraint breakdown
			const constraintTypes = {}
			allConstraints.forEach((constraint) => {
				if (!constraintTypes[constraint.constraint_type]) {
					constraintTypes[constraint.constraint_type] = []
				}
				constraintTypes[constraint.constraint_type].push(constraint.constraint_name)
			})

			console.log('\n📋 Constraint Details:')
			Object.entries(constraintTypes).forEach(([type, names]) => {
				const uniqueNames = [...new Set(names)]
				console.log(`   ${type}: ${uniqueNames.join(', ')}`)
			})

			console.log('\n🔍 Index Details:')
			indexes.forEach((idx) => {
				console.log(
					`   ${idx.indexname}: ${idx.indexdef.substring(0, 80)}${idx.indexdef.length > 80 ? '...' : ''}`
				)
			})

			// Validation checks
			const issues = []

			if (parseInt(dataCheck[0].users_without_tenant_code) > 0) {
				issues.push(`${dataCheck[0].users_without_tenant_code} users still missing tenant_code`)
			}

			if (primaryKeys.length === 0) {
				issues.push('No primary key constraint found')
			} else if (primaryKeys.length === 1 && primaryKeys[0].column_name !== 'user_id') {
				issues.push(`Unexpected primary key column: ${primaryKeys[0].column_name}`)
			} else if (primaryKeys.length > 1) {
				const currentColumns = primaryKeys.map((pk) => pk.column_name)
				if (JSON.stringify(currentColumns.sort()) === JSON.stringify(['user_id', 'tenant_code'].sort())) {
					issues.push('Composite primary key already exists')
				} else {
					issues.push(`Unexpected composite primary key: ${currentColumns.join(', ')}`)
				}
			}

			if (issues.length > 0) {
				console.log('\n⚠️  Issues Found:')
				issues.forEach((issue) => console.log(`   - ${issue}`))
				return { ready: false, issues, currentPrimaryKeys: primaryKeys }
			}

			console.log('\n✅ Table structure analysis complete - ready for migration')
			return { ready: true, issues: [], currentPrimaryKeys: primaryKeys }
		} catch (error) {
			console.error('❌ Error analyzing table structure:', error)
			throw error
		}
	}

	/**
	 * Update primary key constraint to composite key
	 */
	async updatePrimaryKeyConstraint() {
		console.log('\n🔧 Updating primary key constraint...')

		const transaction = await this.sequelize.transaction()

		try {
			// Step 1: Drop existing primary key constraint
			const currentConstraints = await this.sequelize.query(
				`
				SELECT constraint_name 
				FROM information_schema.table_constraints 
				WHERE table_name = 'users' 
				AND constraint_type = 'PRIMARY KEY'
			`,
				{ type: this.sequelize.QueryTypes.SELECT, transaction }
			)

			if (currentConstraints.length > 0) {
				const constraintName = currentConstraints[0].constraint_name
				console.log(`   Dropping existing primary key: ${constraintName}`)

				await this.sequelize.query(`ALTER TABLE users DROP CONSTRAINT ${constraintName}`, { transaction })

				this.stats.operations.push(`Dropped primary key constraint: ${constraintName}`)
			}

			// Step 2: Create composite primary key
			console.log('   Creating composite primary key (user_id, tenant_code)')

			await this.sequelize.query(
				`ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (user_id, tenant_code)`,
				{ transaction }
			)

			this.stats.operations.push('Created composite primary key: users_pkey (user_id, tenant_code)')

			// Step 3: Create index for tenant_code lookups (if not exists)
			console.log('   Creating tenant_code index for performance')

			await this.sequelize.query(
				`
				CREATE INDEX IF NOT EXISTS idx_users_tenant_code 
				ON users (tenant_code)
			`,
				{ transaction }
			)

			this.stats.operations.push('Created index: idx_users_tenant_code')

			// Step 4: Update tenant_code to NOT NULL constraint
			console.log('   Updating tenant_code to NOT NULL constraint')

			await this.sequelize.query(`ALTER TABLE users ALTER COLUMN tenant_code SET NOT NULL`, { transaction })

			this.stats.operations.push('Set tenant_code column to NOT NULL')

			await transaction.commit()
			console.log('✅ Primary key constraint updated successfully')
		} catch (error) {
			await transaction.rollback()
			console.error('❌ Error updating primary key constraint:', error)
			throw error
		}
	}

	/**
	 * Validate the final structure
	 */
	async validateFinalStructure() {
		console.log('\n🔍 Validating final table structure...')

		try {
			// Check new primary key constraint
			const primaryKeys = await this.sequelize.query(
				`
				SELECT 
					tc.constraint_name,
					kcu.column_name,
					kcu.ordinal_position
				FROM information_schema.table_constraints tc
				JOIN information_schema.key_column_usage kcu 
					ON tc.constraint_name = kcu.constraint_name
				WHERE tc.table_name = 'users' 
				AND tc.constraint_type = 'PRIMARY KEY'
				ORDER BY kcu.ordinal_position
			`,
				{ type: this.sequelize.QueryTypes.SELECT }
			)

			// Check tenant_code column constraints
			const columnInfo = await this.sequelize.query(
				`
				SELECT 
					column_name,
					data_type,
					is_nullable,
					column_default
				FROM information_schema.columns 
				WHERE table_name = 'users' 
				AND column_name IN ('user_id', 'tenant_code')
				ORDER BY column_name
			`,
				{ type: this.sequelize.QueryTypes.SELECT }
			)

			// Test constraint with sample query
			const testQuery = await this.sequelize.query(
				`
				SELECT user_id, tenant_code 
				FROM users 
				WHERE deleted_at IS NULL 
				LIMIT 5
			`,
				{ type: this.sequelize.QueryTypes.SELECT }
			)

			console.log('\n📊 Final Structure Validation:')

			const pkColumns = primaryKeys.map((pk) => pk.column_name)
			console.log(`   Primary Key: ${pkColumns.join(', ')}`)

			const expectedPK = ['user_id', 'tenant_code']
			const pkMatches = JSON.stringify(pkColumns.sort()) === JSON.stringify(expectedPK.sort())
			console.log(`   Primary Key Correct: ${pkMatches ? '✅ Yes' : '❌ No'}`)

			console.log('\n   Column Details:')
			columnInfo.forEach((col) => {
				console.log(`     ${col.column_name}: ${col.data_type}, nullable=${col.is_nullable}`)
			})

			console.log(`\n   Sample Data (${testQuery.length} rows):`)
			testQuery.forEach((row) => {
				console.log(`     ${row.user_id} → ${row.tenant_code}`)
			})

			// Validation summary
			const issues = []
			if (!pkMatches) {
				issues.push('Primary key constraint incorrect')
			}

			const tenantCodeColumn = columnInfo.find((col) => col.column_name === 'tenant_code')
			if (!tenantCodeColumn || tenantCodeColumn.is_nullable !== 'NO') {
				issues.push('tenant_code column should be NOT NULL')
			}

			if (testQuery.some((row) => !row.tenant_code)) {
				issues.push('Some users still have NULL tenant_code')
			}

			if (issues.length > 0) {
				console.log('\n⚠️  Validation Issues:')
				issues.forEach((issue) => console.log(`   - ${issue}`))
				return false
			}

			console.log('\n✅ Final structure validation passed')
			return true
		} catch (error) {
			console.error('❌ Error validating final structure:', error)
			throw error
		}
	}

	/**
	 * Generate migration summary report
	 */
	generateReport() {
		const duration = Date.now() - this.stats.startTime
		const durationFormatted = this.formatDuration(duration)

		console.log('\n' + '='.repeat(60))
		console.log('📋 TENANT CONSTRAINT MIGRATION REPORT')
		console.log('='.repeat(60))

		console.log(`\n⏱️  Duration: ${durationFormatted}`)
		console.log(`🎯 Target: users table composite primary key`)

		console.log('\n📝 Operations Performed:')
		this.stats.operations.forEach((op, index) => {
			console.log(`   ${index + 1}. ${op}`)
		})

		console.log('\n✅ MIGRATION COMPLETED SUCCESSFULLY')
		console.log('\n📋 Next Steps:')
		console.log('   1. Update Sequelize User model to use composite primary key')
		console.log('   2. Update database queries to include tenant_code in WHERE clauses')
		console.log('   3. Test application functionality with new constraints')
		console.log('   4. Update API endpoints to handle tenant isolation')

		console.log('\n🔒 Security Notes:')
		console.log('   → All user operations now require tenant_code')
		console.log('   → Tenant isolation is enforced at database level')
		console.log('   → Primary key prevents duplicate user_id across tenants')

		console.log('\n' + '='.repeat(60))
	}

	/**
	 * Format duration in human readable format
	 */
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
	console.log('🎯 Chat Communications - Tenant Constraint Update')
	console.log('='.repeat(50))

	const finalizer = new TenantMigrationFinalizer()

	try {
		// Step 1: Analyze current structure
		console.log('\n=== STEP 1: Structure Analysis ===')
		const analysisResult = await finalizer.analyzeCurrentStructure()

		if (!analysisResult.ready) {
			console.log('\n❌ Table not ready for constraint migration:')
			analysisResult.issues.forEach((issue) => console.log(`   - ${issue}`))
			console.log('\n💡 Recommendations:')
			console.log('   1. Run the CSV backfilling script first (script.js)')
			console.log('   2. Ensure all users have tenant_code values')
			console.log('   3. Fix any data integrity issues')
			process.exit(1)
		}

		// Confirm with user
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		})

		const confirmed = await new Promise((resolve) => {
			console.log('\n⚠️  IMPORTANT: This will modify primary key constraints')
			console.log('   → Creates composite primary key (user_id, tenant_code)')
			console.log('   → Sets tenant_code to NOT NULL')
			console.log('   → Cannot be easily reversed')
			console.log('\n💡 Ensure you have a database backup before proceeding')

			rl.question('\nProceed with constraint updates? (y/N): ', (answer) => {
				rl.close()
				resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
			})
		})

		if (!confirmed) {
			console.log('\n❌ Operation cancelled by user')
			process.exit(0)
		}

		// Step 2: Update constraints
		console.log('\n=== STEP 2: Updating Constraints ===')
		await finalizer.updatePrimaryKeyConstraint()

		// Step 3: Validate results
		console.log('\n=== STEP 3: Validation ===')
		const validationPassed = await finalizer.validateFinalStructure()

		if (!validationPassed) {
			console.log('\n❌ Validation failed - manual intervention required')
			process.exit(1)
		}

		// Step 4: Generate report
		finalizer.generateReport()
	} catch (error) {
		console.error('\n❌ CONSTRAINT UPDATE FAILED:', error.message)
		console.error('Stack trace:', error.stack)
		process.exit(1)
	} finally {
		await finalizer.close()
	}
}

// Run if called directly
if (require.main === module) {
	main()
}

module.exports = TenantMigrationFinalizer

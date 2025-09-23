const core = require('@actions/core');
const github = require('@actions/github');
const { exec, getExecOutput } = require('@actions/exec');
const tc = require('@actions/tool-cache');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Download and extract sqldef binary for the specified database type
 */
async function downloadSqldef(databaseType, version) {
  const platform = os.platform();
  const arch = os.arch();
  
  // Map platform and architecture to sqldef naming convention
  let osName, archName;
  
  if (platform === 'linux') {
    osName = 'linux';
  } else if (platform === 'darwin') {
    osName = 'darwin';
  } else if (platform === 'win32') {
    osName = 'windows';
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  
  if (arch === 'x64') {
    archName = 'amd64';
  } else if (arch === 'arm64') {
    archName = 'arm64';
  } else if (arch === 'arm') {
    archName = 'arm';
  } else if (arch === 'ia32') {
    archName = '386';
  } else {
    throw new Error(`Unsupported architecture: ${arch}`);
  }
  
  // Map database type to binary name
  const binaryMap = {
    'mysql': 'mysqldef',
    'postgresql': 'psqldef',
    'sqlite3': 'sqlite3def',
    'mssql': 'mssqldef'
  };
  
  const binaryName = binaryMap[databaseType];
  if (!binaryName) {
    throw new Error(`Unsupported database type: ${databaseType}`);
  }
  
  // Construct download URL
  const extension = osName === 'windows' ? 'zip' : 'tar.gz';
  const fileName = `${binaryName}_${osName}_${archName}.${extension}`;
  const downloadUrl = `https://github.com/sqldef/sqldef/releases/download/${version}/${fileName}`;
  
  core.info(`Downloading ${binaryName} from ${downloadUrl}`);
  
  // Download and extract
  const downloadPath = await tc.downloadTool(downloadUrl);
  
  let extractedPath;
  if (extension === 'zip') {
    extractedPath = await tc.extractZip(downloadPath);
  } else {
    extractedPath = await tc.extractTar(downloadPath, undefined, 'z');
  }
  
  // Find the binary in the extracted directory
  const binaryPath = path.join(extractedPath, binaryName + (osName === 'windows' ? '.exe' : ''));
  
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Binary not found at ${binaryPath}`);
  }
  
  // Make executable on Unix-like systems
  if (osName !== 'windows') {
    await exec('chmod', ['+x', binaryPath]);
  }
  
  return binaryPath;
}

/**
 * Build sqldef command arguments based on database type and inputs
 */
function buildSqldefArgs(databaseType, inputs, options = {}) {
  const args = [];
  
  // Database-specific connection parameters
  switch (databaseType) {
    case 'mysql':
      if (inputs['mysql-host']) args.push('--host', inputs['mysql-host']);
      if (inputs['mysql-port']) args.push('--port', inputs['mysql-port']);
      if (inputs['mysql-user']) args.push('--user', inputs['mysql-user']);
      if (inputs['mysql-password']) args.push('--password', inputs['mysql-password']);
      if (inputs['mysql-database']) args.push(inputs['mysql-database']);
      break;
      
    case 'postgresql':
      if (inputs['postgresql-host']) args.push('--host', inputs['postgresql-host']);
      if (inputs['postgresql-port']) args.push('--port', inputs['postgresql-port']);
      if (inputs['postgresql-user']) args.push('--user', inputs['postgresql-user']);
      if (inputs['postgresql-password']) args.push('--password', inputs['postgresql-password']);
      if (inputs['postgresql-database']) args.push(inputs['postgresql-database']);
      break;
      
    case 'sqlite3':
      if (inputs['sqlite3-file']) args.push(inputs['sqlite3-file']);
      break;
      
    case 'mssql':
      if (inputs['mssql-host']) args.push('--host', inputs['mssql-host']);
      if (inputs['mssql-port']) args.push('--port', inputs['mssql-port']);
      if (inputs['mssql-user']) args.push('--user', inputs['mssql-user']);
      if (inputs['mssql-password']) args.push('--password', inputs['mssql-password']);
      if (inputs['mssql-database']) args.push(inputs['mssql-database']);
      break;
      
    default:
      throw new Error(`Unsupported database type: ${databaseType}`);
  }
  
  // Common options
  if (options.dryRun) {
    args.push('--dry-run');
  }
  
  if (inputs['enable-drop'] === 'true') {
    args.push('--enable-drop');
  }
  
  if (inputs['config-file']) {
    args.push('--config', inputs['config-file']);
  }
  
  // File input
  if (inputs['schema-file']) {
    args.push('--file', inputs['schema-file']);
  }
  
  return args;
}

/**
 * Run sqldef command and capture output
 */
async function runSqldef(binaryPath, args) {
  let output = '';
  let error = '';
  
  const options = {
    listeners: {
      stdout: (data) => {
        output += data.toString();
      },
      stderr: (data) => {
        error += data.toString();
      }
    },
    silent: true,
    ignoreReturnCode: true
  };
  
  const exitCode = await exec(binaryPath, args, options);
  
  return {
    exitCode,
    stdout: output,
    stderr: error
  };
}

/**
 * Comment the migration plan on the PR
 */
async function commentOnPR(octokit, context, migrationPlan, hasChanges) {
  if (!context.payload.pull_request) {
    core.info('Not a pull request, skipping comment');
    return;
  }
  
  const { owner, repo } = context.repo;
  const pull_number = context.payload.pull_request.number;
  
  let commentBody;
  
  if (!hasChanges) {
    commentBody = `## 🟢 SQLDef Preview - No Changes

No database schema changes detected.
`;
  } else {
    commentBody = `## 📋 SQLDef Preview - Migration Plan

The following database schema changes will be applied:

\`\`\`sql
${migrationPlan}
\`\`\`

_Generated by [sqldef-preview-action](https://github.com/gfx/sqldef-preview-action)_
`;
  }
  
  try {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pull_number,
      body: commentBody
    });
    
    core.info('Successfully commented on PR');
  } catch (err) {
    core.warning(`Failed to comment on PR: ${err.message}`);
  }
}

/**
 * Main action logic
 */
async function run() {
  try {
    // Get inputs
    const databaseType = core.getInput('database-type', { required: true });
    const schemaFile = core.getInput('schema-file', { required: true });
    const baseBranch = core.getInput('base-branch') || 'main';
    const sqldefVersion = core.getInput('sqldef-version') || 'v3.0.0';
    const githubToken = core.getInput('github-token') || process.env.GITHUB_TOKEN;
    
    // Validate database type
    const supportedTypes = ['mysql', 'postgresql', 'sqlite3', 'mssql'];
    if (!supportedTypes.includes(databaseType)) {
      throw new Error(`Unsupported database type: ${databaseType}. Supported types: ${supportedTypes.join(', ')}`);
    }
    
    // Collect all inputs
    const inputs = {};
    const inputNames = [
      'mysql-host', 'mysql-port', 'mysql-user', 'mysql-password', 'mysql-database',
      'postgresql-host', 'postgresql-port', 'postgresql-user', 'postgresql-password', 'postgresql-database',
      'sqlite3-file',
      'mssql-host', 'mssql-port', 'mssql-user', 'mssql-password', 'mssql-database',
      'enable-drop', 'config-file', 'schema-file'
    ];
    
    for (const inputName of inputNames) {
      inputs[inputName] = core.getInput(inputName);
    }
    
    core.info(`Database type: ${databaseType}`);
    core.info(`Schema file: ${schemaFile}`);
    core.info(`Base branch: ${baseBranch}`);
    core.info(`SQLDef version: ${sqldefVersion}`);
    core.info(`Platform: ${process.platform}, Architecture: ${process.arch}`);
    
    // Check if schema file exists
    if (!fs.existsSync(schemaFile)) {
      throw new Error(`Schema file not found: ${schemaFile}`);
    }
    
    // Download sqldef binary
    core.info('Downloading sqldef binary...');
    let binaryPath;
    try {
      binaryPath = await downloadSqldef(databaseType, sqldefVersion);
      core.info(`Downloaded sqldef binary to: ${binaryPath}`);
    } catch (downloadError) {
      throw new Error(`Failed to download sqldef binary: ${downloadError.message}. Please check if the specified version (${sqldefVersion}) is available for your platform.`);
    }
    
    // Store current branch - handle different GitHub Actions contexts
    let currentBranch = process.env.GITHUB_HEAD_REF; // For pull requests
    if (!currentBranch) {
      currentBranch = process.env.GITHUB_REF_NAME; // For push events
    }
    if (!currentBranch) {
      // Fallback: get current branch from git
      try {
        const { stdout } = await getExecOutput('git', ['branch', '--show-current']);
        currentBranch = stdout.trim();
      } catch (err) {
        core.warning(`Could not determine current branch: ${err.message}`);
        currentBranch = 'HEAD';
      }
    }
    
    core.info(`Current branch: ${currentBranch}`);
    
    // Only checkout base branch if we're not already on it and it exists
    let baselineApplied = false;
    if (currentBranch !== baseBranch) {
      core.info(`Checking out base branch: ${baseBranch}`);
      try {
        // Check if base branch exists remotely
        await exec('git', ['fetch', 'origin', baseBranch]);
        
        // Try to checkout the base branch
        try {
          await exec('git', ['checkout', baseBranch]);
          
          // Apply schema to base branch (establish baseline state)
          core.info('Applying schema to base branch to establish baseline state');
          const baseArgs = buildSqldefArgs(databaseType, inputs);
          const baseResult = await runSqldef(binaryPath, baseArgs);
          
          if (baseResult.exitCode !== 0) {
            core.warning(`Failed to apply base schema: ${baseResult.stderr}`);
            core.warning('This might be expected if the database doesn\'t exist yet or is empty');
          } else {
            core.info('Successfully applied base schema');
            baselineApplied = true;
          }
          
          // Checkout back to the PR branch
          core.info(`Checking out back to branch: ${currentBranch}`);
          await exec('git', ['checkout', currentBranch]);
        } catch (checkoutError) {
          core.warning(`Could not checkout base branch ${baseBranch}: ${checkoutError.message}`);
          core.info('Continuing with migration preview on current branch');
        }
      } catch (fetchError) {
        core.warning(`Could not fetch base branch ${baseBranch}: ${fetchError.message}`);
        core.info('Base branch does not exist remotely, continuing with migration preview on current branch');
      }
    } else {
      core.info('Already on base branch, skipping baseline setup');
      // If we're on the base branch, try to apply the schema as baseline
      try {
        core.info('Applying current schema as baseline since we are on the base branch');
        const baseArgs = buildSqldefArgs(databaseType, inputs);
        const baseResult = await runSqldef(binaryPath, baseArgs);
        
        if (baseResult.exitCode !== 0) {
          core.warning(`Failed to apply current schema as baseline: ${baseResult.stderr}`);
        } else {
          core.info('Successfully applied current schema as baseline');
          baselineApplied = true;
        }
      } catch (baselineError) {
        core.warning(`Failed to establish baseline: ${baselineError.message}`);
      }
    }
    
    // Run dry-run to preview changes
    core.info('Running sqldef --dry-run to preview changes');
    const dryRunArgs = buildSqldefArgs(databaseType, inputs, { dryRun: true });
    const dryRunResult = await runSqldef(binaryPath, dryRunArgs);
    
    if (dryRunResult.exitCode !== 0) {
      // Log the full error for debugging but still try to extract useful info
      core.error(`sqldef --dry-run failed with exit code ${dryRunResult.exitCode}`);
      core.error(`stderr: ${dryRunResult.stderr}`);
      core.error(`stdout: ${dryRunResult.stdout}`);
      throw new Error(`sqldef --dry-run failed: ${dryRunResult.stderr || 'Unknown error'}`);
    }
    
    const migrationPlan = dryRunResult.stdout.trim();
    const hasChanges = migrationPlan.length > 0 && 
                      !migrationPlan.includes('Nothing is modified') &&
                      !migrationPlan.includes('-- Nothing to apply --');
    
    core.info(`Has changes: ${hasChanges}`);
    if (hasChanges) {
      core.info(`Migration plan preview:\n${migrationPlan}`);
    } else {
      core.info('No schema changes detected');
    }
    
    // Set outputs
    core.setOutput('migration-plan', migrationPlan);
    core.setOutput('has-changes', hasChanges.toString());
    
    // Comment on PR if GitHub token is provided
    if (githubToken && github.context.payload.pull_request) {
      const octokit = github.getOctokit(githubToken);
      await commentOnPR(octokit, github.context, migrationPlan, hasChanges);
    } else if (!github.context.payload.pull_request) {
      core.info('Not running in a pull request context, skipping PR comment');
    } else if (!githubToken) {
      core.info('No GitHub token provided, skipping PR comment');
    }
    
    core.info('SQLDef preview completed successfully');
    
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
    core.error(`Full error: ${error.stack}`);
  }
}

// Run the action
if (require.main === module) {
  run();
}

module.exports = { run, downloadSqldef, buildSqldefArgs };
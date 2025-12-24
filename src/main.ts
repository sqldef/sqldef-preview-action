import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import * as tc from "@actions/tool-cache";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface CommandConfig {
    command: string;
    args: string[];
    env: Record<string, string>;
}

async function downloadSqldef(command: string, version: string): Promise<string> {
    const platform = os.platform();
    const arch = os.arch();

    let osName = "";
    let archName = "";

    switch (platform) {
        case "linux":
            osName = "linux";
            break;
        case "darwin":
            osName = "darwin";
            break;
        case "win32":
            osName = "windows";
            break;
        default:
            throw new Error(`Unsupported platform: ${platform}`);
    }

    switch (arch) {
        case "x64":
            archName = "amd64";
            break;
        case "arm64":
            archName = "arm64";
            break;
        default:
            throw new Error(`Unsupported architecture: ${arch}`);
    }

    // Support "latest" version with special URL pattern
    // When version is "latest", use /releases/latest/download/ path
    // Otherwise use the standard /releases/download/{version}/ path
    let downloadUrl: string;
    if (version === "latest") {
        downloadUrl = `https://github.com/sqldef/sqldef/releases/latest/download/${command}_${osName}_${archName}.tar.gz`;
    } else {
        downloadUrl = `https://github.com/sqldef/sqldef/releases/download/${version}/${command}_${osName}_${archName}.tar.gz`;
    }

    core.info(`Downloading ${command} ${version} from ${downloadUrl}`);

    const downloadPath = await tc.downloadTool(downloadUrl);
    const extractedPath = await tc.extractTar(downloadPath);

    const toolPath = await tc.cacheDir(extractedPath, command, version);
    const binaryPath = path.join(toolPath, command);

    fs.chmodSync(binaryPath, 0o755);

    return binaryPath;
}

function getCommandConfig(command: string): CommandConfig {
    const config: CommandConfig = {
        command: "",
        args: [],
        env: {},
    };

    const schemaFile = core.getInput("schema-file", { required: true });
    const configFile = core.getInput("config-file");

    switch (command) {
        case "psqldef": {
            const user = core.getInput("pg-user");
            const password = core.getInput("pg-password");
            const host = core.getInput("pg-host") || "localhost";
            const port = core.getInput("pg-port") || "5432";
            const database = core.getInput("pg-database");

            config.args.push("-h", host, "-p", port);
            if (user) config.args.push("-U", user);
            if (password) {
                config.env.PGPASSWORD = password;
                core.setSecret(password);
            }
            if (database) config.args.push(database);
            break;
        }
        case "mysqldef": {
            const user = core.getInput("mysql-user");
            const password = core.getInput("mysql-password");
            const host = core.getInput("mysql-host") || "127.0.0.1";
            const port = core.getInput("mysql-port") || "3306";
            const database = core.getInput("mysql-database");

            config.args.push("-h", host, "-P", port);
            if (user) config.args.push("-u", user);
            // Use environment variable for password (works with empty passwords)
            // This avoids command line parsing issues with -p flag
            if (password) {
                config.env.MYSQL_PWD = password;
                core.setSecret(password);
            }
            if (database) config.args.push(database);
            break;
        }
        case "sqlite3def": {
            const database = core.getInput("sqlite-database");
            if (database) config.args.push(database);
            break;
        }
        case "mssqldef": {
            const user = core.getInput("mssql-user");
            const password = core.getInput("mssql-password");
            const host = core.getInput("mssql-host") || "localhost";
            const port = core.getInput("mssql-port") || "1433";
            const database = core.getInput("mssql-database");

            // For mssqldef: -p is port, -P is password (opposite of mysqldef!)
            config.args.push("-h", host, "-p", port);
            if (user) config.args.push("-U", user);
            // Add -P flag for password if provided
            if (password) {
                config.args.push(`-P${password}`);
                core.setSecret(password);
            }
            if (database) config.args.push(database);
            break;
        }
        default:
            throw new Error(`Unsupported command: ${command}`);
    }

    if (configFile) {
        config.args.push("--config", configFile);
    }

    config.args.push("--file", schemaFile);

    return config;
}

async function getSchemaFromBranch(branch: string, schemaFile: string): Promise<string> {
    const tempFile = path.join(os.tmpdir(), `schema-${branch.replace(/\//g, "-")}-${Date.now()}.sql`);

    // Create empty file first to ensure it exists
    fs.writeFileSync(tempFile, "");

    const exitCode = await exec.exec("git", ["show", `${branch}:${schemaFile}`], {
        silent: true,
        ignoreReturnCode: true,
        listeners: {
            stdout: (data: Buffer) => {
                fs.appendFileSync(tempFile, data);
            },
            stderr: (data: Buffer) => {
                // Log stderr for debugging but don't fail
                core.debug(`git show stderr: ${data.toString()}`);
            },
        },
    });

    if (exitCode !== 0) {
        // If the file doesn't exist in the base branch, return empty schema
        core.warning(`Could not find ${schemaFile} in ${branch}, using empty baseline schema`);
        // Return empty string to signal no baseline exists
        fs.unlinkSync(tempFile);
        return "";
    }

    return tempFile;
}

async function runSqldef(binaryPath: string, config: CommandConfig): Promise<string> {
    let output = "";
    let stderr = "";

    const execEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
            execEnv[key] = value;
        }
    }
    Object.assign(execEnv, config.env);

    const exitCode = await exec.exec(binaryPath, config.args, {
        env: execEnv,
        silent: false,
        ignoreReturnCode: true,
        listeners: {
            stdout: (data: Buffer) => {
                output += data.toString();
            },
            stderr: (data: Buffer) => {
                stderr += data.toString();
            },
        },
    });

    if (exitCode !== 0) {
        if (stderr) {
            core.error(`Command stderr: ${stderr}`);
        }
        if (output) {
            core.info(`Command stdout: ${output}`);
        }
        throw new Error(`Command failed with exit code ${exitCode}`);
    }

    return output + stderr;
}

async function createComment(sqldefOutput: string, command: string, versionOutput: string, schemaFile: string): Promise<void> {
    const context = github.context;

    if (context.eventName !== "pull_request") {
        core.warning("Not a pull request event, skipping comment");
        return;
    }

    const githubToken = core.getInput("github-token");
    const octokit = github.getOctokit(githubToken);

    try {
        const { data: comments } = await octokit.rest.issues.listComments({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: context.payload.pull_request!.number,
        });

        // Create a unique ID for this command/schema combination
        const commentId = `${command}-${schemaFile}`;
        const htmlCommentId = `<!-- sqldef-preview-action-id: ${commentId} -->`;

        // Find previous comment by searching for the HTML comment ID
        const previousComment = comments.find(
            (comment) => comment.user?.type === "Bot" && comment.body?.includes(htmlCommentId),
        );

        const title = "SQLDef Migration Preview";

        const infoLine = `This migration was generated by \`${command} ${versionOutput}\` using the schema file \`${schemaFile}\`.`;

        const repository = process.env.GITHUB_REPOSITORY!;
        const runId = process.env.GITHUB_RUN_ID!;
        const workflow = process.env.GITHUB_WORKFLOW!;

        const runLink = `[${workflow}](https://github.com/${repository}/actions/runs/${runId})`;

        const commentBody = `
${htmlCommentId}
## ${title}

${infoLine}

~~~sql
${sqldefOutput}
~~~

This comment was generated by ${runLink}, powered by [sqldef/sqldef-preview-action](https://github.com/sqldef/sqldef-preview-action).
`.trimStart();

        if (previousComment) {
            core.info(`Updating previous comment with ID: ${previousComment.id}`);
            await octokit.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: previousComment.id,
                body: commentBody,
            });
        } else {
            core.info("Creating new comment");
            await octokit.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.payload.pull_request!.number,
                body: commentBody,
            });
        }
    } catch (error) {
        // Handle permission errors gracefully for fork PRs
        // GitHub restricts write permissions for pull_request events from forks
        if (error instanceof Error && "status" in error && (error as { status: number }).status === 403) {
            core.warning(
                "Unable to post PR comment due to insufficient permissions. " +
                    "This is expected for pull requests from forks. " +
                    "The schema preview was generated successfully but the comment could not be posted.",
            );
            return;
        }
        throw error;
    }
}

async function run(): Promise<void> {
    try {
        const command = core.getInput("command", { required: true });
        const version = core.getInput("version");
        const schemaFile = core.getInput("schema-file", { required: true });
        const baselineSchemaFile = core.getInput("baseline-schema-file");

        core.info(`Running SQLDef Preview with ${command} ${version}`);

        const binaryPath = await downloadSqldef(command, version);
        core.info(`Downloaded ${command} to ${binaryPath}`);

        core.info(`Verifying ${command} binary...`);
        let versionOutput = "";
        await exec.exec(binaryPath, ["--version"], {
            silent: false,
            listeners: {
                stdout: (data: Buffer) => {
                    versionOutput += data.toString().trim();
                },
            },
        });

        const config = getCommandConfig(command);

        const context = github.context;

        // Use baseline comparison when:
        // 1. It's a pull request event AND no baseline file is provided
        // 2. A baseline file is explicitly provided
        if ((context.eventName === "pull_request" && !baselineSchemaFile) || baselineSchemaFile) {
            let actualBaselineFile = baselineSchemaFile;

            if (!actualBaselineFile) {
                const baseBranch = context.payload.pull_request!.base.ref;
                core.info(`Fetching base branch: ${baseBranch}`);
                await exec.exec("git", ["fetch", "origin", baseBranch]);

                core.info("Getting baseline schema from base branch");
                actualBaselineFile = await getSchemaFromBranch(`origin/${baseBranch}`, schemaFile);
            } else {
                core.info(`Using provided baseline schema file: ${actualBaselineFile}`);
            }

            if (!actualBaselineFile) {
                core.setFailed("No baseline schema found, skipping baseline application");
                return;
            }

            const baselineConfig = { ...config };
            baselineConfig.args = baselineConfig.args.map((arg) => (arg === schemaFile ? actualBaselineFile : arg));

            core.info("Applying baseline schema to database");
            await runSqldef(binaryPath, baselineConfig);

            core.info("Applying desired schema to database");
            const output = await runSqldef(binaryPath, config);

            if (context.eventName === "pull_request") {
                await createComment(output.trim() || "No schema changes detected.", command, versionOutput, schemaFile);
            }

            if (!baselineSchemaFile && fs.existsSync(actualBaselineFile)) {
                fs.unlinkSync(actualBaselineFile);
            }
        } else {
            core.info("Applying with current schema");
            await runSqldef(binaryPath, config);
        }
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        } else {
            core.setFailed("An unknown error occurred");
        }
    }
}

run();
